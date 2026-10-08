"""
Sécurité de la prescription : allergies, interactions, état du patient (grossesse, rein, G6PD…), âge.
Scénarios réalistes au Sénégal ; une alerte majeure doit arrêter l'enregistrement tant qu'elle n'est pas justifiée.
"""

from datetime import date, timedelta

from accounts.models import Relative
from carnet.models import Pregnancy
from medical import safety
from medical.medicines import BY_CODE, MAJOR, MODERATE, TERM_INDEX
from medical.models import HealthProfile, MedicalRecord, Prescription, RelativeEmergencyCard

from .test_security import ApiTestCase


def rx(*names):
    return [{"name": n, "posology": "1 comprimé matin et soir"} for n in names]


def titles(alerts, level=None):
    return [a["title"] for a in alerts if level is None or a["level"] == level]


class CatalogTests(ApiTestCase):
    def test_catalogue_coherent(self):
        from medical.medicines import AGE_LIMITS, CONTRAINDICATIONS, FAMILIES, INTERACTIONS, MEDICINES, expand

        self.assertGreaterEqual(len(MEDICINES), 90)
        self.assertEqual(len({m.code for m in MEDICINES}), len(MEDICINES), "codes en double")
        for m in MEDICINES:
            self.assertIn(m.family, FAMILIES, f"famille inconnue pour {m.code}")
        # Toute règle doit viser quelque chose d'existant, sinon elle ne s'appliquerait jamais.
        for rule in INTERACTIONS:
            self.assertTrue(expand(rule.a), f"cible inconnue : {rule.a}")
            self.assertTrue(expand(rule.b), f"cible inconnue : {rule.b}")
        for rule in CONTRAINDICATIONS:
            self.assertTrue(expand(rule.target), f"cible inconnue : {rule.target}")
            self.assertIn(rule.state, safety.STATES)
        for rule in AGE_LIMITS:
            self.assertTrue(expand(rule.target), f"cible inconnue : {rule.target}")

    def test_reconnaissance_nom_commercial_et_accents(self):
        from medical.medicines import find_in_text

        for text, code in [
            ("Clamoxyl 500 mg", "amoxicilline"),
            ("AUGMENTIN 1g", "amoxicilline_clavulanate"),
            ("doliprane 1000", "paracetamol"),
            ("Coartem", "artemether_lumefantrine"),
            ("artéméther + luméfantrine", "artemether_lumefantrine"),
            ("Bactrim forte", "cotrimoxazole"),
            ("ibuprofene 400", "ibuprofene"),
        ]:
            codes, _ = find_in_text(text)
            self.assertIn(code, codes, text)
        # Famille citée en toutes lettres par le patient
        _, fams = find_in_text("allergique à la pénicilline")
        self.assertIn("penicillines", fams)
        self.assertNotIn("", TERM_INDEX)

    def test_catalogue_api(self):
        res = self.client_for(self.doc_user).get("/api/pro/medicines")
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data["medicines"]), 90)
        self.assertEqual(self.client_for(self.p1).get("/api/pro/medicines").status_code, 404)  # pas de fiche médecin


