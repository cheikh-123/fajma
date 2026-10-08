from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class AuditEvent(BaseModel):
    """
    Trace non modifiable des actions sensibles : consultation d'un dossier médical, téléchargement d'un
    document, connexion, actions d'administration… Exigée pour l'hébergement de données de santé.
    """

    ACTIONS = [
        ("login", "Connexion"),
        ("login_failed", "Échec de connexion"),
        ("mfa_enabled", "Double authentification activée"),
        ("mfa_disabled", "Double authentification désactivée"),
        ("passkey_added", "Clé d'accès ajoutée"),
        ("passkey_removed", "Clé d'accès retirée"),
        ("patient_file_viewed", "Fiche patient consultée"),
        ("document_viewed", "Document consulté"),
        ("prescription_viewed", "Ordonnance consultée"),
        ("record_written", "Compte-rendu rédigé"),
        ("ai_draft", "Brouillon de compte-rendu demandé à l'assistant"),
        ("renewal_requested", "Renouvellement d'ordonnance demandé"),
        ("renewal_accepted", "Ordonnance renouvelée"),
        ("renewal_refused", "Renouvellement refusé"),
        ("emergency_card_updated", "Fiche d'urgence modifiée"),
        ("emergency_card_viewed", "Fiche d'urgence consultée (QR code)"),
        ("medical_record_exported", "Dossier médical téléchargé en PDF"),
        ("data_exported", "Export des données"),
        ("account_deleted", "Compte supprimé"),
        ("admin_verification", "Validation (administration)"),
        ("payout_requested", "Virement demandé"),
        ("payout_processed", "Virement traité (administration)"),
        ("refund_processed", "Remboursement effectué (administration)"),
        ("data_export", "Export tableur"),
        ("password_changed", "Mot de passe modifié"),
        ("password_change_failed", "Échec de changement de mot de passe"),
        ("email_change_requested", "Changement d'email demandé"),
        ("email_change_failed", "Échec de changement d'email"),
        ("email_changed", "Adresse email modifiée"),
        ("sessions_revoked", "Autres appareils déconnectés"),
        ("inactive_account_purged", "Compte inactif anonymisé (purge automatique)"),
        ("doctor_profile_updated", "Fiche médecin modifiée"),
        ("pharmacy_updated", "Officine modifiée (pharmacien)"),
        ("admin_user_search", "Recherche de compte (administration)"),
        ("admin_user_suspend", "Compte suspendu (administration)"),
        ("admin_user_reactivate", "Compte réactivé (administration)"),
        ("admin_user_reset_mfa", "Double authentification réinitialisée (administration)"),
        ("admin_pharmacy_created", "Pharmacie ajoutée (administration)"),
        ("admin_pharmacy_updated", "Pharmacie modifiée (administration)"),
        ("admin_lab_created", "Laboratoire ajouté (administration)"),
        ("admin_lab_updated", "Laboratoire modifié (administration)"),
        ("lab_updated", "Laboratoire modifié (biologiste)"),
        ("family_invited", "Entraide familiale : proche invité"),
        ("family_accepted", "Entraide familiale : accord du bénéficiaire"),
        ("family_revoked", "Entraide familiale : accès retiré"),
        ("family_settings", "Entraide familiale : droits modifiés"),
        ("community_follow", "Relais : personne suivie (accord recueilli)"),
        ("community_transfer", "Relais : dossier transféré à la personne"),
        ("mdo_declared", "Maladie à déclaration immédiate déclarée au district"),
        ("admin_partner_saved", "Partenaire modifié (administration)"),
        ("admin_campaign_saved", "Campagne sponsorisée modifiée (administration)"),
        ("admin_support_closed", "Demande d'aide traitée (administration)"),
        ("admin_support_reopened", "Demande d'aide rouverte (administration)"),
        ("admin_announcement", "Annonce groupée envoyée (administration)"),
        ("admin_settings", "Réglages modifiés (administration)"),
        ("admin_staff_changed", "Rôle d'un membre de l'équipe modifié (administration)"),
    ]

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_events_about_me"
    )
    action = models.CharField(max_length=40, choices=ACTIONS, db_index=True)
    target_type = models.CharField(max_length=40, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["patient", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
            # Journal de l'administration (du plus récent au plus ancien) et filtre par type d'action
            # (dont le verrou anti-force brute : échecs de connexion des 15 dernières minutes).
            models.Index(fields=["-created_at"], name="audit_recent_idx"),
            models.Index(fields=["action", "-created_at"], name="audit_action_recent_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("Un évènement d'audit ne peut pas être modifié")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Un évènement d'audit ne peut pas être supprimé")
