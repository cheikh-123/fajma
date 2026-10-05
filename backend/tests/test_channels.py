"""Canaux sans application : WhatsApp (Twilio), USSD, et référencement (sitemap, pages pour robots)."""

import base64
import hashlib
import hmac
import json
import re

from django.test import override_settings

from accounts.models import User
from appointments.models import Appointment
from directory.models import Pharmacy

from .test_security import ApiTestCase

TOKEN = "twilio-auth-token"
SITE = "https://www.fajma.sn"
PHONE = "+221770000001"


def twilio_sign(url: str, params: dict) -> str:
    payload = url + "".join(k + params[k] for k in sorted(params))
    return base64.b64encode(hmac.new(TOKEN.encode(), payload.encode(), hashlib.sha1).digest()).decode()


@override_settings(TWILIO={"AUTH_TOKEN": TOKEN, "ACCOUNT_SID": "", "SMS_FROM": "", "WHATSAPP_FROM": "", "STATUS_TOKEN": ""}, PUBLIC_SITE_URL=SITE)
class WhatsAppBotTests(ApiTestCase):
    sid = 0

    def say(self, text: str, phone: str = PHONE, sign: bool = True, sid: str | None = None):
        if sid is None:
            WhatsAppBotTests.sid += 1
            sid = f"SM{WhatsAppBotTests.sid}"
        params = {"From": f"whatsapp:{phone}", "Body": text, "MessageSid": sid}
        headers = {"HTTP_X_TWILIO_SIGNATURE": twilio_sign(f"{SITE}/api/bots/whatsapp", params) if sign else "bad"}
        res = self.client.post("/api/bots/whatsapp", params, **headers)
        if res.status_code != 200:
            return res.status_code
        return re.search(r"<Message>(.*)</Message>", res.content.decode(), re.S).group(1)

    def test_signature_required(self):
        self.assertEqual(self.say("menu", sign=False), 403)

    def test_full_booking_creates_verified_account(self):
        self.assertIn("1. Prendre rendez-vous", self.say("bonjour"))
        self.assertIn("Médecine générale", self.say("1"))  # spécialité
        self.assertIn("Dakar", self.say("1"))  # ville
        self.assertIn("Choix invalide", self.say("9"))  # hors liste : redemandé
        doctors = self.say("1")
        self.assertIn("Dr Test", doctors)
        slots = self.say("1")
        self.assertIn("créneau", slots)
        self.assertIn("prénom et nom", self.say("1"))  # numéro inconnu : on demande le nom
        confirm = self.say("Fatou Sarr")
        self.assertIn("Confirmer le RDV avec Dr Test", confirm)
        done = self.say("1")
        self.assertIn("RDV en attente de confirmation", done)
        user = User.objects.get(phone=PHONE)
        self.assertTrue(user.phone_verified)
        self.assertEqual(user.full_name, "Fatou Sarr")
        appt = Appointment.objects.get(patient=user)
        self.assertEqual(appt.price, 15000)
        # Après la fin, la conversation repart du menu.
        self.assertIn("Vos RDV", self.say("2") if "Prendre rendez-vous" in self.say("menu") else "")

    def test_duplicate_twilio_delivery_does_not_rebook(self):
        for text in ["menu", "1", "1", "1", "1", "1", "Fatou Sarr"]:
            self.say(text)
        first = self.say("1", sid="SM-final")
        again = self.say("1", sid="SM-final")
        self.assertEqual(first, again)
        self.assertEqual(Appointment.objects.count(), 1)

    def test_cancel_via_whatsapp(self):
        user = User.objects.create_user(None, phone=PHONE, full_name="Fatou", phone_verified=True)
        appt_id = self.book(user).data["id"]
        self.say("menu")
        self.assertIn("RDV à annuler", self.say("3"))
        self.say("1")
        self.assertIn("Rendez-vous annulé", self.say("1"))
        self.assertEqual(Appointment.objects.get(id=appt_id).status, "cancelled")

    def test_unverified_phone_owner_not_used(self):
        """Un compte dont le numéro n'est pas vérifié ne peut pas être piloté par ce numéro."""
        User.objects.create_user(email="x@test.sn", phone=PHONE, full_name="Autre")
        self.say("menu")
        self.assertIn("Aucun rendez-vous", self.say("2"))


