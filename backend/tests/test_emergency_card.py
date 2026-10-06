"""Fiche d'urgence complète : alertes vitales, personnes à prévenir, médecin traitant, fiche d'un proche."""

from accounts.models import Relative
from medical.models import HealthProfile
from notifications.models import Notification

from .test_security import ApiTestCase


class EmergencyCardTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.p1.phone, self.p1.phone_verified = "+221771234567", True
        self.p1.save()

    def test_full_card_and_validation(self):
        c = self.client_for(self.p1)
        url = "/api/patient/emergency-card"
        self.assertEqual(c.post(url, {"critical_flags": ["vampire"]}, format="json").status_code, 400)
        self.assertEqual(c.post(url, {"contacts": [{"name": "Moussa", "phone": "abc"}]}, format="json").status_code, 400)
        res = c.post(url, {
            "enabled": True, "critical_flags": ["insuline", "epilepsie"],
            "contacts": [{"name": "Moussa Ndiaye", "relation": "Frère", "phone": "77 000 11 22"}, {"name": "", "phone": ""}],
            "medical_devices": "Pacemaker", "rescuer_notes": "Parle seulement wolof",
            "fields": ["critical_flags", "emergency_contact", "medical_devices", "rescuer_notes", "doctor"],
        }, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["contacts"], [{"name": "Moussa Ndiaye", "relation": "Frère", "phone": "+221770001122"}])
        card = self.client_for().get(f"/api/emergency/{res.data['token']}").data
        self.assertEqual(card["critical_flags"], ["insuline", "epilepsie"])
        self.assertEqual(card["contacts"][0]["phone"], "+221770001122")
        self.assertEqual((card["medical_devices"], card["rescuer_notes"]), ("Pacemaker", "Parle seulement wolof"))
        self.assertIsNone(card["doctor"])  # aucune consultation terminée
        self.assertNotIn("blood_group", card)  # non choisi
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="emergency_card_viewed").exists())

    def test_relative_card(self):
        child = Relative.objects.create(owner=self.p1, full_name="Fatou Ndiaye", relationship="enfant")
        c = self.client_for(self.p1)
        url = "/api/patient/emergency-card"
        self.assertEqual(self.client_for(self.p2).post(url, {"relative_id": str(child.id), "enabled": True}, format="json").status_code, 404)
        res = c.post(url, {"relative_id": str(child.id), "enabled": True, "blood_group": "O+", "allergies": "Pénicilline",
                           "critical_flags": ["drepanocytose"], "fields": ["critical_flags", "blood_group", "allergies", "emergency_contact"]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["relative"]["full_name"], "Fatou Ndiaye")
        card = self.client_for().get(f"/api/emergency/{res.data['token']}").data
        self.assertEqual((card["full_name"], card["blood_group"], card["for_relative"]), ("Fatou Ndiaye", "O+", True))
        self.assertEqual(card["contacts"][0]["phone"], "+221771234567")  # le parent, toujours en premier
        self.assertEqual(c.get(url, {"relative": str(child.id)}).data["allergies"], "Pénicilline")
        self.assertFalse(HealthProfile.objects.filter(user=self.p1, emergency_enabled=True).exists())  # sa propre fiche intacte


class EmergencySummaryTests(ApiTestCase):
    def test_summary_suggestions_missing_and_reminder(self):
        from datetime import timedelta

        from django.utils import timezone

        from appointments.models import Appointment
        from medical.emergency import send_emergency_reminders
        from medical.models import MedicalRecord, Prescription

        today = timezone.localdate()
        a1 = Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=timezone.now() - timedelta(days=10),
                                        duration_minutes=30, status="completed")
        MedicalRecord.objects.create(appointment=a1, patient=self.p1, doctor=self.doctor, summary="x",
                                     diagnosis="Crise vaso-occlusive drépanocytaire", treatment="Hydratation, antalgiques")
        Prescription.objects.create(appointment=a1, patient=self.p1, doctor=self.doctor, reference="ORD-T1",
                                    items=[{"name": "Acide folique", "posology": "1 cp par jour"}], valid_until=today + timedelta(days=60))
        a2 = Appointment.objects.create(patient=self.p1, doctor=self.doctor, scheduled_at=timezone.now() - timedelta(days=5),
                                        duration_minutes=30, status="completed")
        MedicalRecord.objects.create(appointment=a2, patient=self.p1, doctor=self.doctor, summary="x",
                                     diagnosis="Suivi", condition_code="vih")
        Prescription.objects.create(appointment=a2, patient=self.p1, doctor=self.doctor, reference="ORD-T2",
                                    items=[{"name": "Antirétroviral", "posology": "1 cp"}], valid_until=today + timedelta(days=60))
        c = self.client_for(self.p1)
        url = "/api/patient/emergency-card"
        res = c.post(url, {"enabled": True, "fields": ["blood_group", "treatments", "medical_summary"]}, format="json").data
        self.assertEqual(set(res["missing"]), {"blood_group", "treatments"})
        self.assertEqual(res["suggested_treatments"], ["Acide folique — 1 cp par jour"])  # jamais le traitement sensible
        res = c.post(url, {"treatments": "Acide folique — 1 cp par jour", "blood_group": "O+"}, format="json").data
        self.assertEqual((res["missing"], res["suggested_treatments"]), ([], []))
        card = self.client_for().get(f"/api/emergency/{res['token']}").data
        summary = card["medical_summary"]
        self.assertEqual([r["conclusion"] for r in summary["records"]], ["Crise vaso-occlusive drépanocytaire"])
        self.assertEqual([p["items"] for p in summary["prescriptions"]], [["Acide folique — 1 cp par jour"]])
        self.assertNotIn("Antirétroviral", str(card))
        self.assertFalse(card["stale"])
        # Rappel « fiche à jour ? » après 6 mois sans modification, une seule fois.
        from medical.models import HealthProfile

        HealthProfile.objects.filter(user=self.p1).update(updated_at=timezone.now() - timedelta(days=200))
        self.assertEqual(send_emergency_reminders(), 1)
        self.assertEqual(send_emergency_reminders(), 0)
