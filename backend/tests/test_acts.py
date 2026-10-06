"""
Nomenclature des actes : codage par le médecin, base de remboursement, feuille de soins pour l'organisme,
et mise à jour des lettres-clés par l'administration (sans modifier les factures déjà émises).
"""

from datetime import timedelta

from insurance.acts import BY_CODE, LETTERS, letter_values
from insurance.models import ActLetter, Insurer, PatientCoverage, PerformedAct

from .test_security import ApiTestCase


class ActsCatalogTests(ApiTestCase):
    def test_catalogue_coherent(self):
        from insurance.acts import ACTS

        self.assertGreaterEqual(len(ACTS), 40)
        self.assertEqual(len({a.code for a in ACTS}), len(ACTS), "codes en double")
        for a in ACTS:
            self.assertIn(a.letter, LETTERS, f"lettre-clé inconnue pour {a.code}")
            self.assertGreater(a.coefficient, 0)

    def test_catalogue_api_reserve_au_medecin(self):
        res = self.client_for(self.doc_user).get("/api/pro/acts")
        self.assertEqual(res.status_code, 200)
        consultation = next(a for a in res.data["acts"] if a["code"] == "C")
        self.assertEqual(consultation["base_amount"], LETTERS["C"][1])
        self.assertEqual(self.client_for(self.p1).get("/api/pro/acts").status_code, 404)

    def test_valeur_modifiee_change_le_catalogue(self):
        ActLetter.objects.create(code="C", value=2000)
        self.assertEqual(letter_values()["C"], 2000)
        from insurance.acts import amount

        self.assertEqual(amount(BY_CODE["C"]), 2000)


class CareSheetTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.insurer = Insurer.objects.create(slug="ipm-test", name="IPM Test", kind="ipm", default_coverage_percent=80)
        PatientCoverage.objects.create(user=self.p1, insurer=self.insurer, member_number="A-123", coverage_percent=80)
        res = self.book(self.p1)
        self.appt_id = res.data["id"]
        self.set_appointment(self.appt_id, status="confirmed", scheduled_at=self.slot - timedelta(days=1),
                             price=15000, insurer=self.insurer, coverage_percent=80, insurance_member_number="A-123")

    def record(self, acts):
        return self.client_for(self.doc_user).post(
            f"/api/pro/appointments/{self.appt_id}/record",
            {"summary": "Consultation", "acts": acts}, format="json")

    def test_codage_et_base_de_remboursement(self):
        res = self.record([{"code": "C"}, {"code": "INJ", "quantity": 2}])
        self.assertEqual(res.status_code, 200, res.data)
        billing = res.data["billing"]
        self.assertEqual(len(billing["acts"]), 2)
        attendu = LETTERS["C"][1] + int(BY_CODE["INJ"].coefficient * LETTERS["AMI"][1]) * 2
        self.assertEqual(billing["base_amount"], attendu)
        self.assertEqual(billing["coverage_percent"], 80)
        self.assertEqual(billing["reimbursed_amount"], attendu * 80 // 100)
        self.assertEqual(billing["paid_amount"], 15000)
        self.assertEqual(billing["patient_cost"], 15000 - attendu * 80 // 100)
        self.assertEqual(billing["above_base"], 15000 - attendu)

    def test_acte_inconnu_et_trop_d_actes(self):
        self.assertEqual(self.record([{"code": "INVENTE"}]).status_code, 400)
        self.assertEqual(self.record([{"code": "C"} for _ in range(13)]).status_code, 400)
        self.assertFalse(PerformedAct.objects.exists())

    def test_enregistrer_a_nouveau_remplace_les_actes(self):
        self.record([{"code": "C"}, {"code": "INJ"}])
        self.assertEqual(PerformedAct.objects.count(), 2)
        self.record([{"code": "CS"}])
        self.assertEqual(PerformedAct.objects.count(), 1)
        self.assertEqual(PerformedAct.objects.get().code, "CS")

    def test_feuille_de_soins(self):
        self.record([{"code": "C"}])
        res = self.client_for(self.p1).get(f"/api/appointments/{self.appt_id}/care-sheet")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["insurer"], "IPM Test")
        self.assertEqual(res.data["member_number"], "A-123")
        self.assertEqual(res.data["acts"][0]["notation"], "C 1")
        self.assertEqual(res.data["doctor"]["full_name"], self.doctor.full_name)
        # Le médecin y a droit aussi, pas un tiers
        self.assertEqual(self.client_for(self.doc_user).get(f"/api/appointments/{self.appt_id}/care-sheet").status_code, 200)
        self.assertEqual(self.client_for(self.p2).get(f"/api/appointments/{self.appt_id}/care-sheet").status_code, 404)

    def test_montant_fige_apres_changement_de_tarif(self):
        self.record([{"code": "C"}])
        avant = PerformedAct.objects.get().amount
        admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        res = self.client_for(admin).post("/api/admin/act-letters", {"C": 5000}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(letter_values()["C"], 5000)
        PerformedAct.objects.get().refresh_from_db()
        self.assertEqual(PerformedAct.objects.get().amount, avant, "une facture émise ne doit jamais changer")
        # Un nouvel acte, lui, utilise le nouveau tarif
        self.record([{"code": "C"}])
        self.assertEqual(PerformedAct.objects.get().amount, 5000)

    def test_lettre_inconnue_et_droits(self):
        admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        self.assertEqual(self.client_for(admin).post("/api/admin/act-letters", {"ZZZ": 100}, format="json").status_code, 400)
        self.assertEqual(self.client_for(admin).post("/api/admin/act-letters", {"C": 2}, format="json").status_code, 400)
        self.assertEqual(self.client_for(self.p1).get("/api/admin/act-letters").status_code, 403)

    def test_sans_acte_la_feuille_reste_lisible(self):
        self.record([])
        res = self.client_for(self.p1).get(f"/api/appointments/{self.appt_id}/care-sheet")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["acts"], [])
        self.assertEqual(res.data["base_amount"], 0)
        self.assertIsNone(res.data["above_base"])
