"""
Audit des droits : balayage de **toutes** les adresses de l'API. Chacune doit refuser un visiteur non
connecté, et les adresses réservées (administration, espace professionnel) doivent refuser un patient.

Ce test est volontairement automatique : une nouvelle adresse ajoutée plus tard est contrôlée sans que
personne ait à y penser. Les rares adresses publiques sont listées explicitement ci-dessous.
"""

from django.urls import URLPattern, URLResolver, get_resolver

from .test_security import ApiTestCase

# Adresses publiques par conception (site vitrine, annuaire, vérification d'ordonnance, santé du service…).
PUBLIC_PREFIXES = (
    "/api/auth/",
    "/api/directory/",          # annuaire, spécialités, villes, créneaux, avis publics, tarifs
    "/api/carnet/vaccines",     # calendrier vaccinal (catalogue, aucune donnée personnelle)
    "/api/econsult/offer/",     # tarif public d'une consultation écrite
    "/api/health",
    "/api/site-info",
    "/api/prescriptions/verify",
    "/api/emergency/",
    "/api/partners",
    "/api/campaigns",
    "/api/notifications/twilio",
    "/api/notifications/push/key",
    "/api/bots/",
    "/api/client-errors",
    "/api/payments/paydunya/webhook",
    "/api/support",
    "/api/insurance/insurers",   # catalogue des organismes : filtre de la recherche publique de médecins
    "/api/imaging/modalities",  # contrôlé plus bas : connexion exigée
)
# Réservées à l'équipe Fajma ou aux professionnels : un patient ne doit jamais y entrer.
STAFF_PREFIXES = ("/api/admin/",)
PRO_PREFIXES = ("/api/pro/", "/api/labs/dashboard", "/api/labs/mine", "/api/clinics/mine", "/api/pharmacy/dashboard")
# Adresses « professionnelles » qui répondent 200 à un patient, mais **toujours vide** : son espace pro
# n'existe pas. Le test vérifie que la réponse est bien vide, pas seulement qu'elle est autorisée.
EMPTY_FOR_OUTSIDERS = (
    "/api/pro/appointments",
    "/api/pro/availability",
    "/api/pro/profile",
    "/api/clinics/mine",
)
# Catalogues métier, sans aucune donnée personnelle : ouverts à tout compte connecté.
SHARED_CATALOGS = ("/api/pro/conditions",)


def _is_empty(data) -> bool:
    return data in (None, [], {}) or data == {"results": []}

# Valeurs d'exemple pour les adresses à paramètre.
SAMPLES = {
    "uuid": "00000000-0000-0000-0000-000000000000",
    "int": "1",
    "slug": "exemple",
    "str": "exemple",
    "path": "exemple",
}


def _fill(route: str) -> str | None:
    """Remplace <uuid:x> par une valeur d'exemple ; None si le motif n'est pas reconnu."""
    out = ""
    rest = route
    while "<" in rest:
        before, _, after = rest.partition("<")
        spec, _, rest = after.partition(">")
        kind = spec.split(":")[0] if ":" in spec else "str"
        if kind not in SAMPLES:
            return None
        out += before + SAMPLES[kind]
    return "/" + out + rest


def all_api_paths() -> list[str]:
    paths: list[str] = []

    def walk(patterns, prefix=""):
        for p in patterns:
            if isinstance(p, URLResolver):
                walk(p.url_patterns, prefix + str(p.pattern))
            elif isinstance(p, URLPattern):
                route = prefix + str(p.pattern)
                if route.startswith("api/"):
                    filled = _fill(route)
                    if filled:
                        paths.append(filled)

    walk(get_resolver().url_patterns)
    return sorted(set(paths))


class PermissionSweepTests(ApiTestCase):
    """Un visiteur anonyme, puis un patient : aucune adresse protégée ne doit s'ouvrir."""

    def setUp(self):
        super().setUp()
        self.paths = all_api_paths()

    def test_le_balayage_couvre_bien_l_api(self):
        self.assertGreater(len(self.paths), 150, "le balayage ne voit presque aucune adresse")
        for key in ("/api/admin/settings", "/api/pro/medicines", "/api/patient/medical-record/fhir"):
            self.assertIn(key, self.paths, key)

    def test_visiteur_non_connecte_refuse_partout(self):
        client = self.client
        ouverts = []
        for path in self.paths:
            if path.startswith(PUBLIC_PREFIXES):
                continue
            for method in ("get", "post"):
                res = getattr(client, method)(path, {}, format="json")
                # 401/403 attendus ; 404/405 acceptables (adresse inconnue ou méthode non prévue) ;
                # 400 acceptable seulement si la vérification d'identité a bien eu lieu avant.
                if res.status_code in (200, 201):
                    ouverts.append(f"{method.upper()} {path} → {res.status_code}")
        self.assertEqual(ouverts, [], "adresses ouvertes sans connexion")

    def test_patient_refuse_sur_les_adresses_reservees(self):
        client = self.client_for(self.p1)
        ouverts = []
        for path in self.paths:
            if not path.startswith(STAFF_PREFIXES + PRO_PREFIXES):
                continue
            for method in ("get", "post"):
                res = getattr(client, method)(path, {}, format="json")
                if res.status_code not in (200, 201):
                    continue
                if path in SHARED_CATALOGS:
                    continue
                if path in EMPTY_FOR_OUTSIDERS and _is_empty(getattr(res, "data", None)):
                    continue
                ouverts.append(f"{method.upper()} {path} → {res.status_code} {getattr(res, 'data', '')!r:.80}")
        self.assertEqual(ouverts, [], "adresses réservées qui répondent avec des données à un patient")

    def test_medecin_refuse_sur_l_administration(self):
        client = self.client_for(self.doc_user)
        ouverts = []
        for path in self.paths:
            if not path.startswith(STAFF_PREFIXES):
                continue
            for method in ("get", "post"):
                res = getattr(client, method)(path, {}, format="json")
                if res.status_code in (200, 201):
                    ouverts.append(f"{method.upper()} {path} → {res.status_code}")
        self.assertEqual(ouverts, [], "administration ouverte à un médecin")
