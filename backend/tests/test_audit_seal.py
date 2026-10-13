"""
Scellement du journal d'audit : la chaîne doit tenir en usage normal, et se rompre dès qu'on touche à la base.

Les tests écrivent directement dans la base avec `update()` et `delete()`, c'est-à-dire en contournant les
garde-fous du modèle — exactement ce que ferait quelqu'un disposant d'un accès à la base ou d'une sauvegarde
volée. C'est ce scénario-là que le scellement doit rattraper, puisque c'est le seul que le code Python ne peut
pas empêcher.
"""

import io
from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone

from audit import log as audit
from audit.models import AuditEvent
from audit.seal import AuditChainHead, verify

from .test_security import ApiTestCase


def anomalies():
    return verify(AuditEvent.objects.order_by("chain_index"))


def verifier(*args) -> tuple[str, int]:
    out = io.StringIO()
    code = 0
    try:
        call_command("verifier_journal", *args, stdout=out, stderr=io.StringIO())
    except SystemExit:
        code = 1
    return out.getvalue(), code


class AuditSealTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        for i in range(5):
            audit.log(None, "login", actor=self.p1, essai=i)

    def test_chaine_intacte_en_usage_normal(self):
        events = list(AuditEvent.objects.order_by("chain_index"))
        self.assertEqual([e.chain_index for e in events], [1, 2, 3, 4, 5])
        self.assertTrue(all(len(e.seal) == 64 for e in events))
        self.assertEqual(anomalies(), [])
        out, code = verifier()
        self.assertEqual(code, 0, out)
        self.assertIn("Journal intact", out)

    def test_une_ligne_modifiee_dans_la_base_est_detectee(self):
        cible = AuditEvent.objects.get(chain_index=3)
        # Quelqu'un maquille une consultation de dossier en simple connexion.
        AuditEvent.objects.filter(pk=cible.pk).update(action="document_viewed")
        problems = anomalies()
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("évènement 3 modifié", problems[0])
        out, code = verifier()
        self.assertEqual(code, 1)
        self.assertIn("anomalie", out)

    def test_une_metadonnee_retouchee_est_detectee(self):
        cible = AuditEvent.objects.get(chain_index=2)
        AuditEvent.objects.filter(pk=cible.pk).update(metadata={"essai": 99})
        self.assertIn("évènement 2 modifié", " ".join(anomalies()))

    def test_une_adresse_ip_effacee_est_detectee(self):
        cible = AuditEvent.objects.get(chain_index=4)
        AuditEvent.objects.filter(pk=cible.pk).update(ip="10.9.9.9")
        self.assertIn("évènement 4 modifié", " ".join(anomalies()))

    def test_une_ligne_supprimee_est_detectee(self):
        AuditEvent.objects.filter(chain_index=3).delete()
        problems = anomalies()
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("1 évènement(s) manquant(s) avant le rang 4", problems[0])

    def test_plusieurs_lignes_supprimees_sont_comptees(self):
        AuditEvent.objects.filter(chain_index__in=[2, 3]).delete()
        self.assertIn("2 évènement(s) manquant(s) avant le rang 4", " ".join(anomalies()))

    def test_un_evenement_fabrique_de_toutes_pieces_est_detecte(self):
        """Insérer une ligne crédible sans connaître la clé ne trompe pas la vérification."""
        vrai = AuditEvent.objects.get(chain_index=5)
        AuditEvent.objects.create(
            actor=self.p1, action="login", chain_index=6, seal="a" * 64, metadata={"essai": 5}
        )
        self.assertIn("évènement 6 modifié", " ".join(anomalies()))
        self.assertEqual(vrai.chain_index, 5)  # les précédents restent valides

    def test_la_purge_des_anciens_evenements_ne_casse_pas_la_chaine(self):
        """La conservation est limitée (5 ans) : effacer le début du journal est légitime et ne doit pas
        faire crier la vérification."""
        AuditEvent.objects.filter(chain_index__in=[1, 2]).delete()
        self.assertEqual(anomalies(), [])
        self.assertEqual(verifier()[1], 0)

    def test_les_evenements_anterieurs_au_scellement_sont_signales_sans_alarme(self):
        AuditEvent.objects.filter(chain_index=1).update(chain_index=None, seal="")
        problems = anomalies()
        self.assertEqual(len(problems), 1)
        self.assertIn("sans rang", problems[0])
        out, code = verifier()
        self.assertEqual(code, 0, out)  # pas une rupture : juste du journal ancien
        self.assertIn("non vérifiables", out)

    def test_l_ancre_donne_le_dernier_sceau(self):
        head = AuditChainHead.objects.get(singleton=1)
        out, code = verifier("--ancre")
        self.assertEqual(code, 0)
        self.assertIn(head.last_seal, out)
        self.assertIn("rang  : 5", out)

    def test_la_verification_peut_se_limiter_a_une_periode(self):
        AuditEvent.objects.filter(chain_index=1).update(created_at=timezone.now() - timedelta(days=400))
        out, _ = verifier("--depuis", "30")
        self.assertIn("4 évènement(s) examiné(s)", out)

    def test_le_journal_continue_de_fonctionner_si_le_scellement_echoue(self):
        """Le journal prime sur son scellement : une action auditée ne doit jamais échouer à cause de lui."""
        before = AuditEvent.objects.count()
        audit.log(None, "login", actor=self.p1)
        self.assertEqual(AuditEvent.objects.count(), before + 1)


class StrictFieldsTests(ApiTestCase):
    """Sur les écrans de consentement, un champ non reconnu est refusé plutôt qu'ignoré en silence.

    Ailleurs, ignorer l'inconnu est le bon choix : une ancienne version de l'application doit continuer à
    fonctionner après une mise à jour du serveur. Ici, non : une faute de frappe dans un nom de champ ferait
    croire à la personne qu'elle a retiré un droit alors que rien n'aurait changé.
    """

    def test_champ_mal_orthographie_refuse_sur_la_fiche_d_urgence(self):
        client = self.client_for(self.p1)
        ok = client.post("/api/patient/emergency-card", {"enabled": True}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        # « field » au lieu de « fields » : le patient croirait avoir restreint ce qu'il publie.
        res = client.post(
            "/api/patient/emergency-card", {"enabled": True, "field": ["blood_group"]}, format="json"
        )
        self.assertEqual(res.status_code, 400, res.data)
        self.assertIn("field", res.data["error"])

    def test_les_champs_connus_passent_toujours(self):
        res = self.client_for(self.p1).post(
            "/api/patient/emergency-card",
            {"enabled": True, "fields": ["blood_group"], "blood_group": "O+", "alert_doctors": True},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
