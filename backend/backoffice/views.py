"""
API de l'administration : recherche globale, liste et fiche 360° des médecins, annonces groupées, réglages,
rôles de l'équipe, journal d'audit filtrable et exportable, informations publiques du site.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta

from django.db.models import Avg, Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import User
from accounts.views import require_admin
from audit import log as audit
from audit.models import AuditEvent
from sunusante.api import ApiError, body, get_choice, get_str, iso, not_found

from . import settings_registry as reg
from .models import Announcement, StaffRole
from .roles import role_of, sections_of

# ── Recherche globale ─────────────────────────────────────────────────


@api_view(["GET"])
def search(request):
    """?q= : comptes, médecins, cliniques, pharmacies, laboratoires, ordonnances, paiements (5 de chaque)."""
    from clinics.models import Clinic
    from directory.models import Doctor, Pharmacy
    from labs.models import Laboratory
    from medical.models import Prescription
    from payments.models import Payment

    require_admin(request)
    q = (request.query_params.get("q") or "").strip()
    if len(q) < 2:
        return Response({"results": []})
    digits = "".join(c for c in q if c.isdigit())
    out = []
    users = User.objects.filter(Q(full_name__icontains=q) | Q(email__icontains=q) | (Q(phone__contains=digits[-9:]) if len(digits) >= 4 else Q(pk=None)))
    for u in users[:5]:
        out.append({"type": "user", "label": u.full_name or u.email or u.phone, "sub": " · ".join(x for x in (u.email, u.phone) if x), "id": str(u.id)})
    for d in Doctor.objects.filter(Q(full_name__icontains=q) | Q(city__icontains=q) | Q(order_number__icontains=q)).select_related("specialty")[:5]:
        out.append({"type": "doctor", "label": d.full_name, "sub": f"{d.specialty.name if d.specialty_id else ''} · {d.city}", "id": str(d.id)})
    for c in Clinic.objects.filter(name__icontains=q)[:5]:
        out.append({"type": "clinic", "label": c.name, "sub": c.city, "id": str(c.id)})
    for p in Pharmacy.objects.filter(Q(name__icontains=q) | Q(district__icontains=q))[:5]:
        out.append({"type": "pharmacy", "label": p.name, "sub": f"{p.district or ''} {p.city}".strip(), "id": str(p.id)})
    for lab in Laboratory.objects.filter(name__icontains=q)[:5]:
        out.append({"type": "lab", "label": lab.name, "sub": lab.city, "id": str(lab.id)})
    if len(q) >= 4:
        for rx in Prescription.objects.filter(reference__icontains=q).select_related("doctor")[:5]:
            out.append({"type": "prescription", "label": rx.reference, "sub": f"{rx.doctor.full_name} · {rx.created_at:%d/%m/%Y}", "id": str(rx.id)})
        for pay in Payment.objects.filter(Q(reference__icontains=q) | Q(receipt_number__icontains=q)).select_related("appointment__doctor")[:5]:
            out.append({"type": "payment", "label": pay.receipt_number or pay.reference, "sub": f"{pay.amount} F · {pay.get_status_display()}", "id": str(pay.id)})
    audit.log(request, "admin_user_search", query=q[:60], scope="global")
    return Response({"results": out})


# ── Médecins : liste et fiche 360° ────────────────────────────────────


@api_view(["GET"])
def doctors(request):
    """?q=&status=to_verify|verified|all&city= : 100 au plus, à vérifier d'abord."""
    from directory.models import Doctor

    require_admin(request)
    qs = Doctor.objects.select_related("specialty", "user")
    if q := (request.query_params.get("q") or "").strip():
        qs = qs.filter(Q(full_name__icontains=q) | Q(order_number__icontains=q) | Q(user__email__icontains=q))
    status = request.query_params.get("status", "all")
    if status == "to_verify":
        qs = qs.filter(is_verified=False)
    elif status == "verified":
        qs = qs.filter(is_verified=True)
    if city := (request.query_params.get("city") or "").strip():
        qs = qs.filter(city__iexact=city)
    return Response([
        {"id": str(d.id), "full_name": d.full_name, "specialty": d.specialty.name if d.specialty_id else None, "specialty_id": str(d.specialty_id),
         "city": d.city, "is_verified": d.is_verified, "active": d.user.is_active if d.user_id else None, "created_at": iso(d.created_at)}
        for d in qs.order_by("is_verified", "-created_at")[:100]
    ])


