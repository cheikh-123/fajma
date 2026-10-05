"""
Justificatifs des médecins et des établissements : dépôt, confidentialité, pièces obligatoires avant publication,
échéances et rappels.
"""

import base64
from datetime import timedelta

from django.utils import timezone

from clinics.models import Clinic
from directory.credentials import send_expiry_reminders
from directory.models import Credential, Pharmacy
from directory.requirements import REQUIRED
from labs.models import Laboratory, LaboratoryMember
from notifications.models import Notification
from pharmacy.models import PharmacyMember

from .test_security import ApiTestCase

PDF = base64.b64encode(b"%PDF-1.4 justificatif").decode()


class CredentialTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_user("adm@test.sn", "Admin")
        self.admin.is_staff = True
        self.admin.save()
        self.doctor.is_verified = False
        self.doctor.save()

    def upload(self, kind="ordre", content=PDF, **extra):
        return self.client_for(self.doc_user).post(
            "/api/pro/credentials", {"kind": kind, "file_name": "piece.pdf", "content_base64": content, **extra}, format="json"
        )

    def verify(self, kind="doctor", target=None):
        target = target or self.doctor
        return self.client_for(self.admin).post("/api/admin/verification", {"kind": kind, "id": str(target.id), "verified": True}, format="json")

    def review(self, cred_id, decision="accepted", note=""):
        return self.client_for(self.admin).post(f"/api/admin/credentials/{cred_id}", {"decision": decision, "note": note}, format="json")

    def test_doctor_needs_registration_and_identity(self):
        self.assertEqual(self.verify().status_code, 400)
        res = self.upload()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual({m["kind"] for m in res.data["missing"]}, {"ordre", "identite"})
        ordre_id = res.data["credentials"][0]["id"]
        self.assertEqual(self.verify().status_code, 400)  # déposé mais pas encore contrôlé
        self.assertEqual(self.review(ordre_id, "rejected").status_code, 400)  # motif obligatoire
        self.assertEqual(self.review(ordre_id).status_code, 200)
        res = self.verify()
        self.assertEqual(res.status_code, 400)
        self.assertIn("pièce d'identité", res.data["error"])
        expiry = (timezone.localdate() + timedelta(days=400)).isoformat()
        ident = self.upload("identite", expires_at=expiry).data["credentials"][0]
        self.assertEqual(ident["expires_at"], expiry)
        self.review(ident["id"])
        self.assertEqual(self.verify().status_code, 200)
        # Un justificatif validé ne peut plus être supprimé par le médecin.
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/pro/credentials/{ordre_id}/delete").status_code, 400)
        self.assertEqual(Credential.objects.get(id=ordre_id).reviewed_by, self.admin)

    def test_expired_document_refused_and_blocks_publication(self):
        past = (timezone.localdate() - timedelta(days=1)).isoformat()
        self.assertEqual(self.upload("identite", expires_at=past).status_code, 400)
        for kind in REQUIRED["doctor"]:
            Credential.objects.create(doctor=self.doctor, kind=kind, file_path="x", mime_type="application/pdf", size_bytes=1, status="accepted")
        Credential.objects.filter(kind="identite").update(expires_at=timezone.localdate() - timedelta(days=2))
        self.assertEqual(self.verify().status_code, 400)
        res = self.client_for(self.doc_user).get("/api/pro/credentials").data
        self.assertEqual([m["kind"] for m in res["missing"]], ["identite"])
        self.assertTrue(next(c for c in res["credentials"] if c["kind"] == "identite")["expired"])

    def test_expiry_is_ignored_for_documents_without_validity(self):
        res = self.upload("ordre", expires_at=(timezone.localdate() + timedelta(days=10)).isoformat())
        self.assertIsNone(res.data["credentials"][0]["expires_at"])

    def test_file_privacy_and_type(self):
        self.assertEqual(self.upload(content=base64.b64encode(b"<html>").decode()).status_code, 400)
        self.assertEqual(self.upload("agrement_laboratoire").status_code, 400)  # pièce d'un autre type de titulaire
        cred_id = self.upload().data["credentials"][0]["id"]
        for url in (f"/api/pro/credentials/{cred_id}/file", f"/api/credentials/{cred_id}/file"):
            for user, expected in ((self.doc_user, 200), (self.admin, 200), (self.p1, 404)):
                self.assertEqual(self.client_for(user).get(url).status_code, expected)
        self.assertEqual(self.client_for(self.p1).get("/api/admin/credentials").status_code, 403)
        self.assertEqual(self.client_for(self.p1).post("/api/pro/credentials", {"kind": "ordre"}, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.p1).post(f"/api/credentials/{cred_id}/delete").status_code, 404)

    def test_delete_pending(self):
        cred_id = self.upload("diplome").data["credentials"][0]["id"]
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/pro/credentials/{cred_id}/delete").status_code, 200)
        self.assertFalse(Credential.objects.exists())

    def test_admin_queue_shows_owner(self):
        self.upload()
        row = self.client_for(self.admin).get("/api/admin/credentials").data[0]
        self.assertEqual((row["owner_type"], row["owner_name"], row["doctor_name"]), ("doctor", "Dr Test", "Dr Test"))
        self.assertEqual(self.client_for(self.admin).get("/api/admin/todo").status_code, 200)


class EstablishmentCredentialTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_user("adm@test.sn", "Admin")
        self.admin.is_staff = True
        self.admin.save()
        self.owner = self.make_user("owner@test.sn", "Responsable")
        self.clinic = Clinic.objects.create(owner=self.owner, name="Clinique du Cap", city="Dakar")
        self.pharmacist = self.make_user("ph@test.sn", "Pharmacien")
        self.pharmacy = Pharmacy.objects.create(name="Officine A", city="Dakar", address="Rue 1", latitude=14.7, longitude=-17.4)
        PharmacyMember.objects.create(pharmacy=self.pharmacy, user=self.pharmacist)
        self.biologist = self.make_user("bio@test.sn", "Biologiste")
        self.lab = Laboratory.objects.create(name="Labo Dakar", city="Dakar", address="Rue 1")
        LaboratoryMember.objects.create(laboratory=self.lab, user=self.biologist)

    def post(self, user, owner_type, owner, kind, **extra):
        return self.client_for(user).post(
            f"/api/credentials/{owner_type}/{owner.id}",
            {"kind": kind, "file_name": "piece.pdf", "content_base64": PDF, **extra},
            format="json",
        )

    def complete(self, user, owner_type, owner):
        expiry = (timezone.localdate() + timedelta(days=365)).isoformat()
        for kind in REQUIRED[owner_type]:
            res = self.post(user, owner_type, owner, kind, expires_at=expiry)
            self.assertEqual(res.status_code, 200, res.data)
        for c in Credential.objects.filter(**{owner_type: owner}):
            self.assertEqual(self.client_for(self.admin).post(f"/api/admin/credentials/{c.id}", {"decision": "accepted"}, format="json").status_code, 200)

    def verify(self, kind, target):
        return self.client_for(self.admin).post("/api/admin/verification", {"kind": kind, "id": str(target.id), "verified": True}, format="json")

    def test_each_establishment_needs_its_documents(self):
        cases = (("clinic", self.clinic, self.owner), ("pharmacy", self.pharmacy, self.pharmacist), ("laboratory", self.lab, self.biologist))
        for owner_type, owner, user in cases:
            with self.subTest(owner_type):
                res = self.client_for(user).get(f"/api/credentials/{owner_type}/{owner.id}")
                self.assertEqual(res.status_code, 200)
                self.assertEqual([m["kind"] for m in res.data["missing"]], REQUIRED[owner_type])
                self.assertEqual(self.verify(owner_type, owner).status_code, 400)
                self.complete(user, owner_type, owner)
                self.assertEqual(self.verify(owner_type, owner).status_code, 200)
                owner.refresh_from_db()
                self.assertTrue(owner.is_verified)
                self.assertTrue(Notification.objects.filter(user=user, kind="verification").exists())

    def test_only_owner_or_members_and_admin(self):
        for owner_type, owner in (("clinic", self.clinic), ("pharmacy", self.pharmacy), ("laboratory", self.lab)):
            with self.subTest(owner_type):
                self.assertEqual(self.client_for(self.p1).get(f"/api/credentials/{owner_type}/{owner.id}").status_code, 404)
                self.assertEqual(self.post(self.p1, owner_type, owner, REQUIRED[owner_type][0]).status_code, 404)
                self.assertEqual(self.post(self.doc_user, owner_type, owner, REQUIRED[owner_type][0]).status_code, 404)
                self.assertEqual(self.client_for(self.admin).get(f"/api/credentials/{owner_type}/{owner.id}").status_code, 200)
                self.assertEqual(self.post(self.admin, owner_type, owner, REQUIRED[owner_type][0]).status_code, 403)
        # Une pharmacie ne voit pas les pièces d'un laboratoire.
        cred_id = self.post(self.biologist, "laboratory", self.lab, "agrement_laboratoire").data["credentials"][0]["id"]
        self.assertEqual(self.client_for(self.pharmacist).get(f"/api/credentials/{cred_id}/file").status_code, 404)
        self.assertEqual(self.client_for(self.biologist).get(f"/api/credentials/{cred_id}/file").status_code, 200)
        self.assertEqual(self.client_for(self.p1).get(f"/api/credentials/unknown/{self.lab.id}").status_code, 404)

    def test_unverified_partners_are_hidden(self):
        patient = self.client_for(self.p1)
        self.assertEqual(patient.get("/api/labs/laboratories").data, [])
        res = patient.post("/api/pharmacy/queries", {"medicine": "Coartem", "pharmacy_ids": [str(self.pharmacy.id)]}, format="json")
        self.assertEqual(res.status_code, 400)
        self.complete(self.biologist, "laboratory", self.lab)
        self.verify("laboratory", self.lab)
        self.assertEqual([lab["name"] for lab in patient.get("/api/labs/laboratories").data], ["Labo Dakar"])

    def test_expiry_reminders_once_before_and_once_after(self):
        today = timezone.localdate()
        c = Credential.objects.create(
            pharmacy=self.pharmacy, kind="autorisation_pharmacie", file_path="x", mime_type="application/pdf",
            size_bytes=1, status="accepted", expires_at=today + timedelta(days=10),
        )
        self.assertEqual(send_expiry_reminders(), 1)
        self.assertEqual(send_expiry_reminders(), 0)  # pas de doublon
        self.assertTrue(Notification.objects.filter(user=self.pharmacist, kind="credential").exists())
        Credential.objects.filter(pk=c.pk).update(expires_at=today - timedelta(days=1), expiry_reminded_at=timezone.now() - timedelta(days=20))
        self.assertEqual(send_expiry_reminders(), 1)
        self.assertEqual(send_expiry_reminders(), 0)
        todo = self.client_for(self.admin).get("/api/admin/todo").data
        self.assertEqual(todo["credentials_expiring"], 1)

    def test_single_owner_constraint(self):
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError), transaction.atomic():
            Credential.objects.create(clinic=self.clinic, pharmacy=self.pharmacy, kind="autre", file_path="x", mime_type="application/pdf", size_bytes=1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Credential.objects.create(kind="autre", file_path="x", mime_type="application/pdf", size_bytes=1)
