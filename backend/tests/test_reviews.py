"""Avis : réponse du médecin, signalement, modération, note recalculée."""

from appointments.models import Appointment
from directory.models import Doctor, Review

from .test_security import ApiTestCase


class ReviewModerationTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_user("adm@test.sn", "Admin")
        self.admin.is_staff = True
        self.admin.save()

    def review(self, user, rating, comment=""):
        appt_id = self.book(user).data["id"]
        Appointment.objects.filter(id=appt_id).update(status="completed")
        res = self.client_for(user).post("/api/patient/reviews", {"appointment_id": appt_id, "rating": rating, "comment": comment}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.set_appointment(appt_id, scheduled_at=self.slot.replace(year=self.slot.year - 1))  # libère le créneau
        return Review.objects.get(appointment_id=appt_id)

    def public(self):
        return self.client.get(f"/api/directory/doctors/{self.doctor.id}/reviews").data

    def test_reply_and_report_flow(self):
        r = self.review(self.p1, 1, "Attente de 3 heures, très mal reçu.")
        doc = self.client_for(self.doc_user)
        res = doc.post(f"/api/pro/reviews/{r.id}/reply", {"reply": "Nous sommes désolés, une urgence a retardé les consultations."}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("urgence", self.public()[0]["doctor_reply"])
        self.assertEqual(doc.post(f"/api/pro/reviews/{r.id}/report", {"reason": "Propos injurieux"}, format="json").status_code, 200)
        self.assertEqual(len(self.public()), 1)  # reste visible jusqu'à la décision
        queue = self.client_for(self.admin).get("/api/admin/reviews").data
        self.assertEqual(queue[0]["report_reason"], "Propos injurieux")
        self.assertEqual(self.client_for(self.admin).post(f"/api/admin/reviews/{r.id}", {"decision": "hide"}, format="json").status_code, 200)
        self.assertEqual(self.public(), [])
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.reviews_count, 0)
        self.assertEqual(self.client_for(self.admin).get("/api/admin/reviews").data, [])

    def test_rights(self):
        r = self.review(self.p1, 4, "Très bien.")
        other = self.make_user("doc2@test.sn", "Dr Deux")
        Doctor.objects.create(user=other, full_name="Dr Deux", specialty=self.spec, city="Dakar", is_verified=True)
        self.assertEqual(self.client_for(other).post(f"/api/pro/reviews/{r.id}/reply", {"reply": "Réponse pirate"}, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.p1).post(f"/api/pro/reviews/{r.id}/report", {"reason": "abcde"}, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/admin/reviews/{r.id}", {"decision": "hide"}, format="json").status_code, 403)

    def test_contact_details_held_for_moderation_and_rating(self):
        self.review(self.p1, 5, "Excellent")
        held = self.review(self.p2, 1, "Appelez plutôt le 77 123 45 67 pour un vrai médecin")
        self.assertEqual(held.status, "hidden")
        self.assertEqual(len(self.public()), 1)
        self.doctor.refresh_from_db()
        self.assertEqual((float(self.doctor.rating), self.doctor.reviews_count), (5.0, 1))
        self.assertEqual(len(self.client_for(self.admin).get("/api/admin/reviews").data), 1)
        self.client_for(self.admin).post(f"/api/admin/reviews/{held.id}", {"decision": "publish"}, format="json")
        self.doctor.refresh_from_db()
        self.assertEqual((float(self.doctor.rating), self.doctor.reviews_count), (3.0, 2))
