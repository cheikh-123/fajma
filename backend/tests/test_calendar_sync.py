"""Synchronisation avec l'agenda personnel du médecin (export iCal, import des occupations)."""

from datetime import timedelta
from unittest import mock

from appointments.models import Appointment
from directory.calendar_sync import _check_public_host
from directory.models import CalendarLink, ExternalBusy
from sunusante.api import ApiError

from .test_security import ApiTestCase, iso


def ics(events: str) -> bytes:
    return f"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//FR\r\n{events}END:VCALENDAR\r\n".encode()


def event(start, end, extra="") -> str:
    fmt = "%Y%m%dT%H%M%SZ"
    return f"BEGIN:VEVENT\r\nUID:{int(start.timestamp())}@t\r\nDTSTART:{start.strftime(fmt)}\r\nDTEND:{end.strftime(fmt)}\r\nSUMMARY:Privé\r\n{extra}END:VEVENT\r\n"


class CalendarSyncTests(ApiTestCase):
    def set_import(self, data: bytes):
        with mock.patch("directory.calendar_sync.fetch_ics", return_value=data):
            return self.client_for(self.doc_user).post("/api/pro/calendar", {"import_url": "https://calendar.google.com/x/basic.ics"}, format="json")

    def slots(self):
        return [s["iso"] for s in self.client.get(f"/api/directory/doctors/{self.doctor.id}/slots", {"days": 14}).data["slots"]]

    def test_import_blocks_busy_slots_and_ignores_free_events(self):
        busy_start = self.slot
        weekly = event(busy_start, busy_start + timedelta(minutes=30), "RRULE:FREQ=WEEKLY;COUNT=2\r\n")
        free = event(busy_start + timedelta(hours=1), busy_start + timedelta(hours=2), "TRANSP:TRANSPARENT\r\n")
        res = self.set_import(ics(weekly + free))
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["imported_count"], 2)  # 2 occurrences de l'événement répété, l'événement « disponible » ignoré
        self.assertNotIn(iso(busy_start), self.slots())
        self.assertIn(iso(busy_start + timedelta(hours=1)), self.slots())
        self.assertEqual(self.book(self.p1).status_code, 409)  # réservation refusée aussi côté serveur
        # Retirer l'agenda libère les créneaux.
        self.client_for(self.doc_user).post("/api/pro/calendar", {"import_url": ""}, format="json")
        self.assertFalse(ExternalBusy.objects.exists())
        self.assertEqual(self.book(self.p1).status_code, 200)

    def test_all_day_event_and_invalid_file(self):
        day = self.slot.date()
        all_day = f"BEGIN:VEVENT\r\nUID:a@t\r\nDTSTART;VALUE=DATE:{day:%Y%m%d}\r\nDTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}\r\nEND:VEVENT\r\n"
        self.set_import(ics(all_day))
        self.assertFalse([s for s in self.slots() if s.startswith(day.isoformat())])
        res = self.set_import(b"<html>pas un agenda</html>")
        self.assertEqual(res.status_code, 400)
        self.assertTrue(CalendarLink.objects.get().last_import_error)

    def test_ssrf_protection(self):
        for url in ("http://calendar.google.com/x.ics", "https://127.0.0.1/x.ics", "https://localhost/x.ics", "https://10.0.0.5/x.ics"):
            with self.assertRaises(ApiError, msg=url):
                _check_public_host(url)

    def test_feed_export(self):
        self.book(self.p1)
        Appointment.objects.update(status="confirmed")
        feed_url = self.client_for(self.doc_user).get("/api/pro/calendar").data["feed_url"]
        path = feed_url.split("testserver")[-1]
        body = self.client.get(path).content.decode()
        self.assertIn("SUMMARY:Consultation — A. P.", body)
        self.assertNotIn("771234567", body)
        self.assertIn("STATUS:CONFIRMED", body)
        # Nouveau lien : l'ancien ne fonctionne plus.
        self.client_for(self.doc_user).post("/api/pro/calendar/reset")
        self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client_for(self.p1).get("/api/pro/calendar").status_code, 404)
