"""Rapport d'activité de l'administration : chiffres mensuels exacts, aucune donnée nominative, accès réservé."""

from django.utils import timezone

from accounts.models import User
from appointments.models import Appointment
from audit.models import AuditEvent

from .test_security import ApiTestCase


class ActivityReportTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(email="admin@test.sn", password="Mot-de-passe-solide-2026", full_name="Admin", is_staff=True)
        self.staff = self.client_for(self.admin)
        # Deux consultations réalisées ce mois-ci pour p1 (patient fidèle), une absence pour p2.
        now = timezone.now()
        model = Appointment.objects.get(id=self.book(self.p1).data["id"])
        for i, (patient, status) in enumerate([(self.p1, "completed"), (self.p1, "completed"), (self.p2, "no_show")]):
            appt = model if i == 0 else Appointment.objects.get(pk=model.pk)
            if i:
                appt.pk = appt.id = None
                appt._state.adding = True
            appt.patient, appt.status = patient, status
            appt.scheduled_at = now.replace(day=1, hour=9 + i, minute=0, second=0, microsecond=0)
            appt.save()

    def test_report_figures(self):
        data = self.staff.get("/api/admin/activity-report", {"months": 6}).data
        self.assertEqual(len(data["months"]), 6)
        current = data["months"][-1]
        self.assertEqual(current["appointments_completed"], 2)
        self.assertEqual(current["no_shows"], 1)
        self.assertEqual(current["active_patients"], 2)
        self.assertEqual(current["new_patients"], 2)  # les deux patients, pas le médecin ni l'administrateur
        totals = data["totals"]
        self.assertEqual(totals["patients"], 2)
        self.assertEqual(totals["doctors_verified"], 1)
        self.assertEqual(totals["returning_patients_rate"], 100.0)  # p1 : 2 consultations
        self.assertAlmostEqual(totals["no_show_rate"], 33.3)
        # Aucune donnée nominative dans le rapport.
        text = str(data)
        for secret in ("Awa P1", "Moussa P2", "p1@test.sn", "771234567"):
            self.assertNotIn(secret, text)

    def test_csv_export_and_access(self):
        res = self.staff.get("/api/admin/activity-report", {"months": 3, "export": "csv"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res["Content-Type"])
        content = res.content.decode("utf-8-sig")
        self.assertTrue(content.startswith("Mois;Nouveaux patients;"))
        self.assertEqual(len(content.strip().splitlines()), 4)  # en-tête + 3 mois
        self.assertTrue(AuditEvent.objects.filter(action="data_export", actor=self.admin).exists())
        self.assertEqual(self.client_for(self.p1).get("/api/admin/activity-report").status_code, 403)
        self.assertEqual(self.client_for(self.doc_user).get("/api/admin/activity-report").status_code, 403)