@api_view(["GET"])
def doctor_overview(request, doctor_id):
    """Tout sur un médecin en un écran (sans contenu médical de ses patients)."""
    from appointments.models import Appointment
    from directory.credentials import credential_dict, missing_required
    from directory.models import Credential, Doctor, Review
    from payments.ledger import balance
    from payments.models import LedgerEntry, Payout
    from payments.plans import effective_plan

    require_admin(request)
    d = Doctor.objects.filter(id=doctor_id).select_related("specialty", "user").first()
    if not d:
        raise not_found("Médecin introuvable")
    since = timezone.now() - timedelta(days=90)
    appts = Appointment.objects.filter(doctor=d)
    recent = appts.filter(scheduled_at__gte=since)
    by_status = dict(recent.values_list("status").annotate(n=Count("id")))
    done = by_status.get("completed", 0)
    no_show = by_status.get("no_show", 0)
    reviews = Review.objects.filter(doctor=d)
    earned = sum(LedgerEntry.objects.filter(doctor=d, kind="earning").values_list("amount", flat=True))
    audit.log(request, "admin_verification", kind="doctor_overview_viewed", id=str(d.id))
    return Response({
        "id": str(d.id), "full_name": d.full_name, "specialty": d.specialty.name if d.specialty_id else None,
        "specialty_id": str(d.specialty_id), "city": d.city, "address": d.address or None,
        "practice_phone": d.practice_phone or None, "order_number": d.order_number or None,
        "email": d.user.email if d.user_id else None, "phone": d.user.phone if d.user_id else None,
        "user_id": str(d.user_id) if d.user_id else None, "active": bool(d.user_id and d.user.is_active),
        "is_verified": d.is_verified, "created_at": iso(d.created_at), "plan": effective_plan(d),
        "consultation_price": d.consultation_price, "teleconsultation": d.teleconsultation,
        "credentials": [credential_dict(c) for c in Credential.objects.filter(doctor=d)],
        "missing": [dict(Credential.KINDS).get(k, k) for k in missing_required("doctor", d)],
        "stats": {
            "total": appts.count(), "last_90_days": recent.count(), "completed_90": done,
            "no_show_rate": round(100 * no_show / (done + no_show)) if done + no_show else None,
            "upcoming": appts.filter(scheduled_at__gte=timezone.now(), status__in=["pending", "confirmed"]).count(),
            "patients": appts.exclude(patient=None).values("patient").distinct().count(),
            "teleconsultations_90": recent.filter(mode="teleconsultation").count(),
        },
        "reviews": {"count": reviews.filter(status="published").count(),
                    "average": round(reviews.filter(status="published").aggregate(a=Avg("rating"))["a"] or 0, 1) or None,
                    "reported": reviews.filter(reported_at__isnull=False, moderated_at__isnull=True).count()},
        "finance": {
            "balance": balance(d), "earned_total": earned,
            "payouts": [{"amount": p.amount, "status": p.get_status_display(), "created_at": iso(p.created_at), "reference": p.reference}
                        for p in Payout.objects.filter(doctor=d)[:10]],
        },
        "clinics": [m.clinic.name for m in d.clinic_memberships.select_related("clinic")],
    })


# ── Annonces groupées ─────────────────────────────────────────────────


def _audience(audience: str, city: str):
    from clinics.models import Clinic, ClinicStaff
    from community.models import CommunityAgent
    from directory.models import Doctor
    from labs.models import LaboratoryMember
    from pharmacy.models import PharmacyMember

    users = User.objects.filter(is_active=True)
    c = city.strip()
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


