"""
Notifications : cloche dans l'application, et pour les événements importants SMS/WhatsApp et email.
Un échec d'envoi n'interrompt jamais l'action qui l'a déclenché.
"""

from __future__ import annotations

import logging

from .models import Notification
from .sms import format_when, normalize_phone
from .tasks import queue_email, queue_sms

logger = logging.getLogger(__name__)


def notify(user, *, kind: str, title: str, body: str = "", link: str = "", sms: bool = False, email: bool = False) -> None:
    if user is None or not user.is_active:
        return
    try:
        Notification.objects.create(user=user, kind=kind, title=title, body=body, link=link)
        # Alerte sur les appareils abonnés (gratuit) ; le SMS reste réservé aux messages importants.
        from .push import queue_push

        queue_push(user, title, body, link)
        # Envois externes en arrière-plan : la requête de l'utilisateur n'attend pas Twilio ni le serveur mail.
        if sms and (phone := normalize_phone(user.phone)):
            queue_sms(phone, f"Fajma — {title}. {body}".strip(), user.notification_channel)
        if email and user.email:
            queue_email(user.email, f"Fajma — {title}", body or title)
    except Exception:  # noqa: BLE001
        logger.exception("notification %s : échec", kind)


# ── Événements liés aux rendez-vous ──────────────────────────────────


def _who(appt) -> str:
    if appt.relative:
        return appt.relative.full_name
    if appt.patient:
        return appt.patient.full_name or "Un patient"
    return appt.external_patient_name or "Un patient"


def seen_by(appt) -> str:
    """Médecin qui reçoit le patient : le titulaire, ou son remplaçant pendant un remplacement."""
    if getattr(appt, "practitioner_id", None):
        return f"{appt.practitioner.full_name} (remplaçant de {appt.doctor.full_name})"
    return appt.doctor.full_name


def _where(appt) -> str:
    return " — visite à domicile" if appt.mode == "home_visit" else ""


def _doctors(appt) -> list:
    """Titulaire et, s'il y en a un, remplaçant qui assure la consultation."""
    people = [appt.doctor.user]
    if getattr(appt, "practitioner_id", None) and appt.practitioner.user_id != appt.doctor.user_id:
        people.append(appt.practitioner.user)
    return people


def appointment_booked(appt) -> None:
    when = format_when(appt.scheduled_at)
    if appt.status == "confirmed":
        notify(appt.patient, kind="appointment_confirmed", title="Rendez-vous confirmé",
               body=f"{seen_by(appt)}, {when}{_where(appt)}.", link="/mon-espace", sms=True, email=True)
    else:
        notify(appt.patient, kind="appointment_requested", title="Demande de rendez-vous envoyée",
               body=f"{seen_by(appt)}, {when}{_where(appt)}. Vous serez prévenu dès sa confirmation.", link="/mon-espace", email=True)
    title = "Nouvelle demande de visite à domicile" if appt.mode == "home_visit" else "Nouveau rendez-vous"
    for user in _doctors(appt):
        notify(user, kind="appointment_new", title=title, body=f"{_who(appt)} — {when}.", link="/pro")
    _family(appt, "Rendez-vous de {label}", f"{seen_by(appt)}, {when}{_where(appt)} ({'confirmé' if appt.status == 'confirmed' else 'en attente de confirmation'}).")


def appointment_confirmed(appt) -> None:
    notify(appt.patient, kind="appointment_confirmed", title="Rendez-vous confirmé",
           body=f"{seen_by(appt)}, {format_when(appt.scheduled_at)}{_where(appt)}.", link="/mon-espace", sms=True, email=True)
    _family(appt, "Rendez-vous de {label} confirmé", f"{seen_by(appt)}, {format_when(appt.scheduled_at)}{_where(appt)}.")


def _family(appt, title: str, body: str) -> None:
    """Proche aidant (entraide familiale) tenu informé des rendez-vous du bénéficiaire."""
    try:
        from family.logic import notify_family

        notify_family(appt, title, body)
    except Exception:  # noqa: BLE001
        logger.exception("notification famille : échec")


def series_booked(series, booked: list, skipped: list[str]) -> None:
    """Un seul message pour toute la série (et non un SMS par séance)."""
    if not booked:
        return
    first = booked[0]
    dates = f"du {format_when(booked[0].scheduled_at)} au {format_when(booked[-1].scheduled_at)}"
    missing = f" {len(skipped)} date(s) indisponible(s) n'ont pas été réservées." if skipped else ""
    state = "confirmées" if first.status == "confirmed" else "en attente de confirmation"
    notify(first.patient, kind="series_booked", title=f"{len(booked)} séances réservées",
           body=f"{seen_by(first)}, {dates} ({state}).{missing}", link="/mon-espace", sms=True, email=True)
    for user in _doctors(first):
        notify(user, kind="appointment_new", title=f"Série de {len(booked)} séances",
               body=f"{_who(first)} — {dates}.", link="/pro")


def series_extended(appt, created: list) -> None:
    """Séances ajoutées par le médecin ou le secrétariat."""
    notify(appt.patient, kind="series_booked", title=f"{len(created)} séance(s) programmée(s)",
           body=f"{appt.doctor.full_name} : du {format_when(created[0].scheduled_at)} au {format_when(created[-1].scheduled_at)}.",
           link="/mon-espace", sms=True, email=True)


