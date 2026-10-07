"""
Suivi à domicile (mesures, rappels de médicaments), laboratoires, disponibilité des médicaments,
cliniques publiques, « Mes médecins », messagerie avec le remplaçant.
"""

import base64
import tempfile
from datetime import UTC, datetime, timedelta

from django.test import override_settings
from django.utils import timezone

from accounts.models import Relative
from appointments.models import Appointment
from care.models import MedicationReminder
from care.views import send_medication_reminders
from clinics.models import Clinic, ClinicMember
from directory.models import Doctor, Pharmacy, Replacement
from labs.models import LabOrder, Laboratory, LaboratoryMember
from medical.models import DocumentShare
from notifications.models import Notification
from pharmacy.models import PharmacyMember

from .test_security import ApiTestCase

PDF = b"%PDF-1.4 resultats"


class MeasurementTests(ApiTestCase):
    def test_measurements_with_advice_and_doctor_access(self):
        client = self.client_for(self.p1)
        url = "/api/patient/measurements"
        self.assertEqual(client.post(url, {"kind": "blood_pressure", "systolic": 80, "diastolic": 120}, format="json").status_code, 400)
        res = client.post(url, {"kind": "blood_pressure", "systolic": 185, "diastolic": 95, "pulse": 80}, format="json")
        self.assertEqual((res.status_code, res.data["level"]), (200, "very_high"))
        self.assertIn("1515", res.data["advice"])
        res = client.post(url, {"kind": "glucose", "value": "0,6", "context": "fasting"}, format="json")
        self.assertEqual(res.data["level"], "low")
        self.assertEqual(client.post(url, {"kind": "glucose", "value": 60}, format="json").status_code, 400)  # mg/dL au lieu de g/L
        child = Relative.objects.create(owner=self.p1, full_name="Enfant")
        client.post(url, {"kind": "weight", "value": 12.5, "relative_id": str(child.id)}, format="json")
        self.assertEqual(len(client.get(url).data), 2)
        self.assertEqual(len(client.get(url, {"relative_id": str(child.id)}).data), 1)
        # Médecin qui suit le patient : voit les mesures ; sans RDV confirmé : pas d'accès.
        # Ce médecin valide lui-même ses demandes : le rendez-vous part « en attente ».
        self.doctor.auto_confirm = False
        self.doctor.save(update_fields=["auto_confirm"])
        appt_id = self.book(self.p1).data["id"]
        self.assertEqual(self.client_for(self.doc_user).get(f"/api/pro/patients/{self.p1.id}").status_code, 404)
        Appointment.objects.filter(id=appt_id).update(status="confirmed")
        file = self.client_for(self.doc_user).get(f"/api/pro/patients/{self.p1.id}").data
        self.assertEqual(len(file["measurements"]), 3)


