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
        ("patient_file_viewed", "Fiche patient consultée"),
        ("document_viewed", "Document consulté"),
        ("prescription_viewed", "Ordonnance consultée"),
        ("record_written", "Compte-rendu rédigé"),
        ("data_exported", "Export des données"),
        ("account_deleted", "Compte supprimé"),
        ("admin_verification", "Validation (administration)"),
        ("payout_requested", "Virement demandé"),
        ("payout_processed", "Virement traité (administration)"),
        ("refund_processed", "Remboursement effectué (administration)"),
        ("data_export", "Export tableur"),
        ("password_changed", "Mot de passe modifié"),
        ("password_change_failed", "Échec de changement de mot de passe"),
        ("doctor_profile_updated", "Fiche médecin modifiée"),
        ("pharmacy_updated", "Officine modifiée (pharmacien)"),
        ("admin_user_search", "Recherche de compte (administration)"),
        ("admin_user_suspend", "Compte suspendu (administration)"),
        ("admin_user_reactivate", "Compte réactivé (administration)"),
        ("admin_user_reset_mfa", "Double authentification réinitialisée (administration)"),
        ("admin_pharmacy_created", "Pharmacie ajoutée (administration)"),
        ("admin_pharmacy_updated", "Pharmacie modifiée (administration)"),
        ("admin_lab_created", "Laboratoire ajouté (administration)"),
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
        indexes = [models.Index(fields=["patient", "created_at"]), models.Index(fields=["actor", "created_at"])]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("Un évènement d'audit ne peut pas être modifié")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Un évènement d'audit ne peut pas être supprimé")
