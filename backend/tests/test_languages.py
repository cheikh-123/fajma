"""Langues : préférence enregistrée sur le compte, SMS dans la langue du patient."""

from datetime import UTC, datetime

from notifications.sms import build_reminder_message, build_waitlist_message

from .test_security import ApiTestCase


class LanguageTests(ApiTestCase):
    def test_set_language(self):
        c = self.client_for(self.p1)
        self.assertEqual(c.post("/api/auth/language", {"lang": "en"}, format="json").status_code, 200)
        self.assertEqual(c.get("/api/auth/me").data["user"]["preferred_language"], "en")
        self.assertEqual(c.post("/api/auth/language", {"lang": "xx"}, format="json").status_code, 400)
        self.assertIn(self.client.post("/api/auth/language", {"lang": "wo"}, format="json").status_code, (401, 403))

    def test_sms_in_three_languages(self):
        when = datetime(2026, 10, 5, 9, 30, tzinfo=UTC)  # lundi
        args = {"kind": "reminder_24h", "patient_name": "Awa", "doctor_name": "Dr Diop", "scheduled_at": when, "mode": "in_person", "city": "Dakar"}
        self.assertIn("lundi 5 octobre à 09:30", build_reminder_message(**args, lang="fr"))
        self.assertIn("ëllëg", build_reminder_message(**args, lang="wo"))
        en = build_reminder_message(**args, lang="en")
        self.assertIn("Monday 5 October at 09:30", en)
        self.assertIn("tomorrow", en)
        self.assertIn("A slot just opened", build_waitlist_message("Dr Diop", when, "https://x", lang="en"))
