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
