"""Recherche par localité du Sénégal : suggestions, proximité, variantes d'écriture."""

from directory.localities import find, suggest
from directory.models import Doctor

from .test_security import ApiTestCase


class LocalityTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        # Médecin du setUp : Dakar (Point E). Un second à Thiès.
        self.doctor.latitude, self.doctor.longitude = 14.694, -17.458
        self.doctor.save()
        self.thies = Doctor.objects.create(
            full_name="Dr Thiès", specialty=self.spec, city="Thiès", is_verified=True, latitude=14.791, longitude=-16.926
        )

    def names(self, **params):
        return [d["full_name"] for d in self.client.get("/api/directory/doctors", params).data]

    def test_suggestions_and_aliases(self):
        self.assertEqual(suggest("pik")[0]["name"], "Pikine")
        self.assertEqual(suggest("touba")[0]["region"], "Diourbel")
        self.assertEqual(find("St-Louis")[0], "Saint-Louis")
        self.assertEqual(find("guediawaye")[0], "Guédiawaye")
        self.assertEqual(self.client.get("/api/directory/localities", {"q": "keur"}).data[0]["name"], "Keur Massar")

    def test_all_localities_of_senegal(self):
        # Base complète (GeoNames) : villages et quartiers en plus de la liste principale.
        self.assertEqual(find("Ndioum").region, "Saint-Louis")
        self.assertEqual(find("Sicap Liberté").region, "Dakar")
        self.assertIn("Pikine Est", [s["name"] for s in suggest("pikine")])
        # Homonymes : la localité principale garde le nom simple, les autres portent leur région.
        names = [s["name"] for s in suggest("colobane")]
        self.assertEqual(names[0], "Colobane")
        self.assertIn("Colobane (Fatick)", names)
        self.assertEqual(find("Colobane (Fatick)").region, "Fatick")
        # Village choisi dans la liste : recherche des médecins autour de lui.
        data = self.client.get("/api/directory/doctors", {"city": "Colobane (Fatick)"}).data
        self.assertTrue(all(d["distance_km"] is not None for d in data))

    def test_nearby_search(self):
        # Pikine (~8 km du Point E) : le médecin de Dakar est proposé, pas celui de Thiès (~60 km).
        data = self.client.get("/api/directory/doctors", {"city": "Pikine"}).data
        self.assertEqual([d["full_name"] for d in data], ["Dr Test"])
        self.assertLess(data[0]["distance_km"], 15)
        self.assertEqual(self.names(city="Thies"), ["Dr Thiès"])

    def test_no_doctor_in_town_gives_nearest(self):
        # Touba : personne dans le rayon → les plus proches, Thiès avant Dakar.
        data = self.client.get("/api/directory/doctors", {"city": "Touba"}).data
        self.assertEqual([d["full_name"] for d in data], ["Dr Thiès", "Dr Test"])
        self.assertGreater(data[0]["distance_km"], 20)

    def test_gps_position_and_unknown_city(self):
        self.assertEqual(self.names(lat=14.79, lng=-16.93)[0], "Dr Thiès")
        self.assertEqual(self.names(city="Dak"), ["Dr Test"])  # texte libre : recherche dans le nom de ville
