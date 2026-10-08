"""
Imagerie médicale : prescription, orientation vers un centre qui réalise l'examen, alertes propres à
l'imagerie (grossesse et rayons X, appareil implanté et IRM, produit de contraste).
"""

from datetime import date, timedelta

from carnet.models import Pregnancy
from labs.models import LabOrder, Laboratory, LaboratoryMember
from medical.models import HealthProfile, Prescription

from .test_security import ApiTestCase


class ImagingTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        res = self.book(self.p1)
        self.appt_id = res.data["id"]
        self.set_appointment(self.appt_id, status="confirmed", scheduled_at=self.past_visit())
        self.centre = Laboratory.objects.create(
            name="Centre d'imagerie Plateau", city="Dakar", address="Avenue Pasteur",
            is_verified=True, kind="imagerie", modalities=["radio", "echo", "scanner"],
        )
        LaboratoryMember.objects.create(laboratory=self.centre, user=self.make_user("radio@test.sn", "Manipulateur"))
        self.labo = Laboratory.objects.create(name="Labo Bio", city="Dakar", address="Rue 10", is_verified=True)
        LaboratoryMember.objects.create(laboratory=self.labo, user=self.make_user("bio@test.sn", "Biologiste"))

    def prescribe(self, **extra):
        return self.client_for(self.doc_user).post(
            f"/api/pro/appointments/{self.appt_id}/lab-order",
            {"tests": "Thorax face", "kind": "imagerie", "modality": "radio", **extra}, format="json")

    def test_catalogue_examens(self):
        res = self.client_for(self.doc_user).get("/api/imaging/modalities")
        self.assertEqual(res.status_code, 200)
        codes = {m["code"] for m in res.data["modalities"]}
        self.assertTrue({"radio", "echo", "scanner", "irm", "mammo"} <= codes)
        self.assertEqual(self.client.get("/api/imaging/modalities").status_code, 403)  # connexion requise

    def test_prescription_imagerie(self):
        res = self.prescribe()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["kind"], "imagerie")
        self.assertEqual(res.data["modality_label"], "Radiographie")
        self.assertEqual(res.data["safety"]["alerts"], [])
        self.assertEqual(LabOrder.objects.get().kind, "imagerie")

    def test_examen_inconnu_refuse(self):
        self.assertEqual(self.prescribe(modality="telepathie").status_code, 400)
        # Une prescription d'analyses reste possible et n'a pas de type d'examen
        res = self.client_for(self.doc_user).post(
            f"/api/pro/appointments/{self.appt_id}/lab-order",
            {"tests": "NFS, CRP"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["kind"], "analyses")
        self.assertIsNone(res.data["modality"])

    def test_centres_filtres_par_examen(self):
        c = self.client_for(self.p1)
        self.assertEqual(len(c.get("/api/labs/laboratories").data), 2)
        self.assertEqual(len(c.get("/api/labs/laboratories?kind=analyses").data), 1)
        imagerie = c.get("/api/labs/laboratories?kind=imagerie").data
        self.assertEqual(len(imagerie), 1)
        self.assertEqual(imagerie[0]["modality_labels"], ["Radiographie", "Échographie", "Scanner (tomodensitométrie)"])
        self.assertEqual(len(c.get("/api/labs/laboratories?kind=imagerie&modality=irm").data), 0)
        self.assertEqual(len(c.get("/api/labs/laboratories?kind=imagerie&modality=scanner").data), 1)

    def test_envoi_au_bon_centre(self):
        order_id = self.prescribe().data["id"]
        c = self.client_for(self.p1)
        # Un laboratoire d'analyses ne peut pas recevoir une imagerie
        res = c.post(f"/api/labs/orders/{order_id}/send", {"laboratory_id": str(self.labo.id)}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("imagerie", res.data["error"])
        res = c.post(f"/api/labs/orders/{order_id}/send", {"laboratory_id": str(self.centre.id)}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["status"], "sent")

    def test_centre_sans_cet_examen_refuse(self):
        order_id = self.prescribe(modality="irm", tests="IRM cérébrale").data["id"]
        res = self.client_for(self.p1).post(
            f"/api/labs/orders/{order_id}/send", {"laboratory_id": str(self.centre.id)}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("ne réalise pas cet examen", res.data["error"])

    def test_analyses_pas_envoyees_a_un_centre_imagerie(self):
        res = self.client_for(self.doc_user).post(
            f"/api/pro/appointments/{self.appt_id}/lab-order", {"tests": "NFS"}, format="json")
        order_id = res.data["id"]
        res = self.client_for(self.p1).post(
            f"/api/labs/orders/{order_id}/send", {"laboratory_id": str(self.centre.id)}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_grossesse_et_rayons_x(self):
        Pregnancy.objects.create(owner=self.p1, last_period=date.today() - timedelta(days=50))
        alerts = self.prescribe().data["safety"]["alerts"]
        self.assertTrue(any(a["level"] == "majeure" and "rayons X" in a["title"] for a in alerts), alerts)
        # L'échographie n'utilise pas les rayons X : aucune alerte
        res = self.prescribe(modality="echo", tests="Échographie obstétricale")
        self.assertEqual(res.data["safety"]["alerts"], [])

    def test_irm_et_appareil_implante(self):
        HealthProfile.objects.create(user=self.p1, medical_devices="Pacemaker depuis 2023")
        alerts = self.prescribe(modality="irm", tests="IRM cérébrale").data["safety"]["alerts"]
        self.assertTrue(any(a["level"] == "majeure" and "IRM" in a["title"] for a in alerts), alerts)

    def test_contraste_metformine_rein_et_iode(self):
        from appointments.models import Appointment

        appt = Appointment.objects.get(id=self.appt_id)
        Prescription.objects.create(appointment=appt, patient=self.p1, doctor=self.doctor, content="x",
                                    items=[{"name": "Glucophage 850", "posology": "1 cp x2"}],
                                    valid_until=date.today() + timedelta(days=60))
        HealthProfile.objects.create(user=self.p1, allergies="Allergie à l'iode", critical_flags=["dialyse"])
        alerts = self.prescribe(modality="scanner", tests="Scanner abdominal", contrast=True).data["safety"]["alerts"]
        titles = {a["title"] for a in alerts}
        self.assertIn("Metformine et produit de contraste", titles)
        self.assertIn("Rein et produit de contraste", titles)
        self.assertIn("Allergie au produit de contraste", titles)
        # Sans produit de contraste, ces alertes disparaissent
        alerts = self.prescribe(modality="scanner", tests="Scanner abdominal").data["safety"]["alerts"]
        self.assertNotIn("Metformine et produit de contraste", {a["title"] for a in alerts})

    def test_centre_declare_ses_examens(self):
        member = LaboratoryMember.objects.get(laboratory=self.centre).user
        res = self.client_for(member).post(
            "/api/labs/mine", {"laboratory_id": str(self.centre.id), "modalities": ["irm", "radio"]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.centre.refresh_from_db()
        self.assertEqual(self.centre.modalities, ["radio", "irm"])  # ordre du catalogue
        res = self.client_for(member).post(
            "/api/labs/mine", {"laboratory_id": str(self.centre.id), "modalities": ["scanner_quantique"]}, format="json")
        self.assertEqual(res.status_code, 400)


class ImagingCredentialsTests(ApiTestCase):
    """Un centre d'imagerie ne doit pas se voir réclamer les papiers d'un laboratoire d'analyses."""

    def setUp(self):
        super().setUp()
        self.member = self.make_user("centre@test.sn", "Manipulateur")

    def centre(self, **kw):
        lab = Laboratory.objects.create(name="Centre", city="Dakar", address="Rue 1", is_verified=True, **kw)
        LaboratoryMember.objects.create(laboratory=lab, user=self.member)
        return lab

    def required(self, lab):
        from directory.requirements import required_for

        return required_for("laboratory", lab)

    def test_analyses_inchange(self):
        self.assertEqual(self.required(self.centre()), ["agrement_laboratoire", "ordre_biologiste"])

    def test_imagerie_avec_rayons_x(self):
        lab = self.centre(kind="imagerie", modalities=["radio", "echo"])
        self.assertEqual(
            self.required(lab),
            ["autorisation_imagerie", "ordre_radiologue", "radioprotection"],
        )
        self.assertNotIn("agrement_laboratoire", self.required(lab))

    def test_echographie_seule_sans_radioprotection(self):
        """Une échographie ne produit aucun rayonnement ionisant."""
        lab = self.centre(kind="imagerie", modalities=["echo", "doppler"])
        self.assertEqual(self.required(lab), ["autorisation_imagerie", "ordre_radiologue"])

    def test_les_deux_metiers_cumulent(self):
        lab = self.centre(kind="both", modalities=["scanner"])
        self.assertEqual(
            self.required(lab),
            ["agrement_laboratoire", "ordre_biologiste", "autorisation_imagerie",
             "ordre_radiologue", "radioprotection"],
        )

    def test_l_ecran_affiche_les_bonnes_pieces(self):
        lab = self.centre(kind="imagerie", modalities=["irm"])
        res = self.client_for(self.member).get(f"/api/credentials/laboratory/{lab.id}")
        self.assertEqual(res.status_code, 200, res.data)
        obligatoires = [r["label"] for r in res.data["requirements"] if r["required"]]
        self.assertIn("Autorisation d'exploitation du centre d'imagerie médicale (ministère de la Santé)", obligatoires)
        self.assertNotIn("Agrément du laboratoire d'analyses médicales", obligatoires)
        # L'IRM n'utilise pas de rayonnements ionisants
        self.assertNotIn("radioprotection", [r["kind"] for r in res.data["requirements"] if r["required"]])

    def test_depot_d_une_piece_propre_a_l_imagerie(self):
        import base64

        lab = self.centre(kind="imagerie", modalities=["radio"])
        pdf = base64.b64encode(b"%PDF-1.4 test").decode()
        res = self.client_for(self.member).post(
            f"/api/credentials/laboratory/{lab.id}",
            {"kind": "autorisation_imagerie", "file_name": "autorisation.pdf", "content_base64": pdf},
            format="json")
        self.assertEqual(res.status_code, 200, res.data)
        # Une pièce qui ne concerne pas ce métier est refusée
        res = self.client_for(self.member).post(
            f"/api/credentials/laboratory/{lab.id}",
            {"kind": "ordre_biologiste", "file_name": "x.pdf", "content_base64": pdf},
            format="json")
        self.assertEqual(res.status_code, 400)
