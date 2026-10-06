"""Destinataires d'une annonce groupée (partagé par la vue et la tâche d'envoi)."""

from __future__ import annotations

from django.db.models import Q

from accounts.models import User

MAX_RECIPIENTS = 20000  # garde-fou : au-delà, l'envoi se fait par plusieurs annonces ciblées
SMS_MAX_RECIPIENTS = 5000  # un SMS est payant : au-delà, on exige un ciblage


def resolve(audience: str, city: str):
    """Comptes actifs visés. `city` vide = tout le pays."""
    from clinics.models import Clinic, ClinicStaff
    from community.models import CommunityAgent
    from directory.models import Doctor
    from labs.models import LaboratoryMember
    from pharmacy.models import PharmacyMember

    users = User.objects.filter(is_active=True)
    c = (city or "").strip()
    if audience == "doctors":
        qs = Doctor.objects.filter(is_verified=True, user__isnull=False)
        if c:
            qs = qs.filter(city__iexact=c)
        return users.filter(id__in=qs.values("user_id"))
    if audience == "pharmacies":
        qs = PharmacyMember.objects.all()
        if c:
            qs = qs.filter(pharmacy__city__iexact=c)
        return users.filter(id__in=qs.values("user_id"))
    if audience == "labs":
        qs = LaboratoryMember.objects.all()
        if c:
            qs = qs.filter(laboratory__city__iexact=c)
        return users.filter(id__in=qs.values("user_id"))
    if audience == "clinics":
        owners = Clinic.objects.filter(kind="clinic")
        staff = ClinicStaff.objects.all()
        if c:
            owners, staff = owners.filter(city__iexact=c), staff.filter(clinic__city__iexact=c)
        return users.filter(Q(id__in=owners.values("owner_id")) | Q(id__in=staff.values("user_id")))
    if audience == "relais":
        return users.filter(id__in=CommunityAgent.objects.filter(is_active=True).values("user_id"))
    pros = Q(is_staff=True) | Q(id__in=Doctor.objects.values("user_id")) | Q(id__in=PharmacyMember.objects.values("user_id"))
    qs = users.exclude(pros) if audience == "patients" else users
    if c:
        qs = qs.filter(city__iexact=c)
    return qs
