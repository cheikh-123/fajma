"""Ordonnance électronique : mentions obligatoires, médicaments structurés, enfant, signature figée."""

import base64
import tempfile
from datetime import date, timedelta

from django.test import override_settings
from django.utils import timezone

from accounts.models import Relative
from appointments.models import Appointment
from medical.models import IssuedDocument, MedicalRecord, Prescription
from notifications.models import Notification

from .test_security import ApiTestCase

# Plus petite image PNG valide (1 × 1 pixel).
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
ITEMS = [
    {"name": "Amoxicilline", "dosage": "500 mg", "posology": "1 gélule 3 fois par jour", "duration": "7 jours", "quantity": "2 boîtes"},
    {"name": "Paracétamol", "dosage": "1 g", "posology": "1 comprimé si fièvre, 3 par jour au plus", "non_substitutable": True},
]


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class PrescriptionTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        # Consultation qui vient d'avoir lieu.
        self.set_appointment(self.appt.id, status="confirmed", scheduled_at=timezone.now() - timedelta(hours=1))
        self.doc = self.client_for(self.doc_user)

    def header(self, **data):
        return self.doc.post("/api/pro/prescription-header", data, format="json")

    def sign(self):
        self.header(order_number="ONMS 1234", practice_name="Cabinet Point E", practice_phone="338210000", city="Dakar")
        return self.header(image="signature", content_base64=base64.b64encode(PNG).decode())

    def write(self, appt=None, **extra):
        payload = {"summary": "Angine bactérienne", "items": ITEMS, **extra}
        return self.doc.post(f"/api/pro/appointments/{(appt or self.appt).id}/record", payload, format="json")

    def test_mentions_required_before_prescribing(self):
        res = self.write()
        self.assertEqual(res.status_code, 400)
        self.assertIn("Ordre", str(res.data))
        self.assertFalse(Prescription.objects.exists())
        # Compte-rendu et ordonnance vont ensemble : rien n'est enregistré à moitié.
        self.assertFalse(MedicalRecord.objects.exists())
        self.assertEqual(self.header(order_number="ONMS 1234", city="Dakar").data["missing"], ["signature"])
        # Signature : image PNG/JPEG uniquement.
        bad = self.header(image="signature", content_base64=base64.b64encode(b"<svg onload=alert(1)>").decode())
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.sign().data["missing"], [])
        self.assertEqual(self.write().status_code, 200)

    def test_structured_prescription_with_mentions(self):
        self.sign()
        self.p1.birth_date, self.p1.sex = date(1990, 5, 17), "F"
        self.p1.save()
        res = self.write(renewals=1, validity_months=3, patient_weight_kg="62,5", instructions="À prendre au milieu des repas")
        self.assertEqual(res.status_code, 200, res.data)
        p = Prescription.objects.get()
        self.assertEqual(len(p.items), 2)
        self.assertIn("1. Amoxicilline 500 mg", p.content)
        self.assertIn("non substituable", p.content)
        self.assertEqual(p.renewals, 1)
        self.assertAlmostEqual((p.valid_until - date.today()).days, 91, delta=1)
        data = self.client_for(self.p1).get(f"/api/documents/prescriptions/{p.id}").data
        self.assertEqual(data["patient"]["birth_date"], "1990-05-17")
        self.assertEqual(data["patient"]["weight_kg"], 62.5)
        issuer = data["issuer"]
        self.assertEqual(issuer["order_number"], "ONMS 1234")
        self.assertEqual(issuer["practice_name"], "Cabinet Point E")
        self.assertTrue(issuer["signature"].startswith("data:image/png;base64,"))
        # Posologie obligatoire pour chaque médicament.
        res = self.write(items=[{"name": "Ibuprofène"}])
        self.assertEqual(res.status_code, 400)

    def test_patient_notified_of_new_prescription(self):
        self.sign()
        self.assertEqual(self.write().status_code, 200)
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="prescription", link="/dossier").exists())
        # Compte-rendu seul, sur une autre consultation : notification « compte-rendu », une seule fois.
        other = Appointment.objects.get(id=self.book(self.p1, when=self.slot + timedelta(hours=1)).data["id"])
        self.set_appointment(other.id, status="confirmed", scheduled_at=timezone.now() - timedelta(hours=2))
        self.write(appt=other, items=[])
        self.write(appt=other, items=[], diagnosis="Angine")
        self.assertEqual(Notification.objects.filter(user=self.p1, kind="record").count(), 1)

    def test_signature_frozen_at_issue(self):
        self.sign()
        self.write()
        p = Prescription.objects.get()
        # Le médecin retire sa signature et change d'adresse : l'ordonnance déjà remise ne change pas.
        self.header(image="signature", content_base64="")
        self.header(order_number="ONMS 1234", practice_name="Nouvelle clinique", city="Thiès")
        issuer = self.client_for(self.p1).get(f"/api/documents/prescriptions/{p.id}").data["issuer"]
        self.assertEqual(issuer["practice_name"], "Cabinet Point E")
        self.assertIsNotNone(issuer["signature"])
        # Sans signature, plus aucune nouvelle ordonnance.
        self.assertEqual(self.write().status_code, 400)

    def test_prescription_for_child_names_the_child(self):
        self.sign()
        child = Relative.objects.create(owner=self.p1, full_name="Moussa Junior", birth_date=date(2019, 3, 2), sex="M")
        Appointment.objects.filter(id=self.appt.id).update(relative=child)
        self.assertEqual(self.write(patient_weight_kg=21).status_code, 200)
        p = Prescription.objects.get()
        self.assertEqual(p.relative, child)
        data = self.client_for(self.p1).get(f"/api/documents/prescriptions/{p.id}").data
        self.assertEqual(data["patient"]["full_name"], "Moussa Junior")
        self.assertEqual(data["patient"]["account_holder"], "Awa P1")
        self.assertEqual(data["patient"]["sex"], "M")

    def test_public_verification_shows_order_number_not_content(self):
        self.sign()
        self.write()
        p = Prescription.objects.get()
        data = self.client_for().post("/api/documents/prescriptions/verify", {"reference": p.reference}, format="json").data
        self.assertEqual(data["doctor_order_number"], "ONMS 1234")
        self.assertNotIn("Amoxicilline", str(data))
        self.assertNotIn("Awa", str(data))
        # Le fichier de signature ne s'obtient qu'avec l'ordonnance, jamais par une adresse publique.
        self.assertNotIn("signature", str(data))

    def test_certificate_requires_signature_and_freezes_header(self):
        url = f"/api/pro/appointments/{self.appt.id}/documents"
        payload = {"kind": "certificat", "body": "Apte à la pratique du sport."}
        self.assertEqual(self.doc.post(url, payload, format="json").status_code, 400)
        self.sign()
        res = self.doc.post(url, payload, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(IssuedDocument.objects.get().issuer["order_number"], "ONMS 1234")
        self.assertTrue(res.data["issuer"]["signature"])

    def test_patient_birth_date_and_sex(self):
        client = self.client_for(self.p1)
        res = client.post("/api/patient/profile", {"full_name": "Awa P1", "birth_date": "1990-05-17", "sex": "F"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.p1.refresh_from_db()
        self.assertEqual((self.p1.birth_date, self.p1.sex), (date(1990, 5, 17), "F"))
        future = (date.today() + timedelta(days=3)).isoformat()
        self.assertEqual(client.post("/api/patient/profile", {"full_name": "Awa P1", "birth_date": future}, format="json").status_code, 400)
        # Sans ces champs, la mise à jour du profil ne les efface pas.
        client.post("/api/patient/profile", {"full_name": "Awa P1"}, format="json")
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.sex, "F")
