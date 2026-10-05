"""
Performance : le nombre de requêtes SQL des listes principales ne doit pas grandir avec le nombre de lignes
affichées (pas de « N+1 »). On compare la même page avec peu puis beaucoup de données.
"""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from appointments.models import Appointment
from directory.models import Doctor

from .test_security import ApiTestCase


class QueryCountTests(ApiTestCase):
    def count(self, client, url):
        with CaptureQueriesContext(connection) as ctx:
            res = client.get(url)
        self.assertEqual(res.status_code, 200, getattr(res, "data", ""))
        return len(ctx.captured_queries)

    def add_doctors(self, n, start):
        for i in range(start, start + n):
            user = self.make_user(f"doc{i}@test.sn", f"Dr {i}")
            Doctor.objects.create(user=user, full_name=f"Dr {i}", specialty=self.spec, city="Dakar", consultation_price=10000, is_verified=True)

    def add_appointments(self, n, start):
        for i in range(start, start + n):
            Appointment.objects.create(
                doctor=self.doctor, patient=self.p1, scheduled_at=self.slot + timedelta(days=i, hours=1), duration_minutes=30, status="confirmed", price=15000
            )

    def assert_flat(self, client, url, grow):
        grow(2, 0)
        small = self.count(client, url)
        grow(12, 2)
        large = self.count(client, url)
        self.assertLessEqual(large, small, f"{url} : {small} requêtes avec peu de lignes, {large} avec beaucoup")

    def test_doctor_search_is_flat(self):
        self.assert_flat(APIClient(), "/api/directory/doctors", self.add_doctors)

    def test_patient_appointments_is_flat(self):
        self.assert_flat(self.client_for(self.p1), "/api/appointments/mine", self.add_appointments)

    def test_doctor_agenda_is_flat(self):
        self.assert_flat(self.client_for(self.doc_user), "/api/pro/appointments", self.add_appointments)


class DatabaseDownTests(ApiTestCase):
    def test_database_failure_returns_clean_503(self):
        from unittest import mock

        from django.db import OperationalError

        client = self.client_for(self.p1)
        with mock.patch("appointments.views.Appointment.objects.filter", side_effect=OperationalError("connexion refusée")):
            res = client.get("/api/appointments/mine")
        self.assertEqual(res.status_code, 503)
        self.assertIn("indisponible", res.data["error"])