def series_cancelled(appts: list, by: str) -> None:
    first = appts[0]
    span = f"{len(appts)} séance(s) à partir du {format_when(first.scheduled_at)}"
    if by == "patient":
        for user in _doctors(first):
            notify(user, kind="appointment_cancelled", title="Séances annulées par le patient", body=f"{_who(first)} — {span}.", link="/pro")
    else:
        notify(first.patient, kind="appointment_cancelled", title="Séances annulées",
               body=f"{first.doctor.full_name} a annulé {span}. Vous pouvez reprendre rendez-vous.",
               link=f"/medecins/{first.doctor_id}", sms=True, email=True)


# ── Remplacements ────────────────────────────────────────────────────


def _period(r) -> str:
    from datetime import timedelta

    last = r.ends_at - timedelta(days=1)
    return f"du {r.starts_at:%d/%m/%Y} au {last:%d/%m/%Y}"


def replacement_proposed(r) -> None:
    notify(r.replacement.user, kind="replacement", title="Proposition de remplacement",
           body=f"{r.doctor.full_name} vous propose de le remplacer {_period(r)}.", link="/pro#remplacements", sms=True, email=True)


def replacement_answered(r, moved: int) -> None:
    if r.status == "accepted":
        extra = f" {moved} rendez-vous déjà pris lui sont confiés." if moved else ""
        notify(r.doctor.user, kind="replacement", title="Remplacement accepté",
               body=f"{r.replacement.full_name} vous remplacera {_period(r)}.{extra}", link="/pro#remplacements", email=True)
    else:
        notify(r.doctor.user, kind="replacement", title="Remplacement refusé",
               body=f"{r.replacement.full_name} ne peut pas vous remplacer {_period(r)}.", link="/pro#remplacements", email=True)


def replacement_cancelled(r, *, by_titular: bool, returned: int) -> None:
    if by_titular:
        notify(r.replacement.user, kind="replacement", title="Remplacement annulé",
               body=f"{r.doctor.full_name} a annulé le remplacement prévu {_period(r)}.", link="/pro#remplacements", email=True)
    else:
        extra = f" {returned} rendez-vous à venir vous reviennent : confirmez-les ou annulez-les." if returned else ""
        notify(r.doctor.user, kind="replacement", title="Remplacement annulé",
               body=f"{r.replacement.full_name} a annulé le remplacement prévu {_period(r)}.{extra}", link="/pro#remplacements",
               sms=bool(returned), email=True)


def practitioner_changed(appt) -> None:
    """Le patient doit savoir quel médecin le recevra."""
    when = format_when(appt.scheduled_at)
    if appt.practitioner_id:
        body = f"Votre rendez-vous du {when} avec {appt.doctor.full_name} sera assuré par son remplaçant, {appt.practitioner.full_name}."
    else:
        body = f"Votre rendez-vous du {when} est de nouveau assuré par {appt.doctor.full_name}."
    notify(appt.patient, kind="practitioner_changed", title="Changement de médecin", body=body, link="/mon-espace", sms=True, email=True)


def appointment_cancelled(appt) -> None:
    when = format_when(appt.scheduled_at)
    _family(appt, "Rendez-vous de {label} annulé", f"{appt.doctor.full_name}, {when}.")
    if appt.cancelled_by == "patient":
        late = getattr(appt, "late_cancellation", False)
        for user in _doctors(appt):
            notify(
                user,
                kind="appointment_cancelled",
                title="Annulation tardive" if late else "Rendez-vous annulé par le patient",
                body=f"{_who(appt)} — {when}." + (" Le créneau est de nouveau libre." if late else ""),
                link="/pro",
                # Hors délai : le cabinet doit l'apprendre tout de suite pour redonner le créneau.
                sms=late,
            )
    else:
        reason = f" Motif : {appt.cancel_reason}." if appt.cancel_reason else ""
        notify(appt.patient, kind="appointment_cancelled", title="Rendez-vous annulé",
               body=f"{appt.doctor.full_name} a annulé votre rendez-vous du {when}.{reason} Vous pouvez en reprendre un autre.",
               link=f"/medecins/{appt.doctor_id}", sms=True, email=True)


def appointment_rescheduled(appt) -> None:
    for user in _doctors(appt):
        notify(user, kind="appointment_rescheduled", title="Rendez-vous déplacé",
               body=f"{_who(appt)} — nouvel horaire : {format_when(appt.scheduled_at)}.", link="/pro")


def appointment_moved_by_practice(appt, old_time) -> None:
    """Le cabinet a déplacé le RDV : le patient doit le savoir (SMS), même s'il n'a pas de compte."""
    text = (
        f"Votre rendez-vous du {format_when(old_time)} avec {seen_by(appt)} est déplacé au "
        f"{format_when(appt.scheduled_at)}{_where(appt)}."
    )
    if appt.patient_id:
        notify(appt.patient, kind="appointment_rescheduled", title="Rendez-vous déplacé par le cabinet",
               body=text, link="/mon-espace", sms=True, email=True)
    elif phone := normalize_phone(appt.external_patient_phone):
        try:
            queue_sms(phone, f"Fajma — {text}")
        except Exception:  # noqa: BLE001
            logger.exception("SMS de déplacement : échec")


def new_message(recipient, sender_name: str, link: str) -> None:
    notify(recipient, kind="message", title="Nouveau message", body=f"De {sender_name}.", link=link)