@api_view(["GET", "POST"])
def announcements(request):
    """
    GET : annonces envoyées ; ?preview=1&audience=&city= : nombre de destinataires.
    POST {audience, city?, title, body, link?, sms?, email?} : envoi (notification toujours, SMS et email au choix).
    """
    from notifications.service import notify

    admin = require_admin(request)
    keys = {k for k, _ in Announcement.AUDIENCES}
    if request.method == "GET" and request.query_params.get("preview"):
        aud = request.query_params.get("audience", "")
        if aud not in keys:
            raise ApiError("Destinataires inconnus")
        return Response({"count": _audience(aud, request.query_params.get("city", "")).count()})
    if request.method == "POST":
        data = body(request)
        aud = get_choice(data, "audience", keys)
        city = get_str(data, "city", max_len=80) or ""
        a = Announcement(
            audience=aud, city=city, title=get_str(data, "title", required=True, min_len=3, max_len=120),
            body=get_str(data, "body", required=True, min_len=5, max_len=600), link=get_str(data, "link", max_len=200) or "",
            sms=bool(data.get("sms")), email=bool(data.get("email")), created_by=admin,
        )
        if a.sms and len(a.title) + len(a.body) > 300:
            raise ApiError("Pour un SMS, titre et message : 300 caractères au plus")
        if a.link and not a.link.startswith("/"):
            raise ApiError("Lien : une page de Fajma (/…)")
        recipients = list(_audience(aud, city)[:20000])
        if a.sms and len(recipients) > 5000:
            raise ApiError("Plus de 5 000 destinataires par SMS : ciblez une ville ou envoyez sans SMS")
        for u in recipients:
            notify(u, kind="announcement", title=a.title, body=a.body, link=a.link, sms=a.sms, email=a.email)
        a.recipients = len(recipients)
        a.save()
        audit.log(request, "admin_announcement", audience=aud, city=city, recipients=a.recipients, sms=a.sms)
    return Response([
        {"id": str(x.id), "audience": x.audience, "audience_label": x.get_audience_display(), "city": x.city or None,
         "title": x.title, "body": x.body, "sms": x.sms, "email": x.email, "recipients": x.recipients,
         "created_at": iso(x.created_at), "by": x.created_by.full_name if x.created_by_id else None}
        for x in Announcement.objects.select_related("created_by")[:50]
    ])


# ── Réglages ──────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
def platform_settings(request):
    """GET : réglages et leurs valeurs ; POST {key: value, …} : modification (journalisée)."""
    from .models import PlatformSetting

    admin = require_admin(request)
    if request.method == "POST":
        data = body(request)
        changed = []
        for key, value in data.items():
            clean = reg.validate(key, value)
            PlatformSetting.objects.update_or_create(key=key, defaults={"value": clean, "updated_by": admin})
            changed.append(key)
        reg.clear_cache()
        audit.log(request, "admin_settings", keys=changed)
    return Response([
        {"key": k, "label": spec["label"], "type": spec["type"], "value": reg.get_setting(k), "public": spec["public"]}
        for k, spec in reg.REGISTRY.items()
    ])


@api_view(["GET"])
def site_info(request):
    """Réglages publics (message en haut du site, contact, USSD) : sans connexion."""
    return Response({k: reg.get_setting(k) for k, spec in reg.REGISTRY.items() if spec["public"]})


# ── Équipe et rôles ───────────────────────────────────────────────────


