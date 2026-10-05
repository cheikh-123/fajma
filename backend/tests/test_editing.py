"""
Corrections après coup : proches, assurances, lieux de consultation, fiche du laboratoire, équipe de clinique,
suivi des demandes d'aide. Chacun ne modifie que ce qui lui appartient.
"""

from accounts.models import Relative
from clinics.models import Clinic, ClinicMember, ClinicStaff
from directory.models import DoctorLocation
from insurance.models import Insurer, PatientCoverage
from labs.models import Laboratory, LaboratoryMember
from support.models import SupportRequest

from .test_security import ApiTestCase


class EditingTests(ApiTestCase):
    def test_relative_can_be_corrected_by_owner_only(self):
        rel = Relative.objects.create(owner=self.p1, full_name="Fatou", relationship="enfant")
        data = {"id": str(rel.id), "full_name": "Fatou Ndiaye", "relationship": "enfant", "birth_date": "2019-04-02", "sex": "F"}
        self.assertEqual(self.client_for(self.p2).post("/api/patient/relatives", data, format="json").status_code, 404)
        res = self.client_for(self.p1).post("/api/patient/relatives", data, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        rel.refresh_from_db()
        self.assertEqual((rel.full_name, rel.birth_date.isoformat(), rel.sex), ("Fatou Ndiaye", "2019-04-02", "F"))
        self.assertEqual(Relative.objects.count(), 1)

    def test_coverage_can_be_corrected(self):
        insurer = Insurer.objects.first()
        cov = PatientCoverage.objects.create(user=self.p1, insurer=insurer, member_number="AB12", coverage_percent=80)
        data = {"id": str(cov.id), "member_number": "AB-1234", "coverage_percent": 70, "valid_until": "2027-12-31"}
        self.assertEqual(self.client_for(self.p2).post("/api/insurance/coverages", data, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.p1).post("/api/insurance/coverages", data, format="json").status_code, 200)
        cov.refresh_from_db()
        self.assertEqual((cov.member_number, cov.coverage_percent, cov.valid_until.isoformat()), ("AB-1234", 70, "2027-12-31"))

    def test_doctor_location_can_be_edited(self):
        loc = DoctorLocation.objects.create(doctor=self.doctor, name="Cabinet", address="Rue 1", city="Dakar")
        data = {"id": str(loc.id), "name": "Cabinet du Point E", "address": "Rue 5", "city": "Dakar", "phone": "338240000"}
        res = self.client_for(self.doc_user).post("/api/pro/locations", data, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        loc.refresh_from_db()
        self.assertEqual((loc.name, loc.address, loc.phone), ("Cabinet du Point E", "Rue 5", "338240000"))
        other = self.make_user("doc2@test.sn", "Dr Autre")
        self.assertIn(self.client_for(other).post("/api/pro/locations", data, format="json").status_code, (403, 404))

    def test_lab_edits_its_own_card_and_admin_corrects_any(self):
        bio = self.make_user("bio@test.sn", "Biologiste")
        lab = Laboratory.objects.create(name="Labo", city="Dakar", address="Rue 1")
        other = Laboratory.objects.create(name="Autre", city="Thiès", address="Rue 2")
        LaboratoryMember.objects.create(laboratory=lab, user=bio)
        client = self.client_for(bio)
        res = client.post("/api/labs/mine", {"laboratory_id": str(lab.id), "phone": "338000000", "opening_hours": "7 h – 18 h", "name": "Piraté"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        lab.refresh_from_db()
        self.assertEqual((lab.phone, lab.opening_hours, lab.name), ("338000000", "7 h – 18 h", "Labo"))  # nom : administration
        self.assertEqual(client.post("/api/labs/mine", {"laboratory_id": str(other.id), "phone": "1"}, format="json").status_code, 404)
        self.assertEqual(self.client_for(self.p1).get("/api/labs/mine").status_code, 403)
        admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        self.assertEqual(self.client_for(bio).post(f"/api/admin/laboratories/{lab.id}", {"name": "X"}, format="json").status_code, 403)
        res = self.client_for(admin).post(f"/api/admin/laboratories/{lab.id}", {"name": "Labo Bio 24", "city": "Thiès"}, format="json")
        self.assertEqual((res.status_code, res.data["name"]), (200, "Labo Bio 24"))

    def test_clinic_owner_changes_roles_and_titles(self):
        owner = self.make_user("owner@test.sn", "Responsable")
        clinic = Clinic.objects.create(owner=owner, name="Clinique", city="Dakar")
        staff = ClinicStaff.objects.create(clinic=clinic, user=self.p2, role="secretary")
        member = ClinicMember.objects.create(clinic=clinic, doctor=self.doctor, title="Médecin")
        url = f"/api/clinics/{clinic.id}/team"
        self.assertEqual(self.client_for(self.p2).post(url, {"staff_id": str(staff.id), "role": "manager"}, format="json").status_code, 403)
        client = self.client_for(owner)
        self.assertEqual(client.post(url, {"staff_id": str(staff.id), "role": "manager"}, format="json").status_code, 200)
        self.assertEqual(client.post(url, {"member_id": str(member.id), "title": "Chef de service"}, format="json").status_code, 200)
        staff.refresh_from_db()
        member.refresh_from_db()
        self.assertEqual((staff.role, member.title), ("manager", "Chef de service"))

    def test_user_follows_own_support_requests(self):
        SupportRequest.objects.create(user=self.p1, name="Awa", contact="p1@test.sn", topic=SupportRequest.TOPICS[0][0], message="Aide", admin_note="interne")
        SupportRequest.objects.create(user=self.p2, name="Moussa", contact="p2@test.sn", topic=SupportRequest.TOPICS[0][0], message="Autre")
        rows = self.client_for(self.p1).get("/api/support/mine").data
        self.assertEqual(len(rows), 1)
        self.assertNotIn("admin_note", rows[0])
        self.assertIn(self.client_for().get("/api/support/mine").status_code, (401, 403))

    def test_admin_corrects_verified_doctor_name(self):
        from directory.models import Specialty

        admin = self.make_user("adm2@test.sn", "Admin", is_staff=True)
        cardio = Specialty.objects.exclude(id=self.doctor.specialty_id).first()
        url = f"/api/admin/doctors/{self.doctor.id}"
        data = {"full_name": "Dr Test Ndiaye", "specialty_id": str(cardio.id), "reason": "Acte de mariage"}
        self.assertEqual(self.client_for(self.doc_user).post(url, data, format="json").status_code, 403)
        self.assertEqual(self.client_for(admin).post(url, {**data, "reason": ""}, format="json").status_code, 400)
        self.assertEqual(self.client_for(admin).post(url, data, format="json").status_code, 200)
        self.doctor.refresh_from_db()
        self.assertEqual((self.doctor.full_name, self.doctor.specialty_id), ("Dr Test Ndiaye", cardio.id))
