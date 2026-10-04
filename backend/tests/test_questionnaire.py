"""Questionnaire avant consultation."""

from datetime import timedelta

from django.utils import timezone

from appointments.models import Appointment
from directory.models import ConsultationType

from .test_security import ApiTestCase

QUESTIONS = [
    {"label": "Avez-vous de la fièvre ?", "type": "yesno", "required": True},
    {"label": "Depuis combien de temps ?", "type": "choice", "options": ["< 3 jours", "1 semaine", "Plus"], "required": False},
    {"label": "Traitements en cours", "type": "text"},
]


class QuestionnaireTests(ApiTestCase):
    def set_questions(self, questions, **extra):
        return self.client_for(self.doc_user).post("/api/pro/questionnaires", {"questions": questions, **extra}, format="json")

    def test_validation_of_questions(self):
        self.assertEqual(self.set_questions([{"label": "?", "type": "text"}]).status_code, 400)
        self.assertEqual(self.set_questions([{"label": "Couleur ?", "type": "choice", "options": ["a"]}]).status_code, 400)
        self.assertEqual(self.set_questions([{"label": "Question", "type": "script"}]).status_code, 400)
        self.assertEqual(self.set_questions([{"label": f"Question {i}", "type": "text"} for i in range(16)]).status_code, 400)
        res = self.set_questions(QUESTIONS)
        self.assertEqual([q["id"] for q in res.data["default"]], ["q1", "q2", "q3"])
        self.assertEqual(self.client_for(self.p1).post("/api/pro/questionnaires", {"questions": []}, format="json").status_code, 404)

    def test_snapshot_answers_and_doctor_view(self):
        self.set_questions(QUESTIONS)
        appt_id = self.book(self.p1).data["id"]
        # Le médecin modifie ensuite son questionnaire : le RDV garde les questions d'origine.
        self.set_questions([{"label": "Autre question", "type": "text"}])
        mine = self.client_for(self.p1).get("/api/appointments/mine").data[0]
        self.assertEqual(len(mine["questionnaire"]), 3)
        self.assertTrue(mine["can_answer"])
        c = self.client_for(self.p1)
        url = f"/api/appointments/{appt_id}/questionnaire"
        # Rien n'est obligatoire : une réponse partielle (ou aucune) est acceptée.
        self.assertEqual(c.post(url, {"answers": {"q2": "1 semaine"}}, format="json").status_code, 200)
        self.assertEqual(c.post(url, {"answers": {"q1": "oui"}}, format="json").status_code, 400)  # pas un booléen
        self.assertEqual(c.post(url, {"answers": {"q1": True, "q2": "Jamais"}}, format="json").status_code, 400)
        self.assertEqual(c.post(url, {"answers": {"q1": True, "q2": "1 semaine", "q3": "Paracétamol", "q9": "x"}}, format="json").status_code, 200)
        self.assertEqual(self.client_for(self.p2).post(url, {"answers": {"q1": False}}, format="json").status_code, 404)
        agenda = self.client_for(self.doc_user).get("/api/pro/appointments").data[0]
        self.assertEqual(agenda["questionnaire"][0], {"label": "Avez-vous de la fièvre ?", "type": "yesno", "answer": True})
        self.assertIsNotNone(agenda["answered_at"])
        self.assertNotIn("q9", Appointment.objects.get(id=appt_id).answers)

    def test_type_specific_questionnaire_and_closed_after(self):
        ctype = ConsultationType.objects.create(doctor=self.doctor, name="Vaccination", duration_minutes=30, price=5000)
        self.set_questions([{"label": "Carnet de vaccination apporté ?", "type": "yesno"}], consultation_type_id=str(ctype.id))
        self.set_questions(QUESTIONS)
        appt_id = self.book(self.p1, consultation_type_id=str(ctype.id)).data["id"]
        appt = Appointment.objects.get(id=appt_id)
        self.assertEqual(appt.questionnaire[0]["label"], "Carnet de vaccination apporté ?")
        Appointment.objects.filter(id=appt_id).update(scheduled_at=timezone.now() - timedelta(hours=1))
        res = self.client_for(self.p1).post(f"/api/appointments/{appt_id}/questionnaire", {"answers": {"q1": True}}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_patient_sees_questions_on_doctor_page_and_answers_when_booking(self):
        self.set_questions(QUESTIONS)
        public = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}").data
        self.assertEqual([q["label"] for q in public["questionnaire"]][0], "Avez-vous de la fièvre ?")
        self.assertFalse(any(q["required"] for q in public["questionnaire"]))  # jamais obligatoire
        # Réservation avec des réponses partielles : enregistrées avec le RDV.
        res = self.book(self.p1, answers={"q1": True, "q3": "Paracétamol"})
        self.assertEqual(res.status_code, 200, res.data)
        appt = Appointment.objects.get(id=res.data["id"])
        self.assertEqual(appt.answers, {"q1": True, "q3": "Paracétamol"})
        self.assertIsNotNone(appt.answered_at)
        # Réservation sans aucune réponse : acceptée aussi.
        res = self.book(self.p2, when=self.slot + timedelta(minutes=30))
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(Appointment.objects.get(id=res.data["id"]).answers)