class MedicationReminderTests(ApiTestCase):
    def test_reminder_sent_once_at_the_right_time(self):
        client = self.client_for(self.p1)
        self.assertEqual(client.post("/api/patient/medication-reminders", {"medicine": "Amoxicilline", "times": ["25:00"]}, format="json").status_code, 400)
        today = timezone.localdate()
        res = client.post(
            "/api/patient/medication-reminders",
            {"medicine": "Amoxicilline", "dosage": "1 gélule", "times": ["08:00", "20:00"], "days": 7},
            format="json",
        )
        self.assertEqual(res.data["end_date"], (today + timedelta(days=6)).isoformat())
        at = datetime(today.year, today.month, today.day, 8, 10, tzinfo=UTC)
        self.assertEqual(send_medication_reminders(at), 1)
        self.assertEqual(send_medication_reminders(at + timedelta(minutes=10)), 0)  # pas de doublon
        self.assertEqual(send_medication_reminders(at + timedelta(hours=1)), 0)  # hors fenêtre
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="medication", body__contains="Amoxicilline").exists())
        client.post(f"/api/patient/medication-reminders/{res.data['id']}", {"active": False}, format="json")
        self.assertEqual(send_medication_reminders(at + timedelta(hours=12)), 0)
        # Traitement terminé : désactivé automatiquement.
        MedicationReminder.objects.update(active=True, end_date=today - timedelta(days=1))
        send_medication_reminders(at)
        self.assertFalse(MedicationReminder.objects.get().active)


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class LabTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.lab_user = self.make_user("lab@test.sn", "Biologiste")
        self.lab = Laboratory.objects.create(name="Labo Dakar", city="Dakar", address="Rue 1", is_verified=True)
        LaboratoryMember.objects.create(laboratory=self.lab, user=self.lab_user)
        self.appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=self.appt_id).update(status="confirmed")

    def test_full_lab_flow(self):
        doc = self.client_for(self.doc_user)
        res = doc.post(f"/api/pro/appointments/{self.appt_id}/lab-order", {"tests": "NFS, glycémie à jeun", "instructions": "À jeun"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        order_id = res.data["id"]
        patient = self.client_for(self.p1)
        self.assertEqual([lab["name"] for lab in patient.get("/api/labs/laboratories").data], ["Labo Dakar"])
        # Le laboratoire ne voit rien tant que le patient ne l'a pas choisi.
        lab = self.client_for(self.lab_user)
        self.assertEqual(lab.get("/api/labs/dashboard").data["orders"], [])
        self.assertEqual(self.client_for(self.p2).post(f"/api/labs/orders/{order_id}/send", {"laboratory_id": str(self.lab.id)}, format="json").status_code, 404)
        patient.post(f"/api/labs/orders/{order_id}/send", {"laboratory_id": str(self.lab.id)}, format="json")
        orders = lab.get("/api/labs/dashboard").data["orders"]
        self.assertEqual((orders[0]["tests"], orders[0]["patient"]["full_name"]), ("NFS, glycémie à jeun", "Awa P1"))
        lab.post(f"/api/labs/orders/{order_id}/receive")
        res = lab.post(
            f"/api/labs/orders/{order_id}/result",
            {"file_name": "resultats.pdf", "content_base64": base64.b64encode(PDF).decode(), "note": "Glycémie 1,05 g/L"},
            format="json",
        )
        self.assertEqual(res.data["status"], "completed")
        order = LabOrder.objects.get(id=order_id)
        doc_file = order.results.get()
        self.assertTrue(DocumentShare.objects.filter(document=doc_file, doctor=self.doctor).exists())
        self.assertEqual(self.client_for(self.doc_user).post(f"/api/documents/{doc_file.id}/url").status_code, 200)
        self.assertEqual(patient.get("/api/labs/orders").data[0]["results"][0]["id"], str(doc_file.id))
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="lab_result").exists())
        # Un autre laboratoire n'a aucun accès.
        other = self.make_user("lab2@test.sn", "Autre labo")
        LaboratoryMember.objects.create(laboratory=Laboratory.objects.create(name="Autre", city="Thiès", address="x"), user=other)
        self.assertEqual(self.client_for(other).post(f"/api/labs/orders/{order_id}/receive").status_code, 404)

    def test_admin_creates_lab_and_links_member(self):
        adm = self.client_for(self.make_user("adm@test.sn", "Admin", is_staff=True))
        res = adm.post("/api/admin/laboratories", {"name": "Labo Médina", "city": "Dakar", "district": "Médina", "address": "Rue 6"}, format="json")
        lab = next(x for x in res.data if x["name"] == "Labo Médina")
        self.assertIsNotNone(lab["latitude"])
        self.assertEqual(adm.post(f"/api/admin/laboratories/{lab['id']}/members", {"email": "p2@test.sn"}, format="json").status_code, 200)
        self.assertTrue(self.client_for(self.p2).get("/api/auth/me").data["user"]["is_lab"])


