"""Ordonnances transmises aux pharmacies : droits du patient, du pharmacien, états et traçabilité."""

from datetime import timedelta

from django.utils import timezone

from accounts.models import User
from appointments.models import Appointment
from audit.models import AuditEvent
from directory.models import Pharmacy
from medical.models import Prescription
from notifications.models import Notification
from pharmacy.models import PharmacyMember, PrescriptionOrder

from .test_security import PASSWORD, ApiTestCase


class PharmacyOrderTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.pharmacy = Pharmacy.objects.create(name="Pharmacie Guigon", city="Dakar", address="Plateau", latitude=14.6, longitude=-17.4)
        self.other_pharmacy = Pharmacy.objects.create(name="Pharmacie Ailleurs", city="Thiès", address="x", latitude=14.7, longitude=-16.9)
        self.pharmacist = User.objects.create_user(email="ph@test.sn", password=PASSWORD, full_name="Pharmacien")
        self.other_pharmacist = User.objects.create_user(email="ph2@test.sn", password=PASSWORD, full_name="Autre pharmacien")
        PharmacyMember.objects.create(pharmacy=self.pharmacy, user=self.pharmacist)
        PharmacyMember.objects.create(pharmacy=self.other_pharmacy, user=self.other_pharmacist)
        appt = Appointment.objects.get(id=self.book(self.p1).data["id"])
        self.prescription = Prescription.objects.create(
            appointment=appt, patient=self.p1, doctor=self.doctor, content="Paracétamol 1 g x3/j", valid_until=timezone.localdate() + timedelta(days=30)
        )

    def send(self, user=None, pharmacy=None, prescription=None):
        return self.client_for(user or self.p1).post(
            "/api/pharmacy/orders",
            {"prescription_id": str((prescription or self.prescription).id), "pharmacy_id": str((pharmacy or self.pharmacy).id), "note": "Générique OK"},
            format="json",
        )

    def update(self, order_id, status, user=None, **extra):
        return self.client_for(user or self.pharmacist).post(f"/api/pharmacy/orders/{order_id}/status", {"status": status, **extra}, format="json")

    def test_full_flow_with_notifications(self):
        res = self.send()
        self.assertEqual(res.status_code, 200, res.data)
        order_id = res.data["id"]
        self.assertTrue(Notification.objects.filter(user=self.pharmacist, kind="pharmacy_order").exists())
        board = self.client_for(self.pharmacist).get("/api/pharmacy/dashboard").data
        self.assertEqual(board["orders"][0]["prescription"]["content"], "Paracétamol 1 g x3/j")
        self.client_for(self.pharmacist).get("/api/pharmacy/dashboard")
        self.assertEqual(AuditEvent.objects.filter(action="prescription_viewed", patient=self.p1).count(), 1)  # une seule trace
        self.assertEqual(self.update(order_id, "preparing").status_code, 200)
        self.assertEqual(self.update(order_id, "ready", total_price=4500).status_code, 200)
        note = Notification.objects.filter(user=self.p1, kind="pharmacy_order").first()
        self.assertIn("prête", note.title)
        self.assertIn("4500", note.body)
        self.assertEqual(self.update(order_id, "collected").status_code, 200)
        self.assertEqual(self.update(order_id, "preparing").status_code, 400)  # état final
        # Une fois retirée, le contenu n'est plus renvoyé à la pharmacie.
        board = self.client_for(self.pharmacist).get("/api/pharmacy/dashboard").data
        self.assertNotIn("content", board["orders"][0]["prescription"])

    def test_only_owner_can_send_and_one_open_order(self):
        self.assertEqual(self.send(user=self.p2).status_code, 404)
        self.assertEqual(self.send().status_code, 200)
        self.assertEqual(self.send(pharmacy=self.other_pharmacy).status_code, 400)

    def test_other_pharmacy_cannot_see_or_update(self):
        order_id = self.send().data["id"]
        self.assertEqual(self.client_for(self.other_pharmacist).get("/api/pharmacy/dashboard").data["orders"], [])
        self.assertEqual(self.update(order_id, "ready", user=self.other_pharmacist).status_code, 404)
        self.assertEqual(self.client_for(self.p1).get("/api/pharmacy/dashboard").status_code, 403)
        self.assertEqual(self.update(order_id, "ready", user=self.p1).status_code, 404)

    def test_expired_and_unlisted_pharmacy_refused(self):
        self.prescription.valid_until = timezone.localdate() - timedelta(days=1)
        self.prescription.save()
        self.assertEqual(self.send().status_code, 400)
        self.prescription.valid_until = None
        self.prescription.save()
        lonely = Pharmacy.objects.create(name="Sans compte", city="Dakar", address="x", latitude=1, longitude=1)
        self.assertEqual(self.send(pharmacy=lonely).status_code, 400)

    def test_unavailable_requires_note_and_cancel_rules(self):
        order_id = self.send().data["id"]
        self.assertEqual(self.update(order_id, "unavailable").status_code, 400)
        self.assertEqual(self.update(order_id, "unavailable", note="Rupture : repassez jeudi").status_code, 200)
        # Nouvelle demande possible ailleurs une fois la première close.
        order2 = self.send(pharmacy=self.other_pharmacy).data["id"]
        self.assertEqual(self.client_for(self.p1).post(f"/api/pharmacy/orders/{order2}/cancel").status_code, 200)
        self.assertEqual(PrescriptionOrder.objects.get(id=order2).status, "cancelled")
        order3 = self.send().data["id"]
        self.update(order3, "preparing")
        self.assertEqual(self.client_for(self.p1).post(f"/api/pharmacy/orders/{order3}/cancel").status_code, 400)

    def test_admin_links_pharmacist(self):
        admin = User.objects.create_user(email="adm@test.sn", password=PASSWORD, full_name="Admin", is_staff=True)
        newbie = User.objects.create_user(email="new@test.sn", password=PASSWORD, full_name="Nouveau")
        body = {"pharmacy_id": str(self.pharmacy.id), "email": "NEW@test.sn"}
        self.assertEqual(self.client_for(newbie).post("/api/admin/pharmacy-members", body, format="json").status_code, 403)
        res = self.client_for(admin).post("/api/admin/pharmacy-members", body, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(self.client_for(newbie).get("/api/auth/me").data["user"]["is_pharmacist"])


    def test_dispensing_limited_to_renewals_and_child_named(self):
        from accounts.models import Relative

        child = Relative.objects.create(owner=self.p1, full_name="Moussa Junior", sex="M")
        Prescription.objects.filter(id=self.prescription.id).update(relative=child, patient_info={"name": "Moussa Junior", "weight_kg": 21})
        # Non renouvelable : une seule délivrance.
        order_id = self.send().data["id"]
        board = self.client_for(self.pharmacist).get("/api/pharmacy/dashboard").data["orders"][0]["prescription"]
        self.assertEqual(board["patient_name"], "Moussa Junior")
        self.assertEqual(board["account_holder"], "Awa P1")
        self.assertEqual((board["dispensed"], board["max_dispensings"]), (0, 1))
        self.update(order_id, "ready")
        self.assertEqual(self.update(order_id, "collected").status_code, 200)
        res = self.send()
        self.assertEqual(res.status_code, 400)
        self.assertIn("entièrement délivrée", str(res.data))
        # Renouvelable une fois : une seconde délivrance possible, pas une troisième.
        Prescription.objects.filter(id=self.prescription.id).update(renewals=1)
        second = self.send().data["id"]
        self.update(second, "ready")
        self.assertEqual(self.update(second, "collected").status_code, 200)
        self.assertEqual(self.send().status_code, 400)
