"""Visites à domicile, séries de séances et remplacements entre médecins."""

from datetime import time, timedelta

from appointments.models import Appointment
from directory.models import ConsultationType, Doctor, DoctorAvailability, Replacement, TimeOff
from medical.issuer import issuer_snapshot
from medical.models import MedicalRecord
from notifications.models import Notification

from .test_security import ApiTestCase, iso


class HomeVisitTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.home_slot = self.slot.replace(hour=15)
        self.visit = {"mode": "home_visit", "visit_address": "Sicap Liberté 6, villa 1234", "visit_landmark": "Portail bleu"}

    def enable(self, fee=5000):
        self.doctor.home_visits, self.doctor.home_visit_fee = True, fee
        self.doctor.save()
        for weekday in range(1, 6):
            DoctorAvailability.objects.create(
                doctor=self.doctor, weekday=weekday, start_time=time(15), end_time=time(18), slot_minutes=60, kind="home_visit"
            )

    def test_refused_when_doctor_does_not_travel(self):
        res = self.book(self.p1, when=self.home_slot, **self.visit)
        self.assertEqual(res.status_code, 400)
        self.assertIn("domicile", res.data["error"])

    def test_booking_uses_home_windows_fee_and_address(self):
        self.enable()
        # Adresse obligatoire
        self.assertEqual(self.book(self.p1, when=self.home_slot, mode="home_visit").status_code, 400)
        # Une plage « cabinet » n'accueille pas de visite à domicile, et inversement.
        self.assertEqual(self.book(self.p1, when=self.slot, **self.visit).status_code, 400)
        self.assertEqual(self.book(self.p1, when=self.home_slot).status_code, 400)
        res = self.book(self.p1, when=self.home_slot, price=1, **self.visit)
        self.assertEqual(res.status_code, 200, res.data)
        appt = Appointment.objects.get(id=res.data["id"])
        self.assertEqual((appt.price, appt.duration_minutes, appt.visit_landmark), (20000, 60, "Portail bleu"))
        mine = self.client_for(self.p1).get("/api/appointments/mine").data[0]
        self.assertEqual(mine["visit"]["address"], "Sicap Liberté 6, villa 1234")
        # Le médecin voit l'adresse ; le créneau n'est plus proposé.
        agenda = self.client_for(self.doc_user).get("/api/pro/appointments").data
        self.assertEqual(agenda[0]["visit"]["landmark"], "Portail bleu")
        slots = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}/slots", {"mode": "home_visit"}).data["slots"]
        self.assertNotIn(iso(self.home_slot), [s["iso"] for s in slots])
        self.assertTrue(slots)

    def test_position_outside_senegal_refused_and_search_filter(self):
        self.enable()
        res = self.book(self.p1, when=self.home_slot, visit_latitude=48.85, visit_longitude=2.35, **self.visit)
        self.assertEqual(res.status_code, 400)
        found = self.client_for().get("/api/directory/doctors", {"home_visit": "1"}).data
        self.assertEqual([d["id"] for d in found], [str(self.doctor.id)])
        self.assertEqual(found[0]["home_visit_fee"], 5000)


class SeriesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.kine = ConsultationType.objects.create(doctor=self.doctor, name="Rééducation", duration_minutes=30, price=8000, series_max=10)

    def series(self, user=None, count=4, interval=7, **extra):
        return self.book(user or self.p1, consultation_type_id=str(self.kine.id), series={"count": count, "interval_days": interval}, **extra)

    def test_series_not_allowed_without_series_max(self):
        plain = ConsultationType.objects.create(doctor=self.doctor, name="Consultation", duration_minutes=30, price=10000)
        res = self.book(self.p1, consultation_type_id=str(plain.id), series={"count": 3, "interval_days": 7})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.series(count=11).status_code, 400)
        self.assertEqual(self.series(interval=5).status_code, 400)

    def test_series_books_free_dates_and_skips_the_others(self):
        # Semaine 3 : le médecin est absent → cette séance est sautée, les autres réservées.
        week3 = self.slot + timedelta(days=14)
        TimeOff.objects.create(doctor=self.doctor, starts_at=week3 - timedelta(hours=2), ends_at=week3 + timedelta(hours=2))
        preview = self.client_for().post(
            "/api/appointments/series/preview",
            {"doctor_id": str(self.doctor.id), "scheduled_at": iso(self.slot), "consultation_type_id": str(self.kine.id),
             "series": {"count": 4, "interval_days": 7}},
            format="json",
        ).data["sessions"]
        self.assertEqual([s["available"] for s in preview], [True, True, False, True])
        res = self.series()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["series"]["booked"], len(res.data["series"]["skipped"])), (3, 1))
        appts = list(Appointment.objects.filter(patient=self.p1).order_by("scheduled_at"))
        self.assertEqual([a.series_index for a in appts], [1, 2, 3])
        self.assertEqual({a.price for a in appts}, {8000})
        # Un seul message pour la série
        self.assertEqual(Notification.objects.filter(user=self.p1, kind="series_booked").count(), 1)
        # Les séances ne comptent pas dans la limite de 4 RDV ; une deuxième série est refusée.
        self.assertEqual(self.book(self.p1, when=self.slot + timedelta(minutes=30)).status_code, 200)
        self.assertEqual(self.series(when=self.slot + timedelta(hours=1)).status_code, 400)

    def test_first_session_must_be_free(self):
        self.assertEqual(self.book(self.p2).status_code, 200)
        self.assertEqual(self.series().status_code, 409)
        self.assertFalse(Appointment.objects.filter(patient=self.p1).exists())

    def test_cancel_rest_of_series(self):
        self.series(count=4)
        appts = list(Appointment.objects.filter(patient=self.p1).order_by("scheduled_at"))
        res = self.client_for(self.p1).post(f"/api/appointments/{appts[1].id}/cancel", {"scope": "series"}, format="json")
        self.assertEqual(res.data["cancelled"], 3)
        statuses = list(Appointment.objects.filter(patient=self.p1).order_by("scheduled_at").values_list("status", flat=True))
        self.assertEqual(statuses, ["confirmed", "cancelled", "cancelled", "cancelled"])

    def test_doctor_repeats_an_appointment(self):
        appt_id = self.book(self.p1).data["id"]
        # Semaine 2 déjà prise par un autre patient → sautée.
        self.assertEqual(self.book(self.p2, when=self.slot + timedelta(days=7)).status_code, 200)
        doc = self.client_for(self.doc_user)
        self.assertEqual(self.client_for(self.p2).post(f"/api/pro/appointments/{appt_id}/repeat", {"count": 3}, format="json").status_code, 404)
        res = doc.post(f"/api/pro/appointments/{appt_id}/repeat", {"count": 3, "interval_days": 7}, format="json")
        self.assertEqual((res.data["created"], len(res.data["skipped"])), (2, 1))
        extra = Appointment.objects.filter(patient=self.p1, series__isnull=False).exclude(id=appt_id)
        self.assertEqual({a.status for a in extra}, {"confirmed"})
        # Ajout à la suite de la série existante.
        res = doc.post(f"/api/pro/appointments/{appt_id}/repeat", {"count": 1, "interval_days": 7}, format="json")
        last = Appointment.objects.filter(patient=self.p1).order_by("-scheduled_at").first()
        self.assertEqual((res.data["created"], last.series_index, last.scheduled_at), (1, 4, self.slot + timedelta(days=28)))


class ReplacementTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.sub_user = self.make_user("sub@test.sn", "Dr Remplaçant")
        self.sub = Doctor.objects.create(
            user=self.sub_user, full_name="Dr Remplaçant", specialty=self.spec, city="Dakar", is_verified=True, order_number="SN-999"
        )
        self.titular = self.client_for(self.doc_user)
        self.substitute = self.client_for(self.sub_user)
        day = self.slot.date().isoformat()
        self.period = {"replacement_doctor_id": str(self.sub.id), "starts_on": day, "ends_on": day}

    def propose(self, **extra):
        return self.titular.post("/api/pro/replacements", {**self.period, **extra}, format="json")

    def test_validation(self):
        self.assertEqual(self.propose(replacement_doctor_id=str(self.doctor.id)).status_code, 400)
        self.assertEqual(self.propose(starts_on="2000-01-01").status_code, 400)
        self.assertEqual(self.propose().status_code, 200)
        self.assertEqual(self.propose().status_code, 400)  # période déjà proposée

    def test_accepted_replacement_takes_over_the_period(self):
        before = self.book(self.p1).data["id"]  # pris avant l'accord
        rid = self.propose().data["id"]
        self.assertTrue(Notification.objects.filter(user=self.sub_user, kind="replacement").exists())
        # Seul le remplaçant répond.
        self.assertEqual(self.titular.post(f"/api/pro/replacements/{rid}/respond", {"accept": True}, format="json").status_code, 404)
        self.assertEqual(self.substitute.post(f"/api/pro/replacements/{rid}/respond", {"accept": True}, format="json").status_code, 200)
        self.assertEqual(Appointment.objects.get(id=before).practitioner_id, self.sub.id)
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="practitioner_changed").exists())
        # Créneaux et fiche publique annoncent le remplaçant ; un nouveau RDV lui est confié.
        slots = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}/slots").data["slots"]
        same_day = [s for s in slots if s["iso"].startswith(self.period["starts_on"])]
        self.assertTrue(same_day and all(s["replacement"] == "Dr Remplaçant" for s in same_day))
        page = self.client_for().get(f"/api/directory/doctors/{self.doctor.id}").data
        self.assertEqual(page["replacements"][0]["replacement"]["full_name"], "Dr Remplaçant")
        new = self.book(self.p2, when=self.slot + timedelta(minutes=30)).data["id"]
        self.assertEqual(Appointment.objects.get(id=new).practitioner_id, self.sub.id)
        self.assertEqual(self.client_for(self.p2).get("/api/appointments/mine").data[0]["practitioner"]["full_name"], "Dr Remplaçant")
        # Le remplaçant voit et gère ces rendez-vous.
        agenda = self.substitute.get("/api/pro/appointments").data
        self.assertEqual({a["id"] for a in agenda}, {before, new})
        self.assertEqual(self.substitute.post(f"/api/pro/appointments/{before}/status", {"status": "confirmed"}, format="json").status_code, 200)

    def test_substitute_writes_record_and_titular_reads_it(self):
        appt_id = self.book(self.p1).data["id"]
        rid = self.propose().data["id"]
        self.substitute.post(f"/api/pro/replacements/{rid}/respond", {"accept": True}, format="json")
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        res = self.substitute.post(f"/api/pro/appointments/{appt_id}/record", {"summary": "Angine, repos."}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(MedicalRecord.objects.get().doctor_id, self.sub.id)
        titular_view = self.titular.get(f"/api/pro/patients/{self.p1.id}").data
        self.assertEqual(titular_view["records"][0]["author"], "Dr Remplaçant")
        self.assertEqual(self.substitute.get(f"/api/pro/patients/{self.p1.id}").status_code, 200)
        # Ordonnance du remplaçant : à son nom, avec la mention du titulaire et au cabinet du titulaire.
        snap = issuer_snapshot(self.sub, Appointment.objects.select_related("doctor", "location").get(id=appt_id))
        self.assertEqual((snap["order_number"], snap["replacing"], snap["city"]), ("SN-999", "Dr Test", "Dakar"))

    def test_full_medical_flow_by_substitute(self):
        """Ordonnance signée par le remplaçant, lue par le patient, le titulaire et la pharmacie ; documents partagés."""
        from django.utils import timezone

        from medical.models import DocumentShare, MedicalDocument, Prescription

        self.sub.signature_path = "signatures/sub/signature.png"
        self.sub.save()
        appt_id = self.book(self.p1).data["id"]
        rid = self.propose().data["id"]
        self.substitute.post(f"/api/pro/replacements/{rid}/respond", {"accept": True}, format="json")
        # La consultation a lieu (ordonnance interdite avant l'heure).
        self.set_appointment(appt_id, status="confirmed", scheduled_at=timezone.now() - timedelta(minutes=5))
        item = {"name": "Amoxicilline", "dosage": "1 g", "posology": "1 cp matin et soir", "duration": "7 jours", "quantity": "1 boîte"}
        res = self.substitute.post(
            f"/api/pro/appointments/{appt_id}/record", {"summary": "Angine bactérienne.", "items": [item]}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        rx = Prescription.objects.get(id=res.data["prescription_id"])
        self.assertEqual((rx.doctor_id, rx.issuer["order_number"], rx.issuer["replacing"]), (self.sub.id, "SN-999", "Dr Test"))
        # Patient, titulaire et remplaçant lisent l'ordonnance ; un inconnu non.
        for client in (self.client_for(self.p1), self.titular, self.substitute):
            got = client.get(f"/api/documents/prescriptions/{rx.id}")
            self.assertEqual(got.status_code, 200)
            self.assertEqual(got.data["issuer"]["replacing"], "Dr Test")
        self.assertEqual(self.client_for(self.p2).get(f"/api/documents/prescriptions/{rx.id}").status_code, 404)
        # Vérification publique (QR code) : mention du titulaire, pas de contenu médical.
        check = self.client_for().post("/api/documents/prescriptions/verify", {"reference": rx.reference}, format="json").data
        self.assertEqual((check["valid"], check["replacing"], check["doctor_order_number"]), (True, "Dr Test", "SN-999"))
        self.assertNotIn("content", check)
        # Dossier du patient : le compte-rendu apparaît avec le nom du médecin qui l'a rédigé.
        health = self.client_for(self.p1).get("/api/patient/health").data
        self.assertEqual(health["records"][0]["doctor"]["full_name"], "Dr Remplaçant")
        # Documents : partagés avec le titulaire → lisibles par son remplaçant ; partage direct possible.
        doc = MedicalDocument.objects.create(
            patient=self.p1, uploaded_by=self.p1, title="Analyse", file_path="x/analyse.pdf", mime_type="application/pdf"
        )
        DocumentShare.objects.create(document=doc, doctor=self.doctor)
        # Avant le début du remplacement (plus d'un jour avant) : pas d'accès aux documents du titulaire.
        self.assertEqual(self.substitute.post(f"/api/documents/{doc.id}/url").status_code, 404)
        Replacement.objects.update(starts_at=timezone.now() - timedelta(hours=1))
        self.assertEqual(self.substitute.post(f"/api/documents/{doc.id}/url").status_code, 200)
        titles = [d["title"] for d in self.substitute.get(f"/api/pro/patients/{self.p1.id}").data["documents"]]
        self.assertEqual(titles, ["Analyse"])
        targets = {d["id"] for d in self.client_for(self.p1).get("/api/documents/share-targets").data}
        self.assertEqual(targets, {str(self.doctor.id), str(self.sub.id)})
        shared = self.client_for(self.p1).post(f"/api/documents/{doc.id}/share", {"doctor_id": str(self.sub.id)}, format="json")
        self.assertEqual(shared.status_code, 200)
        # Après la fin du remplacement (+30 jours), plus d'accès aux documents du titulaire.
        Replacement.objects.update(starts_at=timezone.now() - timedelta(days=60), ends_at=timezone.now() - timedelta(days=45))
        DocumentShare.objects.filter(doctor=self.sub).delete()
        self.assertEqual(self.substitute.post(f"/api/documents/{doc.id}/url").status_code, 404)

    def test_unrelated_doctor_has_no_access(self):
        other_user = self.make_user("other@test.sn", "Dr Autre")
        Doctor.objects.create(user=other_user, full_name="Dr Autre", specialty=self.spec, city="Thiès", is_verified=True)
        appt_id = self.book(self.p1).data["id"]
        rid = self.propose().data["id"]
        other = self.client_for(other_user)
        self.assertEqual(other.post(f"/api/pro/replacements/{rid}/respond", {"accept": True}, format="json").status_code, 404)
        self.assertEqual(other.post(f"/api/pro/appointments/{appt_id}/status", {"status": "confirmed"}, format="json").status_code, 404)
        self.assertEqual(other.get("/api/pro/appointments").data, [])

    def test_cancel_returns_appointments_to_titular(self):
        appt_id = self.book(self.p1).data["id"]
        rid = self.propose().data["id"]
        self.substitute.post(f"/api/pro/replacements/{rid}/respond", {"accept": True}, format="json")
        res = self.substitute.post(f"/api/pro/replacements/{rid}/cancel")
        self.assertEqual(res.data["returned_appointments"], 1)
        self.assertIsNone(Appointment.objects.get(id=appt_id).practitioner_id)
        self.assertEqual(Replacement.objects.get().status, "cancelled")
        self.assertTrue(Notification.objects.filter(user=self.doc_user, title="Remplacement annulé").exists())

    def test_declined_changes_nothing(self):
        appt_id = self.book(self.p1).data["id"]
        rid = self.propose().data["id"]
        self.substitute.post(f"/api/pro/replacements/{rid}/respond", {"accept": False}, format="json")
        self.assertIsNone(Appointment.objects.get(id=appt_id).practitioner_id)
        data = self.titular.get("/api/pro/replacements").data
        self.assertEqual(data["given"][0]["status"], "declined")
