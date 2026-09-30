"""Emploi du temps du médecin : plages sur plusieurs jours, modification, chevauchements refusés."""

from directory.models import DoctorAvailability

from .test_security import ApiTestCase


class ScheduleTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        DoctorAvailability.objects.filter(doctor=self.doctor).delete()
        self.doc = self.client_for(self.doc_user)

    def add(self, **data):
        payload = {"start_time": "09:00", "end_time": "13:00", "slot_minutes": 30, **data}
        return self.doc.post("/api/pro/availability", payload, format="json")

    def test_several_days_at_once(self):
        res = self.add(weekdays=[1, 2, 3, 4, 5])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["created"], 5)
        self.assertEqual(sorted(DoctorAvailability.objects.values_list("weekday", flat=True)), [1, 2, 3, 4, 5])
        # Ancien format (un seul jour) toujours accepté.
        self.assertEqual(self.add(weekday=6, start_time="08:00", end_time="12:00").status_code, 200)

    def test_overlap_refused_and_nothing_created(self):
        self.add(weekdays=[1])
        res = self.add(weekdays=[1, 2], start_time="12:00", end_time="15:00")
        self.assertEqual(res.status_code, 400)
        self.assertIn("lundi 09:00", res.data["error"])
        # Rien n'est créé à moitié : le mardi n'a pas été ajouté.
        self.assertFalse(DoctorAvailability.objects.filter(weekday=2).exists())
        # Plages qui se touchent sans se chevaucher : acceptées.
        self.assertEqual(self.add(weekdays=[1], start_time="13:00", end_time="17:00").status_code, 200)

    def test_update_and_delete(self):
        self.add(weekdays=[1, 3])
        monday = DoctorAvailability.objects.get(weekday=1)
        res = self.doc.post(
            f"/api/pro/availability/{monday.id}",
            {"start_time": "08:00", "end_time": "12:30", "slot_minutes": 20},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        monday.refresh_from_db()
        self.assertEqual((monday.start_time.hour, monday.end_time.minute, monday.slot_minutes), (8, 30, 20))
        # Déplacer le lundi sur le mercredi : chevauchement refusé.
        res = self.doc.post(f"/api/pro/availability/{monday.id}", {"weekday": 3, "start_time": "08:00", "end_time": "10:00"}, format="json")
        self.assertEqual(res.status_code, 400)
        # Plage plus courte qu'un créneau : refusée.
        res = self.doc.post(f"/api/pro/availability/{monday.id}", {"start_time": "08:00", "end_time": "08:15", "slot_minutes": 30}, format="json")
        self.assertEqual(res.status_code, 400)
        # Un autre médecin ne peut ni modifier ni supprimer la plage.
        other = self.client_for(self.p1)
        self.assertIn(other.post(f"/api/pro/availability/{monday.id}", {"start_time": "10:00", "end_time": "11:00"}, format="json").status_code, (403, 404))
        self.assertEqual(self.doc.post(f"/api/pro/availability/{monday.id}/delete").status_code, 200)
        self.assertFalse(DoctorAvailability.objects.filter(id=monday.id).exists())
