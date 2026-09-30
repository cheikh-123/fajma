"""Agenda tenu par le cabinet (saisie, déplacement), pièces jointes de la messagerie, exports CSV."""

import base64
import tempfile
from datetime import timedelta

from django.test import override_settings

from appointments.models import Appointment
from directory.models import TimeOff
from messaging.models import Message
from notifications.models import Notification

from .test_security import ApiTestCase, iso

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


class DeskTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.doc = self.client_for(self.doc_user)

    def new(self, **data):
        return self.doc.post("/api/pro/appointments/new", {"scheduled_at": iso(self.slot), **data}, format="json")

    def test_doctor_books_walk_in_and_known_patient(self):
        res = self.new(patient_name="Moussa Diallo", patient_phone="77 000 00 00", duration_minutes=20)
        self.assertEqual(res.status_code, 200, res.data)
        appt = Appointment.objects.get(id=res.data["id"])
        self.assertEqual((appt.status, appt.duration_minutes, appt.channel), ("confirmed", 20, "clinic"))
        # Chevauchement refusé ; horaire hors plages d'ouverture accepté (c'est le cabinet qui saisit).
        self.assertEqual(self.new(patient_name="Autre", scheduled_at=iso(self.slot + timedelta(minutes=10))).status_code, 409)
        self.assertEqual(self.new(patient_name="Soir", scheduled_at=iso(self.slot.replace(hour=19))).status_code, 200)
        # Patient inscrit : seulement s'il est déjà connu du médecin.
        self.assertEqual(self.new(patient_id=str(self.p1.id), scheduled_at=iso(self.slot + timedelta(hours=1))).status_code, 404)
        self.book(self.p1, when=self.slot + timedelta(days=7))
        res = self.new(patient_id=str(self.p1.id), scheduled_at=iso(self.slot + timedelta(hours=1)))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="appointment_confirmed").exists())
        names = [p["name"] for p in self.doc.get("/api/pro/known-patients", {"q": "moussa"}).data]
        self.assertEqual(names, ["Moussa Diallo"])
        self.assertEqual(self.client_for(self.p2).post("/api/pro/appointments/new", {}, format="json").status_code, 404)

    def test_absence_refused_and_past_refused(self):
        TimeOff.objects.create(doctor=self.doctor, starts_at=self.slot - timedelta(hours=1), ends_at=self.slot + timedelta(hours=1))
        res = self.new(patient_name="Awa")
        self.assertEqual(res.status_code, 400)
        self.assertIn("absent", res.data["error"])
        self.assertEqual(self.new(patient_name="Awa", scheduled_at=iso(self.slot - timedelta(days=10))).status_code, 400)

    def test_practice_moves_appointment_and_patient_is_told(self):
        appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        other = self.book(self.p2, when=self.slot + timedelta(hours=1)).data["id"]
        url = f"/api/pro/appointments/{appt_id}/move"
        self.assertEqual(self.doc.post(url, {"scheduled_at": iso(self.slot + timedelta(hours=1))}, format="json").status_code, 409)
        new_time = self.slot + timedelta(days=1, hours=2)
        res = self.doc.post(url, {"scheduled_at": iso(new_time)}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        appt = Appointment.objects.get(id=appt_id)
        self.assertEqual((appt.scheduled_at, appt.status), (new_time, "confirmed"))
        self.assertTrue(Notification.objects.filter(user=self.p1, title="Rendez-vous déplacé par le cabinet").exists())
        # Le patient ne peut pas utiliser la route du cabinet ; un autre patient non plus.
        self.assertEqual(self.client_for(self.p1).post(f"/api/pro/appointments/{other}/move", {"scheduled_at": iso(new_time)}, format="json").status_code, 404)

    def test_secretary_moves_and_books_with_shared_rules(self):
        owner = self.make_user("owner@test.sn", "Responsable")
        own = self.client_for(owner)
        clinic_id = own.post("/api/clinics/mine", {"name": "Clinique", "city": "Dakar"}, format="json").data["id"]
        own.post(f"/api/clinics/{clinic_id}/members", {"doctor_id": str(self.doctor.id)}, format="json")
        appt_id = own.post(
            f"/api/clinics/{clinic_id}/book",
            {"doctor_id": str(self.doctor.id), "scheduled_at": iso(self.slot), "patient_name": "Fatou", "patient_phone": "771112233"},
            format="json",
        ).data["id"]
        res = own.post(f"/api/clinics/{clinic_id}/appointments/{appt_id}/move", {"scheduled_at": iso(self.slot + timedelta(hours=3))}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        csv = own.get(f"/api/clinics/{clinic_id}/export.csv", {"from": self.slot.date().isoformat(), "to": self.slot.date().isoformat()})
        text = csv.content.decode("utf-8-sig")
        self.assertIn("Fatou", text)
        self.assertTrue(text.startswith("Date;Heure"))


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class MessageAttachmentTests(ApiTestCase):
    def test_photo_in_thread_only_for_participants(self):
        self.book(self.p1)
        patient = self.client_for(self.p1)
        data = {"doctor_id": str(self.doctor.id), "patient_id": str(self.p1.id)}
        self.assertEqual(patient.post("/api/messages/send", data, format="json").status_code, 400)  # ni texte ni fichier
        bad = patient.post("/api/messages/send", {**data, "file_name": "x.html", "content_base64": base64.b64encode(b"<script>").decode()}, format="json")
        self.assertEqual(bad.status_code, 400)
        res = patient.post("/api/messages/send", {**data, "file_name": "plaie.png", "content_base64": base64.b64encode(PNG).decode()}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        thread = self.client_for(self.doc_user).get("/api/messages/thread", data).data
        att = thread["messages"][0]["attachment"]
        self.assertEqual((att["name"], att["mime"]), ("plaie.png", "image/png"))
        self.assertEqual(self.client_for(self.doc_user).get(att["url"]).status_code, 200)
        self.assertEqual(self.client_for(self.p2).get(att["url"]).status_code, 404)
        self.assertEqual(Message.objects.get().body, "")


class ExportTests(ApiTestCase):
    def test_doctor_exports(self):
        appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=appt_id).update(status="completed", tiers_payant=True, patient_share=3000, coverage_percent=80, insurance_member_number="IPM-42")
        doc = self.client_for(self.doc_user)
        day = self.slot.date().isoformat()
        text = doc.get("/api/pro/export/appointments.csv", {"from": day, "to": day}).content.decode("utf-8-sig")
        self.assertIn("Awa P1", text)
        self.assertIn("Terminé", text)
        ins = doc.get("/api/pro/export/insurance.csv", {"from": day, "to": day}).content.decode("utf-8-sig")
        self.assertIn("IPM-42", ins)
        self.assertIn(";12000", ins)  # 15 000 − 3 000 à facturer
        self.assertEqual(doc.get("/api/pro/export/finance.csv").status_code, 200)
        self.assertEqual(doc.get("/api/pro/export/appointments.csv", {"from": "2026-12-01", "to": "2026-01-01"}).status_code, 400)
        self.assertEqual(self.client_for(self.p1).get("/api/pro/export/appointments.csv").status_code, 404)
