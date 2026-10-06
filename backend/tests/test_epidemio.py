"""Veille épidémiologique : classement par syndrome, cases de moins de 5 masquées, signal de hausse, accès."""

from datetime import timedelta

from django.utils import timezone

from appointments.models import Appointment
from sunusante.epidemio import classify

from .test_security import ApiTestCase


class EpidemioTests(ApiTestCase):
    def test_classify(self):
        self.assertEqual(classify("Fièvre depuis 3 jours"), "paludisme")
        self.assertEqual(classify("Diarrhée et vomissements"), "diarrhee")
        self.assertEqual(classify("Toux sèche"), "respiratoire")
        self.assertIsNone(classify("Certificat de sport"))

    def test_counts_masked_and_signal(self):
        now = timezone.now()
        week_start = now - timedelta(days=timezone.localdate().weekday())
        # 8 cas de paludisme cette semaine, 1 par semaine avant : signal ; 2 diarrhées : masquées.
        for i in range(8):
            Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=week_start + timedelta(minutes=30 * i),
                                       duration_minutes=0, mode="async", reason="Fièvre, suspicion de palu", status="completed")
        for w in range(1, 9):
            Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=week_start - timedelta(weeks=w),
                                       duration_minutes=0, mode="async", reason="fièvre", status="completed")
        for i in range(2):
            Appointment.objects.create(patient=self.p2, doctor=self.doctor, scheduled_at=week_start + timedelta(hours=10 + i),
                                       duration_minutes=0, mode="async", reason="diarrhée", status="completed")
        admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        self.assertEqual(self.client_for(self.doc_user).get("/api/admin/epidemio").status_code, 403)
        data = self.client_for(admin).get("/api/admin/epidemio").data
        rows = {r["syndrome"]: r for r in data["rows"]}
        self.assertEqual(rows["Fièvre / paludisme"]["counts"][-1], 8)
        self.assertEqual(rows["Diarrhée / gastro-entérite"]["counts"][-1], "<5")
        self.assertEqual(data["signals"][0]["syndrome"], "Fièvre / paludisme")
        self.assertEqual(self.client_for(admin).get("/api/admin/epidemio", {"export": "csv"}).status_code, 200)
