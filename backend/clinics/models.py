from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class Clinic(BaseModel):
    # PROTECT : supprimer le compte du responsable n'efface jamais l'établissement (transférer d'abord).
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_clinics")
    name = models.CharField(max_length=160)
    city = models.CharField(max_length=80)
    address = models.CharField(max_length=240, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    description = models.TextField(blank=True, max_length=1500)
    is_verified = models.BooleanField(default=False)
    # « practice » : cabinet d'un médecin seul, créé en coulisses pour son secrétariat (pas de page publique).
    KINDS = [("clinic", "Clinique / centre de santé"), ("practice", "Cabinet d'un médecin")]
    kind = models.CharField(max_length=10, choices=KINDS, default="clinic")

    def __str__(self):
        return self.name


class ClinicMember(BaseModel):
    """Médecin exerçant dans une clinique."""

    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name="members")
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="clinic_memberships")
    title = models.CharField(max_length=100, default="Médecin")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["clinic", "doctor"], name="unique_clinic_member")]


class ClinicStaff(BaseModel):
    """Secrétariat ou gestionnaire : gère l'agenda de tous les médecins de la clinique."""

    ROLES = [("secretary", "Secrétaire"), ("manager", "Gestionnaire")]

    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name="staff")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="clinic_roles")
    role = models.CharField(max_length=10, choices=ROLES, default="secretary")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["clinic", "user"], name="unique_clinic_staff")]