@api_view(["GET", "POST"])
def staff(request):
    """
    GET : membres de l'équipe et leur rôle. POST {email, role} : donner l'accès à l'administration avec un rôle ;
    {email, remove: true} : retirer l'accès.
    """
    admin = require_admin(request)
    if request.method == "POST":
        data = body(request)
        email = (get_str(data, "email", required=True, max_len=254) or "").lower()
        target = User.objects.filter(email__iexact=email, is_active=True).first()
        if not target:
            raise not_found("Aucun compte avec cet email (la personne doit d'abord créer son compte)")
        if target.pk == admin.pk:
            raise ApiError("Vous ne pouvez pas modifier votre propre accès")
        if target.is_superuser and not admin.is_superuser:
            raise ApiError("Ce compte est protégé")
        if data.get("remove"):
            target.is_staff = False
            target.save(update_fields=["is_staff"])
            StaffRole.objects.filter(user=target).delete()
        else:
            role = get_choice(data, "role", {k for k, _ in StaffRole.ROLES})
            target.is_staff = True
            target.save(update_fields=["is_staff"])
            StaffRole.objects.update_or_create(user=target, defaults={"role": role})
            from notifications.service import notify

            notify(target, kind="staff", title="Accès à l'administration Fajma",
                   body=f"Rôle : {dict(StaffRole.ROLES)[role]}. La double authentification vous sera demandée.", link="/admin", email=True)
        audit.log(request, "admin_staff_changed", user=str(target.id), role=data.get("role"), removed=bool(data.get("remove")))
    rows = User.objects.filter(is_staff=True, is_active=True).select_related("staff_role").order_by("full_name")
    return Response([
        {"id": str(u.id), "full_name": u.full_name, "email": u.email, "role": role_of(u),
         "role_label": dict(StaffRole.ROLES).get(role_of(u)), "is_me": u.pk == admin.pk}
        for u in rows
    ])


@api_view(["GET"])
def my_admin_access(request):
    """Rubriques ouvertes à la personne connectée (l'interface n'affiche que celles-ci)."""
    user = require_admin(request)
    return Response({"role": role_of(user), "sections": sections_of(user)})


# ── Journal d'audit ───────────────────────────────────────────────────


def _actor_label(e: AuditEvent) -> str:
    if not e.actor:
        return "Système ou compte supprimé"
    return e.actor.full_name or e.actor.email or "Utilisateur"


@api_view(["GET"])
def audit_log(request):
    """?action=&who=&patient=&from=&to=&page=&export=csv : journal filtré, 100 par page."""
    require_admin(request)
    qs = AuditEvent.objects.select_related("actor", "patient").order_by("-created_at")
    p = request.query_params
    if action := p.get("action"):
        qs = qs.filter(action=action)
    if who := (p.get("who") or "").strip():
        qs = qs.filter(Q(actor__full_name__icontains=who) | Q(actor__email__icontains=who))
    if patient := (p.get("patient") or "").strip():
        qs = qs.filter(patient__full_name__icontains=patient)
    for key, lookup in (("from", "created_at__date__gte"), ("to", "created_at__date__lte")):
        if p.get(key):
            try:
                qs = qs.filter(**{lookup: datetime.fromisoformat(p[key]).date()})
            except ValueError as err:
                raise ApiError("Date invalide") from err
    rows = lambda items: [  # noqa: E731
        {"id": str(e.id), "action": e.action, "action_label": e.get_action_display(), "who": _actor_label(e),
         "patient": e.patient.full_name if e.patient else None, "target": f"{e.target_type} {e.target_id}".strip() or None,
         "ip": e.ip, "at": iso(e.created_at), "details": e.metadata or None}
        for e in items
    ]
    if p.get("export") == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Date", "Action", "Qui", "Patient concerné", "Cible", "Adresse IP"])
        for r in rows(qs[:20000]):
            w.writerow([r["at"], r["action_label"], r["who"], r["patient"] or "", r["target"] or "", r["ip"] or ""])
        audit.log(request, "data_export", kind="journal_audit")
        res = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
        res["Content-Disposition"] = 'attachment; filename="fajma-journal-audit.csv"'
        return res
    page = max(1, int(p.get("page", 1) or 1))
    total = qs.count()
    return Response({
        "total": total, "page": page, "pages": max(1, -(-total // 100)),
        "results": rows(qs[(page - 1) * 100: page * 100]),
        "actions": [{"value": k, "label": v} for k, v in AuditEvent.ACTIONS],
    })
