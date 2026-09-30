"""Rappels du carnet : vaccins des enfants et consultations prénatales (appelés par send_reminders)."""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import Relative
from notifications.service import notify

from .models import Pregnancy, PrenatalVisit, VaccineDose, VaccineReminder
from .schedules import CPN_WEEKS, PEV

VACCINE_NOTICE_DAYS = 3
CPN_NOTICE_DAYS = 5


def send_vaccine_reminders() -> int:
    today = timezone.localdate()
    oldest_due = max(d.age_days for d in PEV)
    count = 0
    # Seuls les enfants encore concernés par le calendrier (moins de ~16 mois).
    children = Relative.objects.filter(birth_date__isnull=False, birth_date__gte=today - timedelta(days=oldest_due + 30)).select_related("owner")
    for child in children:
        given = set(VaccineDose.objects.filter(relative=child).values_list("vaccine_code", flat=True))
        due = [d for d in PEV if d.code not in given and today <= child.birth_date + timedelta(days=d.age_days) <= today + timedelta(days=VACCINE_NOTICE_DAYS)]
        fresh = []
        for d in due:
            try:
                with transaction.atomic():
                    VaccineReminder.objects.create(relative=child, vaccine_code=d.code)
                fresh.append(d)
            except IntegrityError:
                continue  # déjà rappelé
        if fresh:
            when = child.birth_date + timedelta(days=fresh[0].age_days)
            notify(
                child.owner,
                kind="vaccine",
                title=f"Vaccins de {child.full_name} ({fresh[0].age_label})",
                body=f"À faire à partir du {when:%d/%m/%Y} : {', '.join(d.name.split(' (')[0] for d in fresh)}. Rendez-vous au poste de santé ou chez votre pédiatre.",
                link="/dossier#carnet",
                sms=True,
            )
            count += 1
    return count


def send_prenatal_reminders(now) -> int:
    today = timezone.localdate()
    count = 0
    for p in Pregnancy.objects.filter(status="active").select_related("owner"):
        visits = {v.contact: v for v in p.visits.all()}
        for i, week in enumerate(CPN_WEEKS, 1):
            target = p.last_period + timedelta(weeks=week)
            v = visits.get(i)
            if (v and (v.done_on or v.reminded_at)) or not (today <= target <= today + timedelta(days=CPN_NOTICE_DAYS)):
                continue
            PrenatalVisit.objects.update_or_create(pregnancy=p, contact=i, defaults={"reminded_at": now})
            notify(
                p.owner,
                kind="prenatal",
                title=f"Consultation prénatale n° {i} ({week} semaines)",
                body=f"Prévue vers le {target:%d/%m/%Y}. Prenez rendez-vous avec votre sage-femme ou votre gynécologue.",
                link="/medecins?specialty=gynecologie",
                sms=True,
            )
            count += 1
    return count
