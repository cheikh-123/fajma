"""
Traçabilité des rendez-vous : création, confirmation, déplacement, annulation sont enregistrés avec leur auteur,
visibles par le patient, le médecin et le secrétariat, jamais par un tiers.
"""

from datetime import timedelta

from appointments.models import Appointment, AppointmentEvent

from .test_security import ApiTestCase


class AppointmentHistoryTests(ApiTestCase):
    def test_full_lifecycle_is_traced_with_author(self):
        # Ce médecin valide lui-même ses demandes : le rendez-vous part « en attente ».
        self.doctor.auto_confirm = False
        self.doctor.save(update_fields=["auto_confirm"])
        appt_id = self.book(self.p1).data["id"]
        doc = self.client_for(self.doc_user)
        self.assertEqual(doc.post(f"/api/pro/appointments/{appt_id}/status", {"status": "confirmed"}, format="json").status_code, 200)
        pat = self.client_for(self.p1)
        new_time = (self.slot + timedelta(minutes=30)).isoformat()
        res = pat.post(f"/api/appointments/{appt_id}/reschedule", {"scheduled_at": new_time}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(pat.post(f"/api/appointments/{appt_id}/cancel", {"reason": "Empêchement"}, format="json").status_code, 200)

        events = list(AppointmentEvent.objects.filter(appointment_id=appt_id).values_list("action", "actor__email"))
        self.assertEqual(
            [e[0] for e in events], ["created", "confirmed", "rescheduled", "status", "cancelled"],
        )  # le déplacement par le patient remet le RDV « en attente » de confirmation
        self.assertEqual(events[1][1], self.doc_user.email)
        self.assertEqual(events[-1][1], self.p1.email)

        history = doc.get(f"/api/pro/appointments/{appt_id}/history").data
        self.assertEqual(history[1]["by_role"], "Médecin")
        self.assertEqual(history[2]["by_role"], "Patient")
        self.assertIsNotNone(history[2]["from_at"])
        self.assertEqual(history[-1]["note"], "Empêchement")
        self.assertEqual(len(pat.get(f"/api/appointments/{appt_id}/history").data), 5)

    def test_history_is_private(self):
        appt_id = self.book(self.p1).data["id"]
        self.assertEqual(self.client_for(self.p2).get(f"/api/appointments/{appt_id}/history").status_code, 404)
        self.assertIn(self.client_for().get(f"/api/appointments/{appt_id}/history").status_code, {401, 403})

    def test_automatic_change_has_no_human_author(self):
        appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        appt.status = "no_show"
        appt.save(update_fields=["status"])  # tâche planifiée : pas de requête en cours
        event = AppointmentEvent.objects.filter(appointment=appt).last()
        self.assertEqual((event.action, event.actor), ("no_show", None))
