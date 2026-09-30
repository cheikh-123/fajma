"""
Alerte aux médecins qui suivent le patient quand une mesure à domicile est dangereuse (tension très
élevée, hypoglycémie, glycémie très élevée) ou quand les valeurs élevées se répètent (3 en 7 jours).

Destinataires : les médecins qui ont déjà accès aux mesures (rendez-vous confirmé ou terminé depuis moins
d'un an), 3 au plus, les plus récents. Une alerte par médecin, patient et type de mesure toutes les
24 heures. Le patient peut désactiver ces alertes (profil de santé).
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from appointments.models import Appointment
from notifications.models import Notification
from notifications.service import notify

from .logic import assess
from .models import Measurement

MAX_DOCTORS = 3
REPEAT_COUNT = 3
REPEAT_DAYS = 7


def _followers(patient):
    """Médecins (titulaire ou remplaçant) ayant un RDV confirmé ou terminé avec le patient depuis un an."""
    from directory.models import Doctor

    since = timezone.now() - timedelta(days=365)
    visits = Appointment.objects.filter(
        patient=patient, status__in=("confirmed", "completed"), scheduled_at__gte=since
    ).order_by("-scheduled_at")
    ids: list = []
    for doctor_id, practitioner_id in visits.values_list("doctor_id", "practitioner_id")[:50]:
        for d in (practitioner_id, doctor_id):  # le remplaçant qui a vu le patient, puis le titulaire
            if d and d not in ids:
                ids.append(d)
    doctors = {d.id: d for d in Doctor.objects.filter(id__in=ids, user__is_active=True).select_related("user")}
    return [doctors[i] for i in ids if i in doctors][:MAX_DOCTORS]


def _describe(m: Measurement) -> str:
    if m.kind == "blood_pressure":
        return f"tension {m.systolic}/{m.diastolic} mmHg"
    return f"glycémie {m.value:.2f} g/L".replace(".", ",")


def check_measurement(m: Measurement) -> int:
    """Appelée après chaque nouvelle mesure ; renvoie le nombre de médecins prévenus."""
    if m.kind == "weight":
        return 0
    from medical.models import HealthProfile

    hp = HealthProfile.objects.filter(user=m.patient).first()
    if hp and not hp.alert_doctors:
        return 0
    level, _ = assess(m.kind, m.systolic, m.diastolic, m.value, m.context)
    if level in ("very_high", "low"):
        reason = "valeur dangereuse"
    elif level == "high":
        recent = Measurement.objects.filter(
            patient=m.patient, relative=m.relative, kind=m.kind, measured_at__gte=timezone.now() - timedelta(days=REPEAT_DAYS)
        )
        highs = sum(1 for x in recent if assess(x.kind, x.systolic, x.diastolic, x.value, x.context)[0] in ("high", "very_high"))
        if highs < REPEAT_COUNT:
            return 0
        reason = f"{highs} valeurs élevées en {REPEAT_DAYS} jours"
    else:
        return 0

    subject = m.relative.full_name if m.relative else m.patient.full_name
    label = "Tension" if m.kind == "blood_pressure" else "Glycémie"
    link = f"/patients/{m.patient_id}"
    count = 0
    for doctor in _followers(m.patient):
        already = Notification.objects.filter(
            user=doctor.user, kind="measurement_alert", link=link, title__startswith=label,
            created_at__gte=timezone.now() - timedelta(hours=24),
        ).exists()
        if already:
            continue
        notify(
            doctor.user,
            kind="measurement_alert",
            title=f"{label} à surveiller : {subject}",
            body=f"{_describe(m).capitalize()} ({reason}), mesurée à domicile. Voir la fiche patient.",
            link=link,
            email=level in ("very_high", "low"),
        )
        count += 1
    return count
