"""
Double réservation simultanée : sous PostgreSQL (production et intégration continue), la contrainte
d'exclusion rejette un second rendez-vous qui chevauche le premier, même si les contrôles applicatifs ont été
contournés (deux requêtes au même instant). L'API répond alors 409.
"""

import unittest
from datetime import timedelta

from django.db import IntegrityError, connection, transaction

from appointments.models import Appointment

from .test_security import ApiTestCase


@unittest.skipUnless(connection.vendor == "postgresql", "contrainte d'exclusion PostgreSQL uniquement")
class OverlapConstraintTests(ApiTestCase):
    def test_database_rejects_overlapping_active_appointments(self):
        first = Appointment.objects.get(id=self.book(self.p1).data["id"])
        clone = dict(doctor=self.doctor, patient=self.p2, duration_minutes=30, status="pending", price=15000)
        # Même médecin, horaires qui se chevauchent : refusé par la base elle-même.
        with self.assertRaises(IntegrityError), transaction.atomic():
            Appointment.objects.create(scheduled_at=first.scheduled_at + timedelta(minutes=10), **clone)
        # Un RDV annulé ne bloque rien, et un horaire voisin est accepté.
        with transaction.atomic():
            Appointment.objects.create(scheduled_at=first.scheduled_at + timedelta(minutes=30), **clone)
        Appointment.objects.filter(id=first.id).update(status="cancelled")
        with transaction.atomic():
            Appointment.objects.create(scheduled_at=first.scheduled_at, **{**clone, "patient": self.p1})