@override_settings(USSD_SECRET="ussd-secret")
class UssdTests(ApiTestCase):
    def ussd(self, text: str, session="S1", phone="221770000002", secret="ussd-secret"):
        res = self.client.post(
            "/api/bots/ussd", {"sessionId": session, "phoneNumber": phone, "text": text, "serviceCode": "*123#"}, HTTP_X_USSD_SECRET=secret
        )
        return res.status_code if res.status_code != 200 else res.content.decode()

    def test_secret_required(self):
        self.assertEqual(self.ussd("", secret="wrong"), 403)

    def test_booking_path_and_replay(self):
        self.assertTrue(self.ussd("").startswith("CON "))
        self.assertTrue(self.ussd("1*1*1*1*1").startswith("CON Votre prénom"))
        confirm = self.ussd("1*1*1*1*1*Awa Fall")
        self.assertIn("Confirmer le RDV", confirm)
        done = self.ussd("1*1*1*1*1*Awa Fall*1")
        self.assertTrue(done.startswith("END RDV"), done)
        self.assertEqual(self.ussd("1*1*1*1*1*Awa Fall*1"), done)  # requête répétée : pas de 2e RDV
        self.assertEqual(Appointment.objects.count(), 1)
        self.assertLessEqual(len(done), 182)  # limite d'un écran USSD

    def test_home_shortcut_and_pharmacies(self):
        Pharmacy.objects.create(name="Pharmacie Mame Diarra", city="Dakar", address="Plateau", phone="338210000", is_on_duty=True, latitude=14.6, longitude=-17.4)
        out = self.ussd("1*00*4*1")
        self.assertTrue(out.startswith("END Pharmacies Dakar"), out)
        self.assertIn("(garde)", out)

    def test_long_lists_are_paged(self):
        for i in range(7):
            Pharmacy.objects.create(name=f"P{i}", city=f"Ville{i}", address="x", latitude=14, longitude=-17)
        first = self.ussd("4", session="P1")
        self.assertIn("9. Suite", first)
        self.assertNotIn("Ville6", first)
        self.assertIn("Ville6", self.ussd("4*9", session="P1"))
        self.assertIn("END Pharmacies Ville6", self.ussd("4*9*2", session="P1"))

    def test_language_choice(self):
        self.assertIn("6. Làkk / Langue / Language", self.ussd("", session="L1"))
        home_wo = self.ussd("6*2", session="L1")
        self.assertIn("Jël ndaje", home_wo)
        self.assertEqual(self.ussd("6*2*2", session="L1"), "END Amoo benn ndaje buy ñëw.")
        self.assertIn("Book an appointment", self.ussd("6*3", session="L2"))

    def test_language_saved_on_account(self):
        from accounts.models import User

        user = User.objects.create_user(None, phone="+221770000005", full_name="Modou", phone_verified=True)
        self.ussd("6*3", session="L3", phone="221770000005")
        user.refresh_from_db()
        self.assertEqual(user.preferred_language, "en")
        # Nouvelle session : la langue du compte s'applique d'emblée.
        self.assertIn("Book an appointment", self.ussd("", session="L4", phone="221770000005"))

    def test_session_bound_to_phone(self):
        self.ussd("", session="S9", phone="221770000003")
        self.assertIn("Session invalide", self.ussd("1", session="S9", phone="221770000004"))


@override_settings(PUBLIC_SITE_URL=SITE)
class SeoTests(ApiTestCase):
    def test_robots_and_sitemap(self):
        robots = self.client.get("/robots.txt").content.decode()
        self.assertIn(f"Sitemap: {SITE}/sitemap.xml", robots)
        self.assertIn("Disallow: /dossier", robots)
        sitemap = self.client.get("/sitemap.xml").content.decode()
        self.assertIn(f"{SITE}/medecins/{self.doctor.id}", sitemap)
        self.assertIn(f"{SITE}/specialites/medecine-generale", sitemap)

    def test_doctor_page_for_bots(self):
        self.doctor.bio = "</script><script>alert(1)</script>"
        self.doctor.save()
        res = self.client.get(f"/seo/medecins/{self.doctor.id}")
        html = res.content.decode()
        self.assertIn("<title>Dr Test — Médecine générale à Dakar", html)
        self.assertIn('property="og:title"', html)
        self.assertNotIn("<script>alert", html)
        ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html).group(1))
        self.assertEqual(ld["@type"], "Physician")
        self.assertEqual(ld["address"]["addressCountry"], "SN")

    def test_unverified_doctor_hidden(self):
        self.doctor.is_verified = False
        self.doctor.save()
        self.assertEqual(self.client.get(f"/seo/medecins/{self.doctor.id}").status_code, 404)
