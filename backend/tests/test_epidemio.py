"""Veille épidémiologique : diagnostic codé, déclaration immédiate, cases masquées, signal, rapport SIMR, accès."""

from datetime import timedelta

from django.utils import timezone

from appointments.models import Appointment
from medical.models import DiseaseNotification, MedicalRecord
from notifications.models import Notification
from sunusante.epidemio import classify

from .test_security import ApiTestCase


class EpidemioTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_user("adm@test.sn", "Admin", is_staff=True)

    def test_classify_fallback(self):
        self.assertEqual(classify("Fièvre depuis 3 jours"), "paludisme")
        self.assertEqual(classify("Ictère, hépatite"), "hepatite_a_e")
        self.assertEqual(classify("Toux sèche"), "ira_pneumonie")
        self.assertIsNone(classify("Certificat de sport"))

    def test_coded_diagnosis_and_immediate_declaration(self):
        appt = self.book(self.p1).data["id"]
        self.set_appointment(appt, status="confirmed")
        res = self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt}/record", {
            "summary": "Diarrhée aqueuse abondante, déshydratation", "condition_code": "cholera",
            "condition_status": "suspected", "test_result": "pending"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIn("déclaration immédiate", res.data["declaration"]["message"])
        n = DiseaseNotification.objects.get()
        self.assertEqual((n.condition_code, n.city), ("cholera", "Dakar"))
        self.assertTrue(Notification.objects.filter(user=self.admin, kind="mdo").exists())
        self.assertEqual(self.client_for(self.admin).get("/api/admin/todo").data["mdo_to_declare"], 1)
        mine = self.client_for(self.doc_user).get("/api/pro/declarations").data
        self.assertEqual(mine[0]["condition"], "Choléra")
        self.assertEqual(self.client_for(self.p2).post(f"/api/pro/declarations/{n.id}", {}, format="json").status_code, 404)
        ok = self.client_for(self.doc_user).post(f"/api/pro/declarations/{n.id}", {"reference": "District Dakar Ouest, M. Sarr"}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.client_for(self.admin).get("/api/admin/todo").data["mdo_to_declare"], 0)
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt}/record",
                         {"summary": "x y", "condition_code": "inconnu"}, format="json").status_code, 400)

    def test_negative_test_is_not_declared_and_catalog(self):
        appt = self.book(self.p1).data["id"]
        self.set_appointment(appt, status="confirmed")
        self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt}/record", {
            "summary": "Fièvre", "condition_code": "dengue", "test_result": "negative"}, format="json")
        self.assertFalse(DiseaseNotification.objects.exists())
        cat = self.client_for(self.doc_user).get("/api/pro/conditions").data
        codes = {c["code"] for c in cat["conditions"]}
        self.assertTrue({"hepatite_b", "hepatite_c", "cholera", "paludisme", "tuberculose", "vih"} <= codes)

    def test_dashboard_masking_signal_and_simr(self):
        now = timezone.now()
        week_start = now - timedelta(days=timezone.localdate().weekday())
        for i in range(8):
            Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=week_start + timedelta(minutes=30 * i),
                                       duration_minutes=0, mode="async", reason="Fièvre, suspicion de palu", status="completed")
        for w in range(1, 9):
            Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=week_start - timedelta(weeks=w),
                                       duration_minutes=0, mode="async", reason="fièvre", status="completed")
        last_week = Appointment.objects.create(patient=self.p2, doctor=self.doctor, scheduled_at=week_start - timedelta(days=3),
                                               duration_minutes=0, mode="async", reason="consultation", status="completed")
        MedicalRecord.objects.create(appointment=last_week, patient=self.p2, doctor=self.doctor, summary="x",
                                     condition_code="hepatite_b", condition_status="confirmed")
        self.assertEqual(self.client_for(self.doc_user).get("/api/admin/epidemio").status_code, 403)
        data = self.client_for(self.admin).get("/api/admin/epidemio").data
        rows = {r["syndrome"]: r for r in data["rows"]}
        self.assertEqual(rows["Paludisme"]["counts"][-1], 8)
        self.assertEqual(rows["Hépatite B"]["counts"][-2], "<5")
        self.assertEqual(data["signals"][0]["syndrome"], "Paludisme")
        simr = self.client_for(self.admin).get("/api/admin/epidemio", {"export": "simr"}).content.decode()
        self.assertIn("Hépatite B;B16;hebdomadaire;0;1;1", simr)  # comptes exacts pour les autorités
