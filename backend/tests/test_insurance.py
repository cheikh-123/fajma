"""Assurances : couvertures du patient, organismes acceptés, part patient en tiers payant."""

from accounts.models import Relative
from appointments.models import Appointment
from insurance.models import DoctorInsurer, Insurer, PatientCoverage
from payments.models import Payment

from .test_security import ApiTestCase


class InsuranceTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ipm = Insurer.objects.get(slug="ipm")
        self.axa = Insurer.objects.get(slug="axa-senegal")
        DoctorInsurer.objects.create(doctor=self.doctor, insurer=self.ipm, tiers_payant=True)
        DoctorInsurer.objects.create(doctor=self.doctor, insurer=self.axa, tiers_payant=False)

    def add_coverage(self, insurer, user=None, **extra):
        res = self.client_for(user or self.p1).post(
            "/api/insurance/coverages", {"insurer_id": str(insurer.id), "member_number": "IPM-4521", **extra}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        return res.data[-1]["id"]

    def test_reference_list_seeded(self):
        slugs = {i["slug"] for i in self.client.get("/api/insurance/insurers").data}
        self.assertTrue({"cmu-mutuelle", "ipm", "plan-sesame"} <= slugs)

    def test_tiers_payant_patient_share_and_payment_amount(self):
        cov = self.add_coverage(self.ipm, coverage_percent=80)
        res = self.book(self.p1, coverage_id=cov)
        self.assertEqual(res.status_code, 200, res.data)
        appt = Appointment.objects.get(id=res.data["id"])
        self.assertEqual((appt.patient_share, appt.coverage_percent, appt.insurance_member_number), (3000, 80, "IPM-4521"))
        mine = self.client_for(self.p1).get("/api/appointments/mine").data[0]
        self.assertEqual(mine["amount_due"], 3000)
        self.assertEqual(mine["insurance"]["insurer_share"], 12000)
        # Le paiement porte sur la part patient uniquement.
        self.client_for(self.p1).post("/api/payments/start", {"appointment_id": str(appt.id), "method": "cash"}, format="json")
        self.assertEqual(Payment.objects.get(appointment=appt).amount, 3000)
        agenda = self.client_for(self.doc_user).get("/api/pro/appointments").data
        self.assertEqual(agenda[0]["insurance"]["insurer"], self.ipm.name)

    def test_without_tiers_payant_full_price(self):
        cov = self.add_coverage(self.axa, coverage_percent=70)
        appt = Appointment.objects.get(id=self.book(self.p1, coverage_id=cov).data["id"])
        self.assertIsNone(appt.patient_share)
        self.assertEqual(appt.amount_due, 15000)
        self.assertEqual(appt.insurer, self.axa)

    def test_refused_cases(self):
        cmu = Insurer.objects.get(slug="cmu-mutuelle")
        not_accepted = self.add_coverage(cmu)
        self.assertEqual(self.book(self.p1, coverage_id=not_accepted).status_code, 400)
        other_patient_cov = self.add_coverage(self.ipm, user=self.p2)
        self.assertEqual(self.book(self.p1, coverage_id=other_patient_cov).status_code, 400)
        expired = self.add_coverage(self.ipm, valid_until="2020-01-01")
        self.assertEqual(self.book(self.p1, coverage_id=expired).status_code, 400)
        # Couverture d'un enfant : pas utilisable pour le parent lui-même.
        child = Relative.objects.create(owner=self.p1, full_name="Enfant")
        child_cov = self.add_coverage(self.ipm, relative_id=str(child.id))
        self.assertEqual(self.book(self.p1, coverage_id=child_cov).status_code, 400)
        self.assertEqual(self.book(self.p1, coverage_id=child_cov, relative_id=str(child.id)).status_code, 200)

    def test_coverage_privacy_and_delete(self):
        cov = self.add_coverage(self.ipm)
        self.assertEqual(self.client_for(self.p2).get("/api/insurance/coverages").data, [])
        self.assertEqual(self.client_for(self.p2).post(f"/api/insurance/coverages/{cov}/delete").status_code, 404)
        self.assertEqual(self.client_for(self.p1).post(f"/api/insurance/coverages/{cov}/delete").status_code, 200)
        self.assertFalse(PatientCoverage.objects.exists())

    def test_doctor_manages_list_and_directory_filter(self):
        doc = self.client_for(self.doc_user)
        cmu = Insurer.objects.get(slug="cmu-mutuelle")
        res = doc.post("/api/insurance/pro", {"insurers": [{"insurer_id": str(cmu.id), "tiers_payant": True}]}, format="json")
        self.assertEqual([i["slug"] for i in res.data], ["cmu-mutuelle"])
        self.assertEqual(len(self.client.get("/api/directory/doctors?insurer=cmu-mutuelle").data), 1)
        self.assertEqual(len(self.client.get("/api/directory/doctors?insurer=ipm").data), 0)
        page = self.client.get(f"/api/directory/doctors/{self.doctor.id}").data
        self.assertEqual(page["insurers"][0]["tiers_payant"], True)
        self.assertEqual(self.client_for(self.p1).post("/api/insurance/pro", {"insurers": []}, format="json").status_code, 404)

    def test_receipt_shows_insurance(self):
        cov = self.add_coverage(self.ipm, coverage_percent=80)
        appt_id = self.book(self.p1, coverage_id=cov).data["id"]
        self.client_for(self.doc_user).post(f"/api/pro/appointments/{appt_id}/cash-paid")
        payment = Payment.objects.get(appointment_id=appt_id)
        self.assertEqual(payment.amount, 3000)
        receipt = self.client_for(self.p1).get(f"/api/payments/{payment.id}/receipt").data
        self.assertEqual(receipt["insurance"]["patient_share"], 3000)
        self.assertEqual(receipt["full_price"], 15000)
