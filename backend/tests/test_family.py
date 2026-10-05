"""Entraide familiale : invitation et accord par code, droits, crédit santé, paiement par un proche, remboursement."""

from datetime import timedelta
from unittest import mock

from django.utils import timezone

from family import logic
from family.models import CareLink, CreditEntry, CreditTopUp
from payments.models import LedgerEntry, Payment

from .test_security import ApiTestCase


class FamilyTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.son = self.make_user("fils@test.sn", "Moussa (Paris)")
        self.mother = self.p1
        self.mother.phone, self.mother.phone_verified = "+221771234567", True
        self.mother.save()

    def invite(self, **extra):
        with mock.patch("family.logic.secrets.randbelow", return_value=482913):
            return self.client_for(self.son).post(
                "/api/family/links", {"phone": "77 123 45 67", "full_name": "Awa Ndiaye", "label": "Maman", **extra}, format="json"
            )

    def active_link(self, **extra) -> CareLink:
        link_id = self.invite(**extra).data["id"]
        res = self.client_for(self.son).post(f"/api/family/links/{link_id}/confirm", {"code": "482913"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return CareLink.objects.get(id=link_id)

    def test_consent_by_code(self):
        res = self.invite(can_book=True)
        self.assertEqual((res.status_code, res.data["status"]), (200, "pending"))
        link_id = res.data["id"]
        url = f"/api/family/links/{link_id}/confirm"
        self.assertEqual(self.client_for(self.son).post(url, {"code": "000000"}, format="json").status_code, 400)
        self.assertEqual(self.client_for(self.p2).post(url, {"code": "482913"}, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.son).post(url, {"code": "482913"}, format="json").data["status"], "active")
        # La mère voit qui l'aide et peut retirer l'accès.
        mine = self.client_for(self.mother).get("/api/family/links").data
        self.assertEqual((mine[0]["role"], mine[0]["sponsor"]["full_name"]), ("beneficiary", "Moussa (Paris)"))
        self.assertEqual(self.client_for(self.mother).post(f"/api/family/links/{link_id}/revoke").status_code, 200)
        self.assertEqual(self.client_for(self.son).get(f"/api/family/links/{link_id}").status_code, 404)

    def test_new_beneficiary_account_and_limits(self):
        res = self.client_for(self.son).post("/api/family/links", {"phone": "78 000 11 22", "full_name": "Tonton Ibra"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(CareLink.objects.get(id=res.data["id"]).beneficiary.phone, "+221780001122")
        self.assertEqual(self.client_for(self.son).post("/api/family/links", {"phone": "78 000 11 22", "full_name": "x y"}, format="json").status_code, 400)
        link = CareLink.objects.get(id=res.data["id"])
        link.invite_expires_at = timezone.now() - timedelta(minutes=1)
        link.save()
        self.assertIn("expiré", self.client_for(self.son).post(f"/api/family/links/{link.id}/confirm", {"code": "1"}, format="json").data["error"])

    def test_rights_records_and_booking(self):
        link = self.active_link()
        self.assertNotIn("records", self.client_for(self.son).get(f"/api/family/links/{link.id}").data)
        # Le proche ne peut pas s'accorder un droit ; la bénéficiaire, si.
        settings_url = f"/api/family/links/{link.id}/settings"
        self.assertEqual(self.client_for(self.son).post(settings_url, {"can_see_records": True}, format="json").status_code, 400)
        self.assertEqual(self.client_for(self.mother).post(settings_url, {"can_see_records": True, "can_book": True}, format="json").status_code, 200)
        self.assertIn("records", self.client_for(self.son).get(f"/api/family/links/{link.id}").data)
        res = self.client_for(self.son).post(
            "/api/appointments/", {"doctor_id": str(self.doctor.id), "scheduled_at": self.slot.isoformat(), "care_link_id": str(link.id)}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        from appointments.models import Appointment

        appt = Appointment.objects.get(id=res.data["id"])
        self.assertEqual((appt.patient_id, appt.booked_by_id), (self.mother.id, self.son.id))

    def test_credit_pay_and_refund(self):
        link = self.active_link()
        appt = self.book(self.mother)
        appt_id = appt.data["id"] if hasattr(appt, "data") else appt.id
        pay_url = f"/api/family/links/{link.id}/pay"
        self.assertEqual(self.client_for(self.son).post(pay_url, {"appointment_id": appt_id, "method": "credit"}, format="json").status_code, 400)
        topup = CreditTopUp.objects.create(link=link, amount=50_000, reference="FAM-TEST", status="paid", paid_at=timezone.now())
        logic.credit_topup(topup)
        self.assertEqual(logic.balance(link), 50_000)
        res = self.client_for(self.son).post(pay_url, {"appointment_id": appt_id, "method": "credit"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        payment = Payment.objects.get(appointment_id=appt_id)
        self.assertEqual((payment.status, payment.payer_id, payment.method), ("paid", self.son.id, "credit"))
        self.assertTrue(LedgerEntry.objects.filter(payment=payment, kind="earning").exists())  # le médecin est crédité
        spent = 50_000 - logic.balance(link)
        self.assertEqual(spent, payment.amount)
        receipt = self.client_for(self.son).get(f"/api/payments/{payment.id}/receipt")
        self.assertEqual((receipt.status_code, receipt.data["payer_name"]), (200, "Moussa (Paris)"))
        # Annulation : le montant revient aussitôt sur le crédit.
        self.client_for(self.mother).post(f"/api/appointments/{appt_id}/cancel", {"reason": "Empêchée"}, format="json")
        self.assertEqual(logic.balance(link), 50_000)
        self.assertEqual(Payment.objects.get(id=payment.id).status, "refunded")
        self.assertTrue(CreditEntry.objects.filter(link=link, kind="refund").exists())

    def test_beneficiary_pays_with_offered_credit(self):
        link = self.active_link()
        CreditEntry.objects.create(link=link, kind="topup", amount=30_000)
        appt = self.book(self.mother)
        appt_id = appt.data["id"] if hasattr(appt, "data") else appt.id
        res = self.client_for(self.mother).post("/api/payments/start", {"appointment_id": appt_id, "method": "credit"}, format="json")
        self.assertEqual((res.status_code, res.data["kind"]), (200, "paid"))
        self.assertEqual(self.client_for(self.p2).get(f"/api/family/links/{link.id}").status_code, 404)

    def test_family_is_told_about_appointments(self):
        from notifications.models import Notification

        self.active_link()
        self.book(self.mother)
        self.assertTrue(Notification.objects.filter(user=self.son, kind="family", title__startswith="Rendez-vous de Maman").exists())
