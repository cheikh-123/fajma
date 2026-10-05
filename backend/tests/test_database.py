"""
Base de données : les dossiers médicaux et les paiements ne disparaissent jamais par suppression en cascade
d'un compte ou d'une fiche médecin (obligation de conservation) ; l'effacement passe par l'anonymisation.
"""

from django.db.models import ProtectedError

from accounts.erasure import anonymize_patient
from accounts.models import User
from appointments.models import Appointment
from directory.models import Doctor
from medical.models import MedicalRecord
from payments.models import Payment

from .test_security import ApiTestCase


class RecordProtectionTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        MedicalRecord.objects.create(appointment=self.appt, patient=self.p1, doctor=self.doctor, summary="Suivi")
        Payment.objects.create(appointment=self.appt, patient=self.p1, amount=15000, method="wave", reference="PROT-1")

    def test_patient_account_cannot_be_hard_deleted(self):
        with self.assertRaises(ProtectedError):
            User.objects.filter(pk=self.p1.pk).delete()
        self.assertEqual(MedicalRecord.objects.count(), 1)

    def test_doctor_profile_cannot_be_hard_deleted(self):
        with self.assertRaises(ProtectedError):
            Doctor.objects.filter(pk=self.doctor.pk).delete()
        self.assertTrue(Appointment.objects.filter(pk=self.appt.pk).exists())

    def test_erasure_keeps_records_for_the_doctor(self):
        anonymize_patient(self.p1)
        self.assertEqual(User.objects.get(pk=self.p1.pk).full_name, "Compte supprimé")
        self.assertEqual(MedicalRecord.objects.get().summary, "Suivi")  # conservé chez le médecin
        self.assertEqual(Payment.objects.count(), 1)  # pièce comptable conservée


class DataTransferTests(ApiTestCase):
    def test_loading_data_does_not_invent_history(self):
        """Transfert SQLite → PostgreSQL (dumpdata / loaddata) : l'historique d'origine seulement, rien d'inventé."""
        from django.core import serializers

        from appointments.models import AppointmentEvent

        appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        dump = serializers.serialize("json", [appt])
        AppointmentEvent.objects.all().delete()
        Appointment.objects.filter(pk=appt.pk).update(status="cancelled")
        for obj in serializers.deserialize("json", dump):
            obj.save()  # chargement « brut », comme loaddata
        self.assertEqual(Appointment.objects.get(pk=appt.pk).status, appt.status)
        self.assertFalse(AppointmentEvent.objects.exists())


class ServerMoveFilesTests(ApiTestCase):
    """Déménagement : les fichiers chiffrés se copient tels quels ; ils ne se relisent qu'avec la même clé."""

    def test_copied_files_need_the_same_key(self):
        import base64
        import shutil
        import tempfile

        from django.test import override_settings

        from medical.models import MedicalDocument
        from sunusante import uploads

        old_server, new_server = tempfile.mkdtemp(), tempfile.mkdtemp()
        key = "Y2ktb25seS1ub3QtYS1yZWFsLWtleS0wMTIzNDU2Nzg="
        other_key = "b3RoZXItbm90LWEtcmVhbC1rZXktMDEyMzQ1Njc4OWE="
        pdf = b"%PDF-1.4 resultats"
        try:
            with override_settings(PRIVATE_MEDIA_ROOT=old_server, FILE_ENCRYPTION_KEYS=[key]):
                uploads._cipher.cache_clear()
                self.client_for(self.p1).post(
                    "/api/documents/",
                    {"title": "Bilan", "file_name": "b.pdf", "content_base64": base64.b64encode(pdf).decode()},
                    format="json",
                )
            doc = MedicalDocument.objects.get()
            shutil.copytree(old_server, new_server, dirs_exist_ok=True)  # copie des fichiers vers le nouveau serveur
            url = f"/api/documents/{doc.id}/download"
            with override_settings(PRIVATE_MEDIA_ROOT=new_server, FILE_ENCRYPTION_KEYS=[key]):
                uploads._cipher.cache_clear()
                res = self.client_for(self.p1).get(url)
                self.assertEqual((res.status_code, res.content), (200, pdf))
            with override_settings(PRIVATE_MEDIA_ROOT=new_server, FILE_ENCRYPTION_KEYS=[other_key]):
                uploads._cipher.cache_clear()
                self.assertEqual(self.client_for(self.p1).get(url).status_code, 404)  # clé oubliée : illisible
        finally:
            uploads._cipher.cache_clear()
            shutil.rmtree(old_server, ignore_errors=True)
            shutil.rmtree(new_server, ignore_errors=True)


class TwoFactorSecretAtRestTests(ApiTestCase):
    def test_totp_secret_is_encrypted_in_database(self):
        from accounts import totp
        from accounts.models import TwoFactor

        client = self.client_for(self.doc_user)
        secret = client.post("/api/auth/mfa", {"action": "start"}, format="json").data["secret"]
        stored = TwoFactor.objects.get(user=self.doc_user).secret
        self.assertNotIn(secret, stored)  # jamais en clair dans la base ni dans ses sauvegardes
        self.assertTrue(stored.startswith("fernet:"))
        code = totp.current_code(secret)
        res = client.post("/api/auth/mfa", {"action": "confirm", "code": code}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
