"""Justificatifs des médecins : dépôt, confidentialité, validation préalable à la publication."""

import base64

from directory.models import DoctorCredential

from .test_security import ApiTestCase

PDF = base64.b64encode(b"%PDF-1.4 diplome").decode()


class CredentialTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_user("adm@test.sn", "Admin")
        self.admin.is_staff = True
        self.admin.save()
        self.doctor.is_verified = False
        self.doctor.save()

    def upload(self, kind="ordre", content=PDF):
        return self.client_for(self.doc_user).post(
            "/api/pro/credentials", {"kind": kind, "file_name": "ordre.pdf", "content_base64": content}, format="json"
        )

    def verify(self):
        return self.client_for(self.admin).post("/api/admin/verification", {"kind": "doctor", "id": str(self.doctor.id), "verified": True}, format="json")

    def test_publication_requires_accepted_registration(self):
        self.assertEqual(self.verify().status_code, 400)
        res = self.upload()
        self.assertEqual(res.status_code, 200, res.data)
        cred_id = res.data["credentials"][0]["id"]
        self.assertEqual(self.verify().status_code, 400)  # déposé mais pas encore contrôlé
        admin = self.client_for(self.admin)
        self.assertEqual(admin.post(f"/api/admin/credentials/{cred_id}", {"decision": "rejected"}, format="json").status_code, 400)
        self.assertEqual(admin.post(f"/api/admin/credentials/{cred_id}", {"decision": "accepted"}, format="json").status_code, 200)
        self.assertEqual(self.verify().status_code, 200)
        # Un justificatif validé ne peut plus être supprimé par le médecin.
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/pro/credentials/{cred_id}/delete").status_code, 400)

    def test_file_privacy_and_type(self):
        self.assertEqual(self.upload(content=base64.b64encode(b"<html>").decode()).status_code, 400)
        cred_id = self.upload().data["credentials"][0]["id"]
        for user, expected in ((self.doc_user, 200), (self.admin, 200), (self.p1, 404)):
            res = self.client_for(user).get(f"/api/pro/credentials/{cred_id}/file")
            self.assertEqual(res.status_code, expected)
            if expected == 200:
                res.close()
        self.assertEqual(self.client_for(self.p1).get("/api/admin/credentials").status_code, 403)
        self.assertEqual(self.client_for(self.p1).post("/api/pro/credentials", {"kind": "ordre"}, format="json").status_code, 404)

    def test_delete_pending(self):
        cred_id = self.upload("diplome").data["credentials"][0]["id"]
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/pro/credentials/{cred_id}/delete").status_code, 200)
        self.assertFalse(DoctorCredential.objects.exists())
