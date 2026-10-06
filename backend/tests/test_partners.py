"""Partenaires et campagnes : charte (textes interdits, validation), ciblage ville / langue, statistiques agrégées."""

from datetime import timedelta

from django.utils import timezone

from partners.models import Campaign, CampaignStat, Partner

from .test_security import ApiTestCase


class PartnerTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        self.adm = self.client_for(self.admin)

    def campaign(self, **extra):
        partner = Partner.objects.create(name="Mutuelle Santé Plus", kind="assureur")
        today = timezone.localdate()
        return self.adm.post("/api/admin/campaigns", {
            "partner_id": str(partner.id), "title": "Dépistage gratuit du diabète", "body": "Samedi au centre de santé de Pikine, de 8 h à 13 h.",
            "cta_url": "https://example.sn/depistage", "category": "prevention", "placements": ["home"],
            "starts_on": today.isoformat(), "ends_on": (today + timedelta(days=7)).isoformat(), **extra}, format="json")

    def test_charter_and_approval(self):
        self.assertEqual(self.client_for(self.p1).get("/api/admin/campaigns").status_code, 403)
        self.assertEqual(self.campaign(body="Antibiotique miracle sans ordonnance !").status_code, 400)
        self.assertEqual(self.campaign(cta_url="javascript:alert(1)").status_code, 400)
        res = self.campaign()
        cid = res.data[0]["id"]
        anon = self.client_for()
        self.assertIsNone(anon.get("/api/campaigns", {"placement": "home"}).data)  # brouillon : invisible
        self.assertEqual(self.adm.post(f"/api/admin/campaigns/{cid}/status", {"status": "approved"}, format="json").status_code, 400)
        self.adm.post(f"/api/admin/campaigns/{cid}/status", {"status": "approved", "charter_checked": True}, format="json")
        shown = anon.get("/api/campaigns", {"placement": "home"}).data
        self.assertEqual(shown["title"], "Dépistage gratuit du diabète")
        self.assertIsNone(anon.get("/api/campaigns", {"placement": "search"}).data)
        self.assertEqual(anon.post(f"/api/campaigns/{cid}/click", {"placement": "home"}, format="json").data["url"], "https://example.sn/depistage")
        stat = CampaignStat.objects.get()
        self.assertEqual((stat.impressions, stat.clicks), (1, 1))
        report = self.adm.get(f"/api/admin/campaigns/{cid}/report.csv").content.decode()
        self.assertIn("Page d'accueil;1;1", report)

    def test_city_and_language_targeting(self):
        cid = self.campaign(cities=["Thiès"], languages=["wo"]).data[0]["id"]
        Campaign.objects.filter(id=cid).update(status="approved")
        anon = self.client_for()
        self.assertIsNone(anon.get("/api/campaigns", {"placement": "home", "city": "Dakar"}).data)
        self.assertIsNone(anon.get("/api/campaigns", {"placement": "home", "city": "Thiès", "lang": "fr"}).data)
        self.assertIsNotNone(anon.get("/api/campaigns", {"placement": "home", "city": "thiès", "lang": "wo"}).data)

    def test_public_partners(self):
        self.adm.post("/api/admin/partners", {"name": "IPM Sonatel", "kind": "assureur", "is_public": True}, format="json")
        self.adm.post("/api/admin/partners", {"name": "Discret", "kind": "autre", "is_public": False}, format="json")
        self.assertEqual([p["name"] for p in self.client_for().get("/api/partners").data], ["IPM Sonatel"])
