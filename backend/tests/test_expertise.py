"""Télé-expertise : confidentialité de l'échange, dossier patient, documents joints, traçabilité."""

import base64

from appointments.models import Appointment
from directory.models import Doctor, Specialty
from medical.models import DocumentShare, MedicalDocument

from .test_security import ApiTestCase


class ExpertiseTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        cardio = Specialty.objects.create(slug="cardiologie", name="Cardiologie")
        self.expert_user = self.make_user("cardio@test.sn", "Dr Cardio")
        self.expert = Doctor.objects.create(user=self.expert_user, full_name="Dr Cardio", specialty=cardio, city="Dakar", is_verified=True)
        self.third_user = self.make_user("autre@test.sn", "Dr Autre")
        Doctor.objects.create(user=self.third_user, full_name="Dr Autre", specialty=cardio, city="Thiès", is_verified=True)
        appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=appt_id).update(status="completed")
        content = base64.b64encode(b"%PDF-1.4 ecg").decode()
        self.client_for(self.p1).post(
            "/api/documents/", {"title": "ECG", "category": "analyse", "file_name": "ecg.pdf", "content_base64": content}, format="json"
        )
        self.doc = MedicalDocument.objects.get(patient=self.p1)
        self.private_doc = MedicalDocument.objects.create(patient=self.p1, uploaded_by=self.p1, title="Privé", file_path="x/y.pdf", mime_type="application/pdf")
        DocumentShare.objects.create(document=self.doc, doctor=self.doctor)

    def ask(self, **extra):
        body = {"expert_id": str(self.expert.id), "subject": "Souffle cardiaque", "question": "Votre avis sur cet ECG, merci.", **extra}
        return self.client_for(self.doc_user).post("/api/expertise/", body, format="json")

    def test_case_with_patient_documents_and_audit(self):
        self.assertEqual(self.ask(patient_id=str(self.p1.id)).status_code, 400)  # patient non informé
        self.assertEqual(self.ask(patient_id=str(self.p1.id), patient_informed=True, document_ids=[str(self.private_doc.id)]).status_code, 400)
        res = self.ask(patient_id=str(self.p1.id), patient_informed=True, document_ids=[str(self.doc.id)])
        self.assertEqual(res.status_code, 200, res.data)
        rid = res.data["id"]
        expert = self.client_for(self.expert_user)
        self.assertTrue(expert.get("/api/expertise/").data[0]["awaiting_me"])
        detail = expert.get(f"/api/expertise/{rid}").data
        self.assertEqual(detail["patient"]["full_name"], self.p1.full_name)
        res = expert.get(detail["documents"][0]["url"])
        self.assertEqual(res.status_code, 200)
        res.close()
        # Document non joint : toujours inaccessible à l'expert.
        self.assertEqual(expert.get(f"/api/documents/{self.private_doc.id}/download").status_code, 404)
        log = self.client_for(self.p1).get("/api/patient/access-log").data
        self.assertTrue(any("Cardio" in (e.get("who") or "") for e in log), log)
        self.assertEqual(expert.post(f"/api/expertise/{rid}/messages", {"body": "Souffle fonctionnel probable, échographie conseillée."}, format="json").status_code, 200)
        me = self.client_for(self.doc_user).get("/api/expertise/").data[0]
        self.assertEqual((me["status"], me["awaiting_me"]), ("answered", True))

    def test_confidentiality(self):
        rid = self.ask().data["id"]
        self.assertEqual(self.client_for(self.third_user).get(f"/api/expertise/{rid}").status_code, 404)
        self.assertEqual(self.client_for(self.third_user).post(f"/api/expertise/{rid}/messages", {"body": "Intrusion"}, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.p1).get("/api/expertise/").status_code, 404)  # pas médecin
        # Pas de dossier d'un patient que le médecin ne suit pas.
        self.assertEqual(self.ask(patient_id=str(self.p2.id), patient_informed=True).status_code, 404)
        self.assertEqual(self.ask(expert_id=str(self.doctor.id)).status_code, 404)  # pas à soi-même

    def test_close(self):
        rid = self.ask().data["id"]
        self.client_for(self.doc_user).post(f"/api/expertise/{rid}/close")
        self.assertEqual(self.client_for(self.expert_user).post(f"/api/expertise/{rid}/messages", {"body": "Trop tard"}, format="json").status_code, 400)
