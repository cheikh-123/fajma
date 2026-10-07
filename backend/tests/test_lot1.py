"""
Tests des fonctionnalités « type Doctolib » : absences, règles de réservation, statuts arrivé/absent,
notifications, .ics, profil de santé, fiche patient, statistiques, recherche, données personnelles.
"""

from datetime import timedelta

from django.utils import timezone

from appointments.models import Appointment
from directory.models import TimeOff
from medical.models import HealthProfile
from notifications.models import Notification

from .test_security import ApiTestCase, iso, next_weekday_at


class TimeOffAndRulesTests(ApiTestCase):
    def test_time_off_removes_slots_and_blocks_booking(self):
        TimeOff.objects.create(doctor=self.doctor, starts_at=self.slot - timedelta(hours=1), ends_at=self.slot + timedelta(hours=1))
        slots = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}/slots", {"days": 14}).data["slots"]
        self.assertNotIn(iso(self.slot), [s["iso"] for s in slots])
        self.assertEqual(self.book(self.p1).status_code, 409)

    def test_doctor_manages_time_off_and_sees_conflicts(self):
        self.book(self.p1)
        doc = self.client_for(self.doc_user)
        res = doc.post("/api/pro/time-off", {"starts_at": iso(self.slot), "ends_at": iso(self.slot + timedelta(days=1)), "reason": "Congés"}, format="json")
        self.assertEqual(res.data["conflicting_appointments"], 1)
        items = doc.get("/api/pro/time-off").data
        self.assertEqual(len(items), 1)
        self.assertEqual(doc.post(f"/api/pro/time-off/{items[0]['id']}/delete").status_code, 200)
        self.assertEqual(self.client_for(self.p2).post("/api/pro/time-off", {}, format="json").status_code, 404)

    def test_min_notice_and_horizon(self):
        self.client_for(self.doc_user).post("/api/pro/settings", {"min_notice_hours": 24 * 7, "booking_horizon_days": 10}, format="json")
        slots = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}/slots", {"days": 30}).data["slots"]
        for s in slots:
            delta = timezone.datetime.fromisoformat(s["iso"].replace("Z", "+00:00")) - timezone.now()
            self.assertGreaterEqual(delta, timedelta(days=7))
            self.assertLess(delta, timedelta(days=10))
        self.assertEqual(self.book(self.p1).status_code, 400)  # créneau à 2 jours : trop proche

    def test_auto_confirm_and_notifications(self):
        self.doctor.auto_confirm = True
        self.doctor.save()
        res = self.book(self.p1)
        self.assertEqual(res.data["status"], "confirmed")
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="appointment_confirmed").exists())
        self.assertTrue(Notification.objects.filter(user=self.doc_user, kind="appointment_new").exists())

    def test_new_patients_refused_but_known_patient_accepted(self):
        self.doctor.accepts_new_patients = False
        self.doctor.save()
        self.assertEqual(self.book(self.p1).status_code, 400)
        past = timezone.now() - timedelta(days=30)
        Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=past, status="completed")
        self.assertEqual(self.book(self.p1).status_code, 200)

    def test_cancellation_deadline(self):
        self.doctor.cancellation_deadline_hours = 24 * 5
        self.doctor.save()
        appt_id = self.book(self.p1).data["id"]
        mine = self.client_for(self.p1).get("/api/appointments/mine").data[0]
        # Hors délai : annuler reste possible (sinon le patient ne vient pas sans prévenir),
        # mais c'est signalé au cabinet ; déplacer en ligne, non.
        self.assertTrue(mine["can_cancel"])
        self.assertFalse(mine["can_move"])
        self.assertTrue(mine["late_cancellation_warning"])
        new_slot = self.slot + timedelta(minutes=30)
        res = self.client_for(self.p1).post(f"/api/appointments/{appt_id}/reschedule", {"scheduled_at": iso(new_slot)}, format="json")
        self.assertEqual(res.status_code, 400)
        # Le médecin peut toujours annuler, et le patient est prévenu.
        res = self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt_id}/status", {"status": "cancelled", "reason": "Urgence"}, format="json")
        self.assertEqual(res.status_code, 200)
        appt = Appointment.objects.get(id=appt_id)
        self.assertEqual((appt.cancelled_by, appt.cancel_reason), ("doctor", "Urgence"))
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="appointment_cancelled").exists())


