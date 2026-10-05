"""
Gestion des comptes : double authentification obligatoire pour les professionnels, changement de mot de passe,
outils de l'administration (recherche, suspension), fiches modifiables (médecin, pharmacie, clinique),
secrétariat d'un médecin qui exerce seul.
"""

import base64
import tempfile
from datetime import timedelta

from django.test import Client, override_settings
from django.utils import timezone

from accounts import totp
from accounts.models import TwoFactor, User
from clinics.models import Clinic, ClinicMember, ClinicStaff
from directory.models import Doctor, Pharmacy
from pharmacy.models import PharmacyMember

from .test_security import PASSWORD, ApiTestCase, iso

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def session_client(user) -> Client:
    """Client avec une vraie session (comme le navigateur) : la règle de double authentification s'applique."""
    client = Client()
    client.force_login(user)
    return client


class MandatoryMfaTests(ApiTestCase):
    def test_professional_blocked_until_mfa_enabled(self):
        client = session_client(self.doc_user)
        res = client.get("/api/pro/appointments")
        self.assertEqual(res.status_code, 403)
        self.assertTrue(res.json()["mfa_setup_required"])
        me = client.get("/api/auth/me").json()["user"]
        self.assertTrue(me["mfa_setup_required"])
        # L'activation reste possible (routes /api/auth/).
        secret = client.post("/api/auth/mfa", {"action": "start"}, content_type="application/json").json()["secret"]
        res = client.post("/api/auth/mfa", {"action": "confirm", "code": totp.current_code(secret)}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(client.get("/api/pro/appointments").status_code, 200)
        self.assertFalse(client.get("/api/auth/me").json()["user"]["mfa_setup_required"])

    def test_patient_not_concerned(self):
        client = session_client(self.p1)
        self.assertEqual(client.get("/api/appointments/mine").status_code, 200)
        self.assertFalse(client.get("/api/auth/me").json()["user"]["mfa_setup_required"])

    def test_pharmacist_secretary_and_admin_concerned(self):
        pharmacist = self.make_user("ph@test.sn", "Pharmacien")
        pharmacy = Pharmacy.objects.create(name="Officine", city="Dakar", address="Rue 1", latitude=14.7, longitude=-17.4)
        PharmacyMember.objects.create(pharmacy=pharmacy, user=pharmacist)
        secretary = self.make_user("sec@test.sn", "Secrétaire")
        clinic = Clinic.objects.create(owner=self.p2, name="Clinique", city="Dakar")
        ClinicStaff.objects.create(clinic=clinic, user=secretary)
        admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        for user, url in ((pharmacist, "/api/pharmacy/dashboard"), (secretary, "/api/clinics/mine"), (admin, "/api/admin/overview")):
            self.assertEqual(session_client(user).get(url).status_code, 403, user.email)
        # La responsable de clinique aussi.
        self.assertEqual(session_client(self.p2).get("/api/clinics/mine").status_code, 403)

    def test_demo_session_exempt(self):
        client = session_client(self.doc_user)
        session = client.session
        session["demo"] = True
        session.save()
        self.assertEqual(client.get("/api/pro/appointments").status_code, 200)

    @override_settings(MFA_REQUIRED_FOR_PROS=False)
    def test_can_be_disabled_by_setting(self):
        self.assertEqual(session_client(self.doc_user).get("/api/pro/appointments").status_code, 200)

    def test_django_admin_has_no_password_only_login(self):
        res = Client().get("/django-admin/")
        self.assertEqual(res.status_code, 302)
        follow = Client().get(res["Location"])
        self.assertEqual(follow.status_code, 302)
        self.assertTrue(follow["Location"].startswith("/auth?redirect=/django-admin/"))
        # Administrateur sans double authentification : renvoyé vers la page de sécurité.
        admin = self.make_user("adm@test.sn", "Admin", is_staff=True, is_superuser=True)
        self.assertEqual(session_client(admin).get("/django-admin/")["Location"], "/securite")


class PasswordChangeTests(ApiTestCase):
    def test_change_password(self):
        client = self.client_for(self.p1)
        url = "/api/auth/password-change"
        self.assertEqual(client.post(url, {"current_password": "faux", "new_password": "Nouveau-mot-2026!"}, format="json").status_code, 403)
        self.assertEqual(client.post(url, {"current_password": PASSWORD, "new_password": "123"}, format="json").status_code, 400)
        self.assertEqual(client.post(url, {"current_password": PASSWORD, "new_password": PASSWORD}, format="json").status_code, 400)
        self.assertEqual(client.post(url, {"current_password": PASSWORD, "new_password": "Nouveau-mot-2026!"}, format="json").status_code, 200)
        self.p1.refresh_from_db()
        self.assertTrue(self.p1.check_password("Nouveau-mot-2026!"))

    def test_sms_account_can_set_a_password(self):
        user = User.objects.create(phone="+221770000001", phone_verified=True, full_name="Par SMS")
        user.set_unusable_password()
        user.save()
        res = self.client_for(user).post("/api/auth/password-change", {"new_password": "Nouveau-mot-2026!"}, format="json")
        self.assertEqual(res.status_code, 200)


class AdminUserTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        self.adm = self.client_for(self.admin)

    def test_search_requires_admin(self):
        self.assertEqual(self.client_for(self.p1).get("/api/admin/users").status_code, 403)
        found = self.adm.get("/api/admin/users", {"q": "Awa"}).data
        self.assertEqual([u["email"] for u in found], ["p1@test.sn"])
        self.assertEqual(self.adm.get("/api/admin/users", {"q": "77 123 45"}).data[0]["id"], str(self.p1.id))
        self.assertEqual(self.adm.get("/api/admin/users", {"q": "doc@"}).data[0]["roles"], ["doctor"])

    def test_suspend_and_reactivate(self):
        url = f"/api/admin/users/{self.doc_user.id}"
        self.assertEqual(self.adm.post(url, {"action": "suspend"}, format="json").status_code, 400)  # motif obligatoire
        victim = session_client(self.doc_user)
        TwoFactor.objects.create(user=self.doc_user, secret="JBSWY3DPEHPK3PXP", enabled=True)
        self.assertEqual(victim.get("/api/pro/appointments").status_code, 200)
        res = self.adm.post(url, {"action": "suspend", "reason": "Faux diplôme signalé"}, format="json")
        self.assertEqual((res.status_code, res.data["is_active"]), (200, False))
        self.assertFalse(Doctor.objects.get(id=self.doctor.id).is_verified)  # retiré de l'annuaire
        self.assertEqual(victim.get("/api/pro/appointments").status_code, 403)  # session coupée
        self.assertEqual(self.client_for().post("/api/auth/login", {"email": "doc@test.sn", "password": PASSWORD}, format="json").status_code, 401)
        res = self.adm.post(url, {"action": "reactivate"}, format="json")
        self.assertTrue(res.data["is_active"])
        self.assertFalse(res.data["doctor"]["is_verified"])  # la fiche doit être revalidée

    def test_reset_mfa_and_guards(self):
        TwoFactor.objects.create(user=self.p1, secret="JBSWY3DPEHPK3PXP", enabled=True)
        url = f"/api/admin/users/{self.p1.id}"
        self.assertEqual(self.adm.post(url, {"action": "reset_mfa", "reason": "Téléphone perdu, identité vérifiée"}, format="json").status_code, 200)
        self.assertFalse(TwoFactor.objects.filter(user=self.p1).exists())
        self.assertEqual(self.adm.post(f"/api/admin/users/{self.admin.id}", {"action": "suspend", "reason": "test test"}, format="json").status_code, 400)
        boss = self.make_user("boss@test.sn", "Boss", is_staff=True, is_superuser=True)
        self.assertEqual(self.adm.post(f"/api/admin/users/{boss.id}", {"action": "suspend", "reason": "test test"}, format="json").status_code, 403)


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp())
class DoctorProfileTests(ApiTestCase):
    def test_edit_profile(self):
        doc = self.client_for(self.doc_user)
        res = doc.post(
            "/api/pro/profile/edit",
            {"bio": "Médecin de famille.", "consultation_price": 12000, "languages": ["Wolof", "Français"], "teleconsultation": False},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.doctor.refresh_from_db()
        self.assertEqual((self.doctor.bio, self.doctor.consultation_price, self.doctor.languages, self.doctor.teleconsultation),
                         ("Médecin de famille.", 12000, ["Wolof", "Français"], False))
        self.assertEqual(doc.post("/api/pro/profile/edit", {"languages": ["Klingon"]}, format="json").status_code, 400)
        # Fiche vérifiée : nom figé ; fiche en attente : modifiable.
        self.assertEqual(doc.post("/api/pro/profile/edit", {"full_name": "Dr Autre"}, format="json").status_code, 400)
        Doctor.objects.filter(id=self.doctor.id).update(is_verified=False)
        self.assertEqual(doc.post("/api/pro/profile/edit", {"full_name": "Dr Autre"}, format="json").status_code, 200)
        self.assertEqual(self.client_for(self.p1).post("/api/pro/profile/edit", {"bio": "x"}, format="json").status_code, 404)

    def test_photo(self):
        doc = self.client_for(self.doc_user)
        bad = doc.post("/api/pro/profile/photo", {"content_base64": base64.b64encode(b"%PDF-1.4 fake").decode()}, format="json")
        self.assertEqual(bad.status_code, 400)
        res = doc.post("/api/pro/profile/photo", {"content_base64": base64.b64encode(PNG).decode()}, format="json")
        url = res.data["avatar_url"]
        self.assertTrue(url.startswith(f"/api/directory/doctors/{self.doctor.id}/photo"))
        photo = Client().get(url)
        self.assertEqual((photo.status_code, photo["Content-Type"]), (200, "image/png"))
        self.assertEqual(self.client_for().get(f"/api/directory/doctors/{self.doctor.id}").data["avatar_url"], url)
        doc.post("/api/pro/profile/photo", {"content_base64": ""}, format="json")
        self.assertEqual(Client().get(url).status_code, 404)


class SecretariatForSoloDoctorTests(ApiTestCase):
    def test_doctor_adds_and_removes_secretary(self):
        doc = self.client_for(self.doc_user)
        self.assertEqual(doc.get("/api/pro/secretariat").data["secretaries"], [])
        self.assertEqual(doc.post("/api/pro/secretariat", {"email": "inconnu@test.sn"}, format="json").status_code, 400)
        res = doc.post("/api/pro/secretariat", {"email": "p2@test.sn"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["secretaries"][0]["email"], "p2@test.sn")
        self.assertEqual(doc.post("/api/pro/secretariat", {"email": "p2@test.sn"}, format="json").status_code, 400)
        clinic = Clinic.objects.get(owner=self.doc_user)
        self.assertTrue(ClinicMember.objects.filter(clinic=clinic, doctor=self.doctor).exists())
        # La secrétaire gère l'agenda du médecin.
        sec = self.client_for(self.p2)
        self.assertEqual(sec.get("/api/clinics/mine").data["access"], "secretary")
        booked = sec.post(
            f"/api/clinics/{clinic.id}/book",
            {"doctor_id": str(self.doctor.id), "scheduled_at": iso(self.slot), "patient_name": "Moussa Diallo", "patient_phone": "770000000"},
            format="json",
        )
        self.assertEqual(booked.status_code, 200, booked.data)
        staff_id = res.data["secretaries"][0]["id"]
        self.assertEqual(doc.post(f"/api/clinics/staff/{staff_id}/delete").status_code, 200)
        self.assertEqual(sec.get(f"/api/clinics/{clinic.id}/agenda", {"from": iso(self.slot)}).status_code, 403)


class PharmacyInfoTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.pharmacist = self.make_user("ph@test.sn", "Pharmacien")
        self.pharmacy = Pharmacy.objects.create(name="Officine du Port", city="Dakar", address="Rue 1", latitude=14.7, longitude=-17.4)
        PharmacyMember.objects.create(pharmacy=self.pharmacy, user=self.pharmacist)
        self.ph = self.client_for(self.pharmacist)

    def update(self, **data):
        return self.ph.post("/api/pharmacy/mine", {"pharmacy_id": str(self.pharmacy.id), **data}, format="json")

    def on_duty_ids(self):
        return [p["id"] for p in self.client_for().get("/api/directory/pharmacies", {"onDuty": "1"}).data]

    def test_pharmacist_updates_hours_and_duty(self):
        self.assertEqual(self.update(opens_at="20:00", closes_at="08:00").status_code, 400)
        self.assertEqual(self.update(open_days=[]).status_code, 400)
        res = self.update(opens_at="08:30", closes_at="22:00", open_days=[1, 2, 3, 4, 5, 6], phone="338210000",
                          is_on_duty=True, on_duty_until=iso(timezone.now() + timedelta(days=7)))
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data[0]["opens_at"], res.data[0]["is_on_duty"]), ("08:30:00", True))
        self.assertEqual(self.on_duty_ids(), [str(self.pharmacy.id)])
        # Garde terminée : n'apparaît plus « de garde ».
        Pharmacy.objects.filter(id=self.pharmacy.id).update(on_duty_until=timezone.now() - timedelta(hours=1))
        self.assertEqual(self.on_duty_ids(), [])
        self.assertFalse(self.client_for().get("/api/directory/pharmacies").data[0]["is_on_duty"])

    def test_cannot_edit_another_pharmacy_or_without_membership(self):
        other = Pharmacy.objects.create(name="Autre", city="Thiès", address="Rue 2", latitude=14.8, longitude=-16.9)
        res = self.ph.post("/api/pharmacy/mine", {"pharmacy_id": str(other.id), "phone": "1"}, format="json")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(self.client_for(self.p1).get("/api/pharmacy/mine").status_code, 403)

    def test_admin_creates_pharmacy_located_by_district(self):
        adm = self.client_for(self.make_user("adm@test.sn", "Admin", is_staff=True))
        self.assertEqual(self.client_for(self.p1).get("/api/admin/pharmacies").status_code, 403)
        res = adm.post("/api/admin/pharmacies", {"name": "Pharmacie Médina", "city": "Dakar", "district": "Médina", "address": "Rue 6"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertAlmostEqual(res.data["latitude"], 14.683, places=2)
        self.assertEqual(res.data["open_days"], [1, 2, 3, 4, 5, 6])
        dup = adm.post("/api/admin/pharmacies", {"name": "pharmacie médina", "city": "dakar", "address": "Rue 6"}, format="json")
        self.assertEqual(dup.status_code, 400)
        unknown = adm.post("/api/admin/pharmacies", {"name": "P", "city": "Atlantide", "address": "Rue 1"}, format="json")
        self.assertEqual(unknown.status_code, 400)
        fixed = adm.post(f"/api/admin/pharmacies/{res.data['id']}", {"name": "Pharmacie de la Médina"}, format="json")
        self.assertEqual(fixed.data["name"], "Pharmacie de la Médina")


class ClinicEditTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_user("owner@test.sn", "Responsable")
        self.own = self.client_for(self.owner)
        self.clinic_id = self.own.post("/api/clinics/mine", {"name": "Clinique X", "city": "Dakar"}, format="json").data["id"]
        self.own.post(f"/api/clinics/{self.clinic_id}/members", {"doctor_id": str(self.doctor.id)}, format="json")
        self.own.post(f"/api/clinics/{self.clinic_id}/staff", {"email": "p2@test.sn"}, format="json")

    def test_owner_updates_info_secretary_cannot(self):
        res = self.own.post(f"/api/clinics/{self.clinic_id}/update", {"phone": "338000000", "description": "Urgences 24h/24"}, format="json")
        self.assertEqual((res.status_code, res.data["phone"]), (200, "338000000"))
        self.assertEqual(self.client_for(self.p2).post(f"/api/clinics/{self.clinic_id}/update", {"phone": "1"}, format="json").status_code, 403)

    def test_remove_member_by_owner_or_doctor_leaving(self):
        member_id = ClinicMember.objects.get(clinic_id=self.clinic_id).id
        url = f"/api/clinics/{self.clinic_id}/members/{member_id}/delete"
        self.assertEqual(self.client_for(self.p2).post(url).status_code, 403)  # la secrétaire ne peut pas
        self.assertEqual(self.client_for(self.doc_user).post(url).status_code, 200)  # le médecin quitte
        self.assertFalse(ClinicMember.objects.filter(clinic_id=self.clinic_id).exists())


class ProfilePhoneTests(ApiTestCase):
    def test_phone_kept_when_not_sent_and_reverified_when_changed(self):
        user = User.objects.create(phone="+221776543210", phone_verified=True, full_name="Par SMS")
        user.set_unusable_password()
        user.save()
        client = self.client_for(user)
        self.assertEqual(client.post("/api/patient/profile", {"full_name": "Mariama", "city": "Dakar"}, format="json").status_code, 200)
        user.refresh_from_db()
        self.assertEqual((user.phone, user.phone_verified, user.city), ("+221776543210", True, "Dakar"))
        # Compte ouvert par SMS : le numéro (identifiant) ne peut pas être supprimé.
        self.assertEqual(client.post("/api/patient/profile", {"full_name": "Mariama", "phone": ""}, format="json").status_code, 400)
        # Même numéro écrit autrement : rien ne change ; autre numéro : à revérifier.
        client.post("/api/patient/profile", {"full_name": "Mariama", "phone": "77 654 32 10"}, format="json")
        user.refresh_from_db()
        self.assertTrue(user.phone_verified)
        client.post("/api/patient/profile", {"full_name": "Mariama", "phone": "78 000 00 00"}, format="json")
        user.refresh_from_db()
        self.assertEqual((user.phone, user.phone_verified), ("+221780000000", False))


class EmailChangeTests(ApiTestCase):
    def token(self, user, email):
        from django.core import signing

        return signing.dumps({"u": str(user.pk), "e": email}, salt="fajma.email-change")

    def test_change_requires_password_and_confirmation(self):
        client = self.client_for(self.p1)
        url = "/api/auth/email"
        self.assertEqual(client.post(url, {"email": "nouvelle@test.sn", "password": "faux"}, format="json").status_code, 403)
        self.assertEqual(client.post(url, {"email": "pas-une-adresse", "password": PASSWORD}, format="json").status_code, 400)
        self.assertEqual(client.post(url, {"email": "p2@test.sn", "password": PASSWORD}, format="json").status_code, 400)
        res = client.post(url, {"email": "Nouvelle@Test.sn", "password": PASSWORD}, format="json")
        self.assertEqual((res.status_code, res.data["pending_email"]), (200, "nouvelle@test.sn"))
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.email, "p1@test.sn")  # inchangée tant que le lien n'est pas ouvert
        self.assertEqual(client.get("/api/auth/me").data["user"]["pending_email"], "nouvelle@test.sn")
        confirm = self.client_for().post("/api/auth/email/confirm", {"token": self.token(self.p1, "nouvelle@test.sn")}, format="json")
        self.assertEqual(confirm.status_code, 200)
        self.p1.refresh_from_db()
        self.assertEqual((self.p1.email, self.p1.pending_email), ("nouvelle@test.sn", None))

    def test_old_or_forged_links_are_refused(self):
        client = self.client_for(self.p1)
        client.post("/api/auth/email", {"email": "a@test.sn", "password": PASSWORD}, format="json")
        client.post("/api/auth/email", {"email": "b@test.sn", "password": PASSWORD}, format="json")
        anon = self.client_for()
        self.assertEqual(anon.post("/api/auth/email/confirm", {"token": self.token(self.p1, "a@test.sn")}, format="json").status_code, 400)
        self.assertEqual(anon.post("/api/auth/email/confirm", {"token": "falsifie"}, format="json").status_code, 400)
        client.post("/api/auth/email/cancel")
        self.assertEqual(anon.post("/api/auth/email/confirm", {"token": self.token(self.p1, "b@test.sn")}, format="json").status_code, 400)
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.email, "p1@test.sn")

    def test_sms_account_adds_email_without_password(self):
        user = User.objects.create(phone="+221770000002", phone_verified=True, full_name="Par SMS")
        user.set_unusable_password()
        user.save()
        res = self.client_for(user).post("/api/auth/email", {"email": "sms@test.sn"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.client_for().post("/api/auth/email/confirm", {"token": self.token(user, "sms@test.sn")}, format="json")
        user.refresh_from_db()
        self.assertEqual(user.email, "sms@test.sn")