class MedicineQueryTests(ApiTestCase):
    def test_patient_asks_pharmacies_and_gets_answers(self):
        pharmacist = self.make_user("ph@test.sn", "Pharmacien")
        p1 = Pharmacy.objects.create(name="Officine A", city="Dakar", address="Rue 1", latitude=14.7, longitude=-17.4, is_verified=True)
        p2 = Pharmacy.objects.create(name="Sans pharmacien", city="Dakar", address="Rue 2", latitude=14.7, longitude=-17.4)
        PharmacyMember.objects.create(pharmacy=p1, user=pharmacist)
        client = self.client_for(self.p1)
        self.assertEqual(client.post("/api/pharmacy/queries", {"medicine": "Coartem", "pharmacy_ids": [str(p2.id)]}, format="json").status_code, 400)
        res = client.post("/api/pharmacy/queries", {"medicine": "Coartem", "note": "boîte de 24", "pharmacy_ids": [str(p1.id), str(p2.id)]}, format="json")
        self.assertEqual(len(res.data["answers"]), 1)
        ph = self.client_for(pharmacist)
        question = ph.get("/api/pharmacy/dashboard").data["medicine_questions"][0]
        self.assertEqual(question["medicine"], "Coartem")
        self.assertNotIn("patient", question)  # la pharmacie ne voit pas qui demande
        self.assertEqual(ph.post(f"/api/pharmacy/answers/{question['id']}", {"status": "available", "price": 4500}, format="json").status_code, 200)
        answer = client.get("/api/pharmacy/queries").data[0]["answers"][0]
        self.assertEqual((answer["status"], answer["price"]), ("available", 4500))
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="medicine_answer").exists())
        self.assertEqual(self.client_for(self.p2).post(f"/api/pharmacy/answers/{question['id']}", {"status": "available"}, format="json").status_code, 404)


class DirectoryAndThreadsTests(ApiTestCase):
    def test_public_clinics_exclude_solo_practices(self):
        owner = self.make_user("owner@test.sn", "Responsable")
        clinic = Clinic.objects.create(owner=owner, name="Clinique du Cap", city="Dakar", is_verified=True)
        ClinicMember.objects.create(clinic=clinic, doctor=self.doctor)
        practice = Clinic.objects.create(owner=self.doc_user, name="Cabinet Dr Test", city="Dakar", is_verified=True, kind="practice")
        ClinicMember.objects.create(clinic=practice, doctor=self.doctor)
        names = [c["name"] for c in self.client_for().get("/api/directory/clinics").data]
        self.assertEqual(names, ["Clinique du Cap"])
        detail = self.client_for().get(f"/api/directory/clinics/{clinic.id}").data
        self.assertEqual(detail["doctors"][0]["full_name"], "Dr Test")
        self.assertEqual(self.client_for().get(f"/api/directory/clinics/{practice.id}").status_code, 404)

    def test_my_doctors(self):
        appt_id = self.book(self.p1).data["id"]
        self.set_appointment(appt_id, status="completed", scheduled_at=timezone.now() - timedelta(days=3))
        mine = self.client_for(self.p1).get("/api/patient/my-doctors").data
        self.assertEqual((mine[0]["full_name"], mine[0]["visits"]), ("Dr Test", 1))
        self.assertIsNotNone(mine[0]["next_slot"])

    def test_substitute_can_message_patient(self):
        sub_user = self.make_user("sub@test.sn", "Dr Remplaçant")
        sub = Doctor.objects.create(user=sub_user, full_name="Dr Remplaçant", specialty=self.spec, city="Dakar", is_verified=True)
        appt_id = self.book(self.p1).data["id"]
        Appointment.objects.filter(id=appt_id).update(practitioner=sub)
        Replacement.objects.create(doctor=self.doctor, replacement=sub, starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=5), status="accepted")
        data = {"doctor_id": str(sub.id), "patient_id": str(self.p1.id), "body": "Bonjour, je remplace le Dr Test."}
        self.assertEqual(self.client_for(sub_user).post("/api/messages/send", data, format="json").status_code, 200)
        titles = [t["title"] for t in self.client_for(self.p1).get("/api/messages/threads").data]
        self.assertIn("Dr Remplaçant", titles)
        self.assertEqual(self.client_for(self.p2).post("/api/messages/send", {**data, "patient_id": str(self.p2.id)}, format="json").status_code, 403)