class SafetyEngineTests(ApiTestCase):
    def state(self, **kw):
        base = {"allergy_codes": set(), "allergy_families": set(), "cross_allergies": {}, "current": {},
                "states": set(), "age": 35, "sex": "F", "known": True}
        base.update(kw)
        return base

    def test_allergie_directe_et_par_famille(self):
        a = safety.check(rx("Clamoxyl 500"), self.state(allergy_codes={"amoxicilline"}, allergy_families={"penicillines"}))
        self.assertEqual(a[0]["level"], MAJOR)
        self.assertIn("Allergie", a[0]["title"])
        # Allergie annoncée « pénicilline » : l'amoxicilline est bloquée
        a = safety.check(rx("Amoxicilline"), self.state(allergy_families={"penicillines"}))
        self.assertTrue(any(x["level"] == MAJOR for x in a))

    def test_allergie_croisee_penicilline_cephalosporine(self):
        a = safety.check(rx("Rocéphine"), self.state(allergy_families={"penicillines"},
                                                    cross_allergies={"cephalosporines": "allergie croisée"}))
        self.assertTrue(any(x["level"] == MODERATE and "croisée" in x["title"] for x in a))

    def test_interaction_avk_ains(self):
        a = safety.check(rx("Ibuprofène 400"), self.state(current={"warfarine": "ordonnance ORD-1"}))
        self.assertTrue(any(x["level"] == MAJOR and "Interaction" in x["title"] for x in a))

    def test_interaction_dans_la_meme_ordonnance(self):
        a = safety.check(rx("Coumadine", "Aspégic 100"), self.state())
        self.assertTrue(any(x["level"] == MAJOR for x in a), titles(a))

    def test_rifampicine_contraceptif(self):
        a = safety.check(rx("Rifampicine"), self.state(current={"contraceptif_oral": "traitement déclaré"}))
        self.assertTrue(any("contraception" in x["detail"] for x in a))

    def test_grossesse(self):
        a = safety.check(rx("Lopril"), self.state(states={"grossesse"}))
        self.assertTrue(any(x["level"] == MAJOR and x["title"] == "Grossesse" for x in a))
        # La méthyldopa, elle, est l'option recommandée : aucune alerte
        self.assertEqual(safety.check(rx("Aldomet"), self.state(states={"grossesse"})), [])

    def test_g6pd_et_asthme(self):
        a = safety.check(rx("Bactrim"), self.state(states={"g6pd"}))
        self.assertTrue(any(x["level"] == MAJOR and "hémolyse" in x["detail"] for x in a))
        a = safety.check(rx("Ténormine"), self.state(states={"asthme"}))
        self.assertTrue(any(x["level"] == MAJOR for x in a))

    def test_insuffisance_renale(self):
        a = safety.check(rx("Glucophage"), self.state(states={"insuffisance_renale"}))
        self.assertTrue(any(x["level"] == MAJOR and "acidose" in x["detail"] for x in a))

    def test_age_enfant_et_personne_agee(self):
        a = safety.check(rx("Aspirine du Rhône"), self.state(age=6))
        self.assertTrue(any(x["level"] == MAJOR and "Reye" in x["detail"] for x in a))
        a = safety.check(rx("Vibramycine"), self.state(age=5))
        self.assertTrue(any(x["level"] == MAJOR for x in a))
        a = safety.check(rx("Voltarène"), self.state(age=80))
        self.assertTrue(any(x["level"] == MODERATE and "75 ans" in x["detail"] for x in a))
        # Adulte : pas d'alerte d'âge
        self.assertEqual(titles(safety.check(rx("Aspirine du Rhône"), self.state(age=40)), MAJOR), [])

    def test_doublon_et_medicament_inconnu(self):
        a = safety.check(rx("Doliprane"), self.state(current={"paracetamol": "ordonnance ORD-2"}))
        self.assertTrue(any(x["title"] == "Déjà en cours" for x in a))
        a = safety.check(rx("Sirop du village"), self.state())
        self.assertTrue(any(x["kind"] == "inconnu" for x in a))

    def test_ordonnance_banale_sans_alerte(self):
        self.assertEqual(safety.check(rx("Doliprane 1000"), self.state()), [])

    def test_homme_jamais_enceint(self):
        p = safety.patient_state(self.make_user("h@test.sn", "Homme", sex="M"))
        self.assertNotIn("grossesse", p["states"])


class PatientStateTests(ApiTestCase):
    def test_etat_reconstitue_depuis_le_dossier(self):
        HealthProfile.objects.create(
            user=self.p1, allergies="Allergie à la pénicilline (œdème)", conditions="Asthme depuis l'enfance",
            treatments="Ventoline au besoin", critical_flags=["dialyse"],
        )
        st = safety.patient_state(self.p1)
        self.assertIn("penicillines", st["allergy_families"])
        self.assertIn("asthme", st["states"])
        self.assertIn("insuffisance_renale", st["states"])
        self.assertIn("salbutamol", st["current"])
        self.assertIn("cephalosporines", st["cross_allergies"])

    def test_grossesse_du_carnet_et_diagnostic_code(self):
        Pregnancy.objects.create(owner=self.p1, last_period=date.today() - timedelta(days=60))
        self.assertIn("grossesse", safety.patient_state(self.p1)["states"])
        appt = self.set_up_appointment()
        MedicalRecord.objects.create(appointment=appt, patient=self.p2, doctor=self.doctor,
                                     summary="Suivi", condition_code="drepanocytose", condition_status="confirmed")
        self.assertIn("drepanocytose", safety.patient_state(self.p2)["states"])

    def set_up_appointment(self):
        res = self.book(self.p2)
        from appointments.models import Appointment

        return Appointment.objects.get(id=res.data["id"])

    def test_fiche_du_proche_utilisee(self):
        child = Relative.objects.create(owner=self.p1, full_name="Awa Enfant", birth_date=date(date.today().year - 5, 1, 1))
        RelativeEmergencyCard.objects.create(relative=child, allergies="sulfamides")
        st = safety.patient_state(self.p1, child)
        self.assertIn("sulfamides", st["allergy_families"])
        self.assertEqual(st["age"], 5 if date.today() >= date(date.today().year, 1, 1) else 4)
        # L'état du titulaire ne déborde pas sur celui de l'enfant
        HealthProfile.objects.create(user=self.p1, conditions="diabète")
        self.assertNotIn("diabete", safety.patient_state(self.p1, child)["states"])

    def test_traitement_en_cours_lu_dans_les_ordonnances(self):
        appt = self.set_up_appointment()
        Prescription.objects.create(appointment=appt, patient=self.p2, doctor=self.doctor,
                                    content="x", items=[{"name": "Coumadine 5 mg", "posology": "1/j"}],
                                    valid_until=date.today() + timedelta(days=30))
        self.assertIn("warfarine", safety.patient_state(self.p2)["current"])


class PrescriptionBlockingTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.doctor.order_number = "SN-ORD-1"
        self.doctor.practice_phone = "338001122"
        self.doctor.address = "Dakar"
        self.doctor.signature_path = "signatures/test.png"
        self.doctor.save()
        HealthProfile.objects.create(user=self.p1, allergies="pénicilline")
        res = self.book(self.p1)
        self.appt_id = res.data["id"]
        from appointments.models import Appointment

        self.set_appointment(self.appt_id, status="confirmed", scheduled_at=self.past_visit())
        self.appt = Appointment.objects.get(id=self.appt_id)

    def record(self, items, **extra):
        return self.client_for(self.doc_user).post(
            f"/api/pro/appointments/{self.appt_id}/record",
            {"summary": "Angine", "items": items, **extra}, format="json")

    def test_alerte_majeure_bloque_puis_justification(self):
        res = self.record(rx("Clamoxyl 500"))
        self.assertEqual(res.status_code, 400, res.data)
        self.assertTrue(res.data["safety"]["blocking"])
        self.assertEqual(res.data["safety"]["alerts"][0]["level"], MAJOR)
        self.assertFalse(Prescription.objects.exists())
        # Justification trop courte : toujours bloqué
        self.assertEqual(self.record(rx("Clamoxyl 500"), safety_override="ok").status_code, 400)
        res = self.record(rx("Clamoxyl 500"), safety_override="Allergie ancienne et douteuse, test de provocation négatif")
        self.assertEqual(res.status_code, 200, res.data)
        p = Prescription.objects.get()
        self.assertIn("provocation", p.safety["override_reason"])
        self.assertEqual(p.safety["major"], 1)

    def test_ordonnance_sans_risque_passe_et_garde_la_trace(self):
        res = self.record(rx("Doliprane 1000"))
        self.assertEqual(res.status_code, 200, res.data)
        p = Prescription.objects.get()
        self.assertEqual(p.safety["major"], 0)
        self.assertEqual(p.safety["override_reason"], "")
        self.assertIn("checked_at", p.safety)

    def test_verification_en_direct(self):
        res = self.client_for(self.doc_user).post(
            f"/api/pro/appointments/{self.appt_id}/prescription-check", {"items": rx("Augmentin")}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["blocking"])
        self.assertTrue(res.data["patient_known"])
        # Un autre médecin n'y a pas accès
        other = self.make_user("autre@test.sn", "Autre")
        from directory.models import Doctor

        Doctor.objects.create(user=other, full_name="Dr Autre", specialty=self.spec, city="Dakar", is_verified=True)
        res = self.client_for(other).post(
            f"/api/pro/appointments/{self.appt_id}/prescription-check", {"items": rx("Augmentin")}, format="json")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(self.client_for(self.p1).post(
            f"/api/pro/appointments/{self.appt_id}/prescription-check", {"items": []}, format="json").status_code, 404)

    def test_le_catalogue_couvre_les_prescriptions_courantes(self):
        for name in ("paracetamol", "amoxicilline", "artemether_lumefantrine", "metformine", "amlodipine",
                     "salbutamol", "cotrimoxazole", "fer_acide_folique", "rifampicine", "dolutegravir"):
            self.assertIn(name, BY_CODE, name)
