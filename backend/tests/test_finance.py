"""Argent : commission, solde du médecin, remboursements, virements et abonnements."""

from unittest import mock

from django.test import override_settings

from accounts.models import User
from payments.models import LedgerEntry, Payment, Payout, Refund, SubscriptionPayment

from .test_security import PASSWORD, ApiTestCase

PAYDUNYA_KEYS = {"MASTER_KEY": "m", "PRIVATE_KEY": "p", "TOKEN": "t", "MODE": "test"}


@override_settings(PAYDUNYA=PAYDUNYA_KEYS)
class FinanceTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(email="admin@test.sn", password=PASSWORD, full_name="Admin", is_staff=True)

    def pay_online(self, user=None, token="tok-1"):
        """Réserve puis paie en ligne (PayDunya simulé) ; renvoie (id du RDV, paiement)."""
        user = user or self.p1
        appt_id = self.book(user).data["id"]
        with mock.patch("payments.views.create_invoice", return_value=(token, "https://pay.example/x")):
            res = self.client_for(user).post("/api/payments/start", {"appointment_id": appt_id, "method": "wave"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        payment = Payment.objects.get(appointment_id=appt_id)
        with mock.patch("payments.paydunya.confirm_invoice", return_value=("completed", payment.amount)):
            self.client.post("/api/payments/paydunya/webhook", {"data": {"invoice": {"token": token}}}, content_type="application/json")
        payment.refresh_from_db()
        self.assertEqual(payment.status, "paid")
        return appt_id, payment

    def finance(self):
        return self.client_for(self.doc_user).get("/api/pro/finance").data

    def test_online_payment_credits_doctor_minus_commission_once(self):
        _, payment = self.pay_online()
        # Deuxième notification PayDunya : aucune double écriture.
        with mock.patch("payments.paydunya.confirm_invoice", return_value=("completed", payment.amount)):
            self.client.post("/api/payments/paydunya/webhook", {"data": {"invoice": {"token": "tok-1"}}}, content_type="application/json")
        data = self.finance()
        self.assertEqual(data["subscription"]["plan"], "essentiel")
        self.assertEqual(data["balance"], 15000 - 1200)  # commission Essentiel 8 %
        self.assertEqual(data["totals"]["commission"], 1200)
        self.assertEqual(LedgerEntry.objects.count(), 1)

    def test_cash_payment_not_in_ledger(self):
        appt_id = self.book(self.p1).data["id"]
        self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt_id}/cash-paid")
        self.assertEqual(self.finance()["balance"], 0)

    def test_cancellation_opens_refund_and_debits_doctor(self):
        appt_id, payment = self.pay_online()
        res = self.client_for(self.p1).post(f"/api/appointments/{appt_id}/cancel")
        self.assertEqual(res.status_code, 200, res.data)
        refund = Refund.objects.get(payment=payment)
        self.assertEqual(refund.amount, 15000)
        self.assertEqual(self.finance()["balance"], 0)
        mine = self.client_for(self.p1).get("/api/appointments/mine").data[0]
        self.assertEqual(mine["payments"][0]["refund_status"], "pending")
        # Le patient et le médecin ne peuvent pas valider un remboursement.
        for user in (self.p1, self.doc_user):
            res = self.client_for(user).post(f"/api/admin/refunds/{refund.id}", {"transfer_reference": "WAVE-1"}, format="json")
            self.assertEqual(res.status_code, 403)
        res = self.client_for(self.admin).post(f"/api/admin/refunds/{refund.id}", {"transfer_reference": "WAVE-1"}, format="json")
        self.assertEqual(res.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, "refunded")
        res = self.client_for(self.admin).post(f"/api/admin/refunds/{refund.id}", {"transfer_reference": "WAVE-1"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_payout_rules(self):
        self.pay_online()
        doc = self.client_for(self.doc_user)
        payout = {"method": "wave", "destination": "771112233"}
        self.assertEqual(doc.post("/api/pro/payouts", {**payout, "amount": 4000}, format="json").status_code, 400)  # minimum
        self.assertEqual(doc.post("/api/pro/payouts", {**payout, "amount": 20000}, format="json").status_code, 400)  # > solde
        res = doc.post("/api/pro/payouts", {**payout, "amount": 10000}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.finance()["balance"], 13800 - 10000)
        # Une seule demande à la fois.
        self.assertEqual(doc.post("/api/pro/payouts", {**payout, "amount": 5000}, format="json").status_code, 400)
        # Refus par l'administration : le montant est recrédité.
        res = self.client_for(self.admin).post(f"/api/admin/payouts/{res.data['id']}", {"decision": "rejected", "note": "Numéro erroné"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.finance()["balance"], 13800)
        res = doc.post("/api/pro/payouts", {**payout, "amount": 13800}, format="json")
        # Versement confirmé : référence de transfert obligatoire.
        admin = self.client_for(self.admin)
        self.assertEqual(admin.post(f"/api/admin/payouts/{res.data['id']}", {"decision": "paid"}, format="json").status_code, 400)
        self.assertEqual(admin.post(f"/api/admin/payouts/{res.data['id']}", {"decision": "paid", "note": "OM-778"}, format="json").status_code, 200)
        self.assertEqual(Payout.objects.get(id=res.data["id"]).status, "paid")
        self.assertEqual(self.finance()["balance"], 0)
        self.assertEqual(self.client_for(self.p1).post("/api/pro/payouts", {**payout, "amount": 5000}, format="json").status_code, 404)

    def test_ledger_is_immutable(self):
        self.pay_online()
        entry = LedgerEntry.objects.get()
        with self.assertRaises(ValueError):
            entry.save()
        with self.assertRaises(ValueError):
            entry.delete()

    def test_subscription_lowers_commission(self):
        doc = self.client_for(self.doc_user)
        with mock.patch("payments.views_finance.create_invoice", return_value=("sub-tok", "https://pay.example/s")):
            res = doc.post("/api/pro/subscription/checkout", {"plan": "pro", "months": 3}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["amount"], 45000 - 2250)  # 3 mois, remise 5 %
        sp = SubscriptionPayment.objects.get()
        # Paiement non confirmé : toujours en Essentiel.
        with mock.patch("payments.paydunya.confirm_invoice", return_value=("pending", None)):
            doc.post(f"/api/pro/subscription/{sp.id}/refresh")
        self.assertEqual(self.finance()["subscription"]["plan"], "essentiel")
        with mock.patch("payments.paydunya.confirm_invoice", return_value=("completed", sp.amount)):
            self.client.post("/api/payments/paydunya/webhook", {"data": {"invoice": {"token": "sub-tok"}}}, content_type="application/json")
            res = doc.post(f"/api/pro/subscription/{sp.id}/refresh")
        self.assertEqual(res.data["status"], "paid")
        data = self.finance()
        self.assertEqual(data["subscription"]["plan"], "pro")
        period_end = data["subscription"]["current_period_end"]
        self.assertIsNotNone(period_end)
        # Activation appliquée une seule fois malgré webhook + retour navigateur.
        sp.refresh_from_db()
        self.assertEqual(sp.period_end.isoformat().replace("+00:00", "Z")[:16], period_end[:16])
        _, payment = self.pay_online(token="tok-2")
        self.assertEqual(LedgerEntry.objects.get(payment=payment).commission, 450)  # 3 %

    def test_underpaid_subscription_not_activated(self):
        doc = self.client_for(self.doc_user)
        with mock.patch("payments.views_finance.create_invoice", return_value=("sub-tok", "https://pay.example/s")):
            doc.post("/api/pro/subscription/checkout", {"plan": "clinique", "months": 1}, format="json")
        sp = SubscriptionPayment.objects.get()
        with mock.patch("payments.paydunya.confirm_invoice", return_value=("completed", 100)):
            doc.post(f"/api/pro/subscription/{sp.id}/refresh")
        self.assertEqual(self.finance()["subscription"]["plan"], "essentiel")

    def test_admin_finance_totals(self):
        self.pay_online()
        self.assertEqual(self.client_for(self.doc_user).get("/api/admin/finance").status_code, 403)
        data = self.client_for(self.admin).get("/api/admin/finance").data
        self.assertEqual(data["totals"]["online_volume"], 15000)
        self.assertEqual(data["totals"]["commission"], 1200)
        self.assertEqual(data["totals"]["doctors_balance"], 13800)
