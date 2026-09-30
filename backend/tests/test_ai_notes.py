"""Assistant de prise de notes : brouillon de compte-rendu (IA ou mise en forme locale), accès réservé."""

import io
import json
from unittest import mock

from django.test import override_settings

from appointments.models import Appointment
from audit.models import AuditEvent

from .test_security import ApiTestCase

NOTES = (
    "Patiente de 52 ans, céphalées matinales depuis deux semaines. Tension 158 sur 96 aux deux bras. "
    "Examen cardio-pulmonaire normal. Conclusion : HTA insuffisamment contrôlée. "
    "Augmenter l'amlodipine à 10 mg le matin. Contrôle dans un mois avec automesure."
)


class AiNotesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        self.doc = self.client_for(self.doc_user)

    def draft(self, client=None, notes=NOTES):
        return (client or self.doc).post(f"/api/pro/appointments/{self.appt.id}/ai-draft", {"notes": notes}, format="json")

    @override_settings(AI={"API_KEY": "", "MODEL": "", "API_URL": "http://ia.invalid"})
    def test_local_draft_without_ai(self):
        res = self.draft()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["source"], "local")
        self.assertIn("céphalées", res.data["summary"])
        self.assertIn("HTA", res.data["diagnosis"])
        self.assertIn("amlodipine", res.data["treatment"])
        self.assertIn("Contrôle dans un mois", res.data["treatment"])
        # Aucun mot ajouté : chaque rubrique ne reprend que des phrases des notes.
        for text in res.data.values():
            if text in ("local",):
                continue
            for sentence in filter(None, text.split(". ")):
                self.assertIn(sentence.rstrip(".")[:25], NOTES)
        self.assertTrue(AuditEvent.objects.filter(action="ai_draft").exists())

    @override_settings(AI={"API_KEY": "cle", "MODEL": "modele", "API_URL": "http://ia.invalid"}, AI_NOTES_ENABLED=True)
    def test_ai_draft_sends_notes_only(self):
        answer = {"summary": "Céphalées matinales depuis 2 semaines. TA 158/96.", "diagnosis": "HTA insuffisamment contrôlée.", "treatment": "Amlodipine 10 mg le matin."}
        payload = {"choices": [{"message": {"content": "```json\n" + json.dumps(answer) + "\n```"}}]}
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(payload).encode())) as call:
            res = self.draft()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["source"], "ia")
        self.assertEqual(res.data["diagnosis"], "HTA insuffisamment contrôlée.")
        sent = json.loads(call.call_args.args[0].data)
        text = json.dumps(sent, ensure_ascii=False)
        # Ni le nom, ni le téléphone, ni l'identifiant du patient ne partent chez le fournisseur.
        for secret in (self.p1.full_name, self.p1.phone, str(self.p1.id), str(self.appt.id)):
            self.assertNotIn(secret, text)
        self.assertIn("n'invente rien", sent["messages"][0]["content"])

    @override_settings(AI={"API_KEY": "cle", "MODEL": "modele", "API_URL": "http://ia.invalid"}, AI_NOTES_ENABLED=False)
    def test_disabled_ai_falls_back_to_local(self):
        with mock.patch("urllib.request.urlopen") as call:
            res = self.draft()
        self.assertEqual(res.data["source"], "local")
        call.assert_not_called()

    def test_access_and_validation(self):
        self.assertEqual(self.draft(notes="trop court").status_code, 400)
        other = self.make_user("autre@test.sn", "Dr Autre")
        from directory.models import Doctor

        Doctor.objects.create(user=other, full_name="Dr Autre", specialty=self.spec, city="Dakar", consultation_price=10000)
        self.assertEqual(self.draft(self.client_for(other)).status_code, 404)
        self.assertNotEqual(self.draft(self.client_for(self.p1)).status_code, 200)


class LocalDraftTests(ApiTestCase):
    def test_doses_durations_and_labels(self):
        from medical.ai_notes import local_draft

        d = local_draft(
            "Toux sèche et fièvre depuis trois jours. Conclusion : bronchite aiguë probable. "
            "Amoxicilline 1 g matin et soir pendant 7 jours. Revoir dans une semaine."
        )
        self.assertEqual(d["summary"], "Toux sèche et fièvre depuis trois jours.")
        self.assertEqual(d["diagnosis"], "Bronchite aiguë probable.")
        self.assertIn("Amoxicilline 1 g", d["treatment"])
        self.assertIn("Revoir dans une semaine.", d["treatment"])
