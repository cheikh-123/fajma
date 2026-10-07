"""
Règles de réservation : confirmation automatique d'un créneau libre, et annulation toujours possible
(signalée au cabinet quand elle est tardive).
"""

from datetime import timedelta

from unittest.mock import patch

from django.utils import timezone
from notifications.models import Notification

from .test_security import ApiTestCase


class AutoConfirmTests(ApiTestCase):
    def test_creneau_libre_confirme_aussitot(self):
        """Par défaut, un rendez-vous pris sur un créneau libre n'attend pas le médecin."""
        self.assertTrue(self.doctor.auto_confirm, "la confirmation automatique doit être la règle")
        res = self.book(self.p1)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["status"], "confirmed")

    def test_le_medecin_peut_exiger_de_valider(self):
        self.doctor.auto_confirm = False
        self.doctor.save(update_fields=["auto_confirm"])
        res = self.book(self.p1)
        self.assertEqual(res.data["status"], "pending")

    def test_creneau_occupe_toujours_refuse(self):
        """La confirmation automatique ne crée pas de double réservation."""
        self.assertEqual(self.book(self.p1).status_code, 200)
        self.assertEqual(self.book(self.p2).status_code, 409)


class LateCancellationTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.doctor.cancellation_deadline_hours = 24
        self.doctor.save(update_fields=["cancellation_deadline_hours"])
        self.appt_id = self.book(self.p1).data["id"]

    def card(self, user=None):
        rows = self.client_for(user or self.p1).get("/api/appointments/mine").data
        return next(a for a in rows if a["id"] == self.appt_id)

    def cancel(self, reason="Empêché", scope="one"):
        return self.client_for(self.p1).post(
            f"/api/appointments/{self.appt_id}/cancel", {"reason": reason, "scope": scope}, format="json")

    def test_annulation_dans_les_delais(self):
        card = self.card()
        self.assertTrue(card["can_cancel"])
        self.assertTrue(card["can_move"])
        self.assertFalse(card["late_cancellation_warning"])
        res = self.cancel()
        self.assertEqual(res.status_code, 200, res.data)
        from appointments.models import Appointment

        appt = Appointment.objects.get(id=self.appt_id)
        self.assertEqual(appt.status, "cancelled")
        self.assertFalse(appt.late_cancellation)

    def test_annulation_tardive_acceptee_et_signalee(self):
        """Moins de 24 h avant : l'annulation passe, le créneau se libère, le cabinet est prévenu par SMS."""
        self.set_appointment(self.appt_id, scheduled_at=timezone.now() + timedelta(hours=3))
        card = self.card()
        self.assertTrue(card["can_cancel"], "le patient doit toujours pouvoir annuler")
        self.assertFalse(card["can_move"], "déplacer en ligne reste fermé hors délai")
        self.assertTrue(card["late_cancellation_warning"])

        self.doc_user.phone = "+221770000001"
        self.doc_user.save(update_fields=["phone"])
        with patch("notifications.service.queue_sms") as sms:
            res = self.cancel()
        self.assertEqual(res.status_code, 200, res.data)
        from appointments.models import Appointment

        appt = Appointment.objects.get(id=self.appt_id)
        self.assertEqual(appt.status, "cancelled")
        self.assertTrue(appt.late_cancellation)
        # Le médecin est prévenu, avec la mention « tardive », et par SMS
        note = Notification.objects.filter(user=self.doc_user, kind="appointment_cancelled").first()
        self.assertIsNotNone(note)
        self.assertEqual(note.title, "Annulation tardive")
        self.assertTrue(sms.called, "un SMS doit partir au cabinet")
        self.assertIn("Annulation tardive", sms.call_args.args[1])

    def test_le_creneau_est_bien_libere(self):
        self.set_appointment(self.appt_id, scheduled_at=self.slot)
        self.cancel()
        # Un autre patient peut reprendre le créneau
        self.assertEqual(self.book(self.p2).status_code, 200)

    def test_annulation_par_le_medecin_jamais_tardive(self):
        self.set_appointment(self.appt_id, scheduled_at=timezone.now() + timedelta(hours=2))
        res = self.client_for(self.doc_user).post(
            f"/api/pro/appointments/{self.appt_id}/status", {"status": "cancelled", "reason": "Urgence"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        from appointments.models import Appointment

        self.assertFalse(Appointment.objects.get(id=self.appt_id).late_cancellation)

    def test_un_tiers_ne_peut_pas_annuler(self):
        res = self.client_for(self.p2).post(f"/api/appointments/{self.appt_id}/cancel", {}, format="json")
        self.assertEqual(res.status_code, 404)

    def test_rendez_vous_deja_annule(self):
        self.cancel()
        self.assertEqual(self.cancel().status_code, 404)