class DoctorWorkflowTests(ApiTestCase):
    def test_arrived_and_no_show(self):
        appt_id = self.book(self.p1).data["id"]
        doc = self.client_for(self.doc_user)
        self.assertEqual(doc.post(f"/api/pro/appointments/{appt_id}/arrived", {}, format="json").status_code, 200)
        self.assertIsNotNone(Appointment.objects.get(id=appt_id).arrived_at)
        # « Absent » impossible avant l'heure du rendez-vous.
        self.assertEqual(doc.post(f"/api/pro/appointments/{appt_id}/status", {"status": "no_show"}, format="json").status_code, 400)
        past = Appointment.objects.create(patient=self.p2, doctor=self.doctor, scheduled_at=timezone.now() - timedelta(days=1), status="confirmed")
        self.assertEqual(doc.post(f"/api/pro/appointments/{past.id}/status", {"status": "no_show"}, format="json").status_code, 200)
        stats = doc.get("/api/pro/stats").data
        self.assertEqual(stats["last_30_days"]["no_show"], 1)
        self.assertEqual(stats["last_30_days"]["no_show_rate"], 100)
        self.assertEqual(stats["next_7_days"]["total"], 1)

    def test_patient_file_requires_confirmed_appointment_and_notes_stay_private(self):
        HealthProfile.objects.create(user=self.p1, blood_group="O+", allergies="Pénicilline")
        # Ce médecin valide lui-même ses demandes : le rendez-vous part « en attente ».
        self.doctor.auto_confirm = False
        self.doctor.save(update_fields=["auto_confirm"])
        appt_id = self.book(self.p1).data["id"]
        doc = self.client_for(self.doc_user)
        url = f"/api/pro/patients/{self.p1.id}"
        self.assertEqual(doc.get(url).status_code, 404)  # RDV seulement « en attente »
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        data = doc.get(url).data
        self.assertEqual(data["health_profile"]["allergies"], "Pénicilline")
        self.assertEqual(doc.post(url, {"content": "Surveiller la tension"}, format="json").data["notes"][0]["content"], "Surveiller la tension")
        # Le patient (ou un autre patient) n'a pas accès à la fiche ni aux notes.
        self.assertEqual(self.client_for(self.p1).get(url).status_code, 404)
        self.assertEqual(self.client_for(self.p2).get(url).status_code, 404)


class PatientFeatureTests(ApiTestCase):
    def test_health_profile_roundtrip(self):
        client = self.client_for(self.p1)
        res = client.post("/api/patient/health-profile", {"blood_group": "A+", "allergies": "Arachide", "treatments": "Aucun"}, format="json")
        self.assertEqual(res.data["blood_group"], "A+")
        self.assertEqual(client.get("/api/patient/health-profile").data["allergies"], "Arachide")
        self.assertEqual(client.post("/api/patient/health-profile", {"blood_group": "Z+"}, format="json").status_code, 400)

    def test_ics_file(self):
        appt_id = self.book(self.p1).data["id"]
        res = self.client_for(self.p1).get(f"/api/appointments/{appt_id}/ics")
        self.assertEqual(res.status_code, 200)
        text = res.content.decode()
        self.assertIn("BEGIN:VEVENT", text)
        self.assertIn(f"DTSTART:{self.slot:%Y%m%dT%H%M%S}Z", text)
        self.assertEqual(self.client_for(self.p2).get(f"/api/appointments/{appt_id}/ics").status_code, 404)

    def test_notification_center(self):
        self.book(self.p1)
        client = self.client_for(self.doc_user)
        data = client.get("/api/patient/notifications").data
        self.assertGreaterEqual(data["unread"], 1)
        client.post("/api/patient/notifications/read")
        self.assertEqual(client.get("/api/patient/notifications").data["unread"], 0)

    def test_message_notifies_recipient(self):
        self.book(self.p1)
        self.client_for(self.p1).post(
            "/api/messages/send", {"doctor_id": str(self.doctor.id), "patient_id": str(self.p1.id), "body": "Bonjour"}, format="json"
        )
        self.assertTrue(Notification.objects.filter(user=self.doc_user, kind="message").exists())

    def test_export_and_delete_account(self):
        appt_id = self.book(self.p1).data["id"]
        client = self.client_for(self.p1)
        export = client.get("/api/auth/export").data
        self.assertEqual(export["account"]["full_name"], "Awa P1")
        self.assertEqual(len(export["appointments"]), 1)
        self.assertEqual(client.post("/api/auth/delete-account", {"password": "faux"}, format="json").status_code, 403)
        self.assertEqual(client.post("/api/auth/delete-account", {"password": "Mot-de-passe-solide-2026"}, format="json").status_code, 200)
        self.p1.refresh_from_db()
        self.assertFalse(self.p1.is_active)
        self.assertEqual(self.p1.full_name, "Compte supprimé")
        self.assertEqual(Appointment.objects.get(id=appt_id).status, "cancelled")
        # Le créneau est de nouveau libre.
        self.assertEqual(self.book(self.p2).status_code, 200)

    def test_doctor_account_cannot_self_delete(self):
        res = self.client_for(self.doc_user).post("/api/auth/delete-account", {"password": "Mot-de-passe-solide-2026"}, format="json")
        self.assertEqual(res.status_code, 400)


class SearchTests(ApiTestCase):
    def test_next_slot_and_filters(self):
        doctors = self.client_for().get("/api/directory/doctors").data
        self.assertIsNotNone(doctors[0]["next_slot"])
        self.assertEqual(self.client_for().get("/api/directory/doctors", {"max_price": 1000}).data, [])
        self.doctor.languages = ["Français", "Wolof"]
        self.doctor.save()
        self.assertEqual(len(self.client_for().get("/api/directory/doctors", {"language": "wolof"}).data), 1)
        self.assertEqual(self.client_for().get("/api/directory/doctors", {"language": "Pulaar"}).data, [])
        week = self.client_for().get("/api/directory/doctors", {"available": "week"}).data
        self.assertEqual(len(week), 1)
        TimeOff.objects.create(doctor=self.doctor, starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=20))
        self.assertEqual(self.client_for().get("/api/directory/doctors", {"available": "week"}).data, [])

    def test_doctor_detail_exposes_booking_rules(self):
        data = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}").data
        for key in ("accepts_new_patients", "cancellation_deadline_hours", "booking_instructions", "auto_confirm"):
            self.assertIn(key, data)


# Utilisé pour vérifier que next_weekday_at reste importable depuis ce module.
_ = next_weekday_at
