"""API des partenaires et campagnes sponsorisées (règles : partners/models.py)."""

from __future__ import annotations

import csv
import io
import random
import re
from datetime import date

from django.db.models import F, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from accounts.views import require_admin
from audit import log as audit
from sunusante.api import ApiError, ScopedThrottle, body, get_choice, get_str, get_uuid, iso, not_found
from sunusante.uploads import decode_upload, serve, store

from .models import Campaign, CampaignStat, Partner

# Mots qui trahissent une publicité interdite (médicament sur ordonnance, promesse de guérison…) : refus.
FORBIDDEN = ["ordonnance", "antibiotique", "guerit", "guérit", "guérison garantie", "miracle", "sans effet secondaire",
             "remède", "remede", "cure", "100 %", "100%"]


class AdThrottle(ScopedThrottle):
    scope = "suggest"


def _logo_url(obj_id, has_logo: bool) -> str | None:
    return f"/api/partners/{obj_id}/logo" if has_logo else None


def partner_dict(p: Partner) -> dict:
    return {"id": str(p.id), "name": p.name, "kind": p.kind, "kind_label": p.get_kind_display(), "description": p.description or None,
            "website": p.website or None, "logo_url": _logo_url(p.id, bool(p.logo_path)), "is_public": p.is_public}


def campaign_public(c: Campaign) -> dict:
    return {"id": str(c.id), "title": c.title, "body": c.body, "cta_label": c.cta_label, "category": c.category,
            "theme": c.theme, "image_url": f"/api/campaigns/{c.id}/image" if c.image_path else None,
            "partner": {"name": c.partner.name, "logo_url": _logo_url(c.partner_id, bool(c.partner.logo_path))}}


# ── Public ────────────────────────────────────────────────────────────


@api_view(["GET"])
def public_partners(request):
    return Response([partner_dict(p) for p in Partner.objects.filter(is_public=True)])


@api_view(["GET"])
def partner_logo(request, partner_id):
    p = Partner.objects.filter(id=partner_id).exclude(logo_path="").first()
    if not p:
        raise not_found("Logo introuvable")
    return serve(p.logo_path, p.logo_mime)


def _bump(campaign_id, placement: str, field: str) -> None:
    stat, _ = CampaignStat.objects.get_or_create(campaign_id=campaign_id, day=timezone.localdate(), placement=placement)
    CampaignStat.objects.filter(pk=stat.pk).update(**{field: F(field) + 1})


@api_view(["GET"])
def campaign_image(request, campaign_id):
    c = Campaign.objects.filter(id=campaign_id).exclude(image_path="").first()
    if not c:
        raise not_found("Image introuvable")
    return serve(c.image_path, c.image_mime)


@api_view(["GET"])
@throttle_classes([AdThrottle])
def campaign_for(request):
    """
    ?placement=home|search|patient&city=&lang= : une campagne validée et en cours, choisie au hasard ;
    &all=1 : toutes les campagnes éligibles (carrousel de l'accueil, 5 au plus, ordre aléatoire).
    """
    placement = request.query_params.get("placement", "")
    if placement not in {k for k, _ in Campaign.PLACEMENTS}:
        return Response(None)
    city = (request.query_params.get("city") or "").strip().lower()
    lang = (request.query_params.get("lang") or "").strip().lower()
    today = timezone.localdate()
    eligible = []
    for c in Campaign.objects.filter(status="approved", starts_on__lte=today, ends_on__gte=today).select_related("partner"):
        if placement not in c.placements:
            continue
        if c.cities and city and city not in [x.lower() for x in c.cities]:
            continue
        if c.cities and not city:
            continue
        if c.languages and lang and lang not in c.languages:
            continue
        eligible.append(c)
    if request.query_params.get("all"):
        random.shuffle(eligible)
        eligible = eligible[:5]
        for c in eligible:
            _bump(c.id, placement, "impressions")
        return Response([{**campaign_public(c), "placement": placement} for c in eligible])
    if not eligible:
        return Response(None)
    chosen = random.choice(eligible)
    _bump(chosen.id, placement, "impressions")
    return Response({**campaign_public(chosen), "placement": placement})


@api_view(["POST"])
@throttle_classes([AdThrottle])
def campaign_click(request, campaign_id):
    c = Campaign.objects.filter(id=campaign_id, status="approved").first()
    if not c:
        raise not_found("Campagne introuvable")
    placement = get_choice(body(request), "placement", {k for k, _ in Campaign.PLACEMENTS}, default="home")
    _bump(c.id, placement, "clicks")
    return Response({"url": c.cta_url})


# ── Administration ────────────────────────────────────────────────────


def _check_text(*texts: str) -> None:
    joined = " ".join(texts).lower()
    hit = next((w for w in FORBIDDEN if w in joined), None)
    if hit:
        raise ApiError(f"Texte non conforme à la charte (« {hit} ») : pas de médicament sur ordonnance ni de promesse de guérison")


def _url(raw: str) -> str:
    if not (raw.startswith("https://") or re.fullmatch(r"/[\w\-/?=&.%]*", raw)):
        raise ApiError("Lien : adresse https:// ou page de Fajma (/…)")
    return raw


def campaign_admin(c: Campaign) -> dict:
    totals = c.stats.aggregate(i=Sum("impressions"), k=Sum("clicks"))
    imp, clk = totals["i"] or 0, totals["k"] or 0
    return {**campaign_public(c), "partner_id": str(c.partner_id), "cta_url": c.cta_url, "category_label": c.get_category_display(),
            "placements": c.placements, "cities": c.cities, "languages": c.languages, "starts_on": c.starts_on.isoformat(),
            "ends_on": c.ends_on.isoformat(), "status": c.status, "status_label": c.get_status_display(),
            "charter_checked": c.charter_checked, "approved_at": iso(c.approved_at),
            "impressions": imp, "clicks": clk, "ctr": round(100 * clk / imp, 1) if imp else None}


@api_view(["GET", "POST"])
def admin_partners(request):
    """POST {id?, name, kind, description?, website?, is_public?, logo?: {file_name, content_base64}}."""
    require_admin(request)
    if request.method == "POST":
        data = body(request)
        p = Partner.objects.filter(id=get_uuid(data, "id", required=False)).first() if data.get("id") else Partner()
        if data.get("id") and not p:
            raise not_found("Partenaire introuvable")
        p.name = get_str(data, "name", required=True, min_len=2, max_len=120)
        p.kind = get_choice(data, "kind", {k for k, _ in Partner.KINDS})
        p.description = get_str(data, "description", max_len=400) or ""
        website = get_str(data, "website", max_len=200) or ""
        p.website = _url(website) if website else ""
        p.is_public = bool(data.get("is_public", True))
        if isinstance(data.get("logo"), dict):
            content, mime, name = decode_upload(data["logo"])
            if not mime.startswith("image/"):
                raise ApiError("Le logo doit être une image")
            p.logo_path, p.logo_mime = store("partners", name, content), mime
        p.save()
        audit.log(request, "admin_partner_saved", partner=str(p.id))
    return Response([partner_dict(p) for p in Partner.objects.all()])


@api_view(["GET", "POST"])
def admin_campaigns(request):
    """POST {id?, partner_id, title, body, cta_label?, cta_url, category, placements[], cities[], languages[], starts_on, ends_on}."""
    require_admin(request)
    if request.method == "POST":
        data = body(request)
        c = Campaign.objects.filter(id=get_uuid(data, "id", required=False)).first() if data.get("id") else Campaign()
        if data.get("id") and not c:
            raise not_found("Campagne introuvable")
        partner = Partner.objects.filter(id=get_uuid(data, "partner_id")).first()
        if not partner:
            raise not_found("Partenaire introuvable")
        c.partner = partner
        c.title = get_str(data, "title", required=True, min_len=3, max_len=80)
        c.body = get_str(data, "body", required=True, min_len=10, max_len=200)
        c.cta_label = get_str(data, "cta_label", max_len=30) or "En savoir plus"
        c.cta_url = _url(get_str(data, "cta_url", required=True, max_len=300) or "")
        c.category = get_choice(data, "category", {k for k, _ in Campaign.CATEGORIES})
        c.theme = get_choice(data, "theme", {k for k, _ in Campaign.THEMES}, default=c.theme or "vert")
        if isinstance(data.get("image"), dict):
            content, mime, name = decode_upload(data["image"])
            if not mime.startswith("image/"):
                raise ApiError("Le visuel doit être une image (JPEG, PNG ou WebP)")
            c.image_path, c.image_mime = store("campaigns", name, content), mime
        _check_text(c.title, c.body, c.cta_label)
        placements = [x for x in (data.get("placements") or []) if x in {k for k, _ in Campaign.PLACEMENTS}]
        if not placements:
            raise ApiError("Choisissez au moins un emplacement")
        c.placements = placements
        c.cities = [str(x)[:80] for x in (data.get("cities") or [])][:30]
        c.languages = [x for x in (data.get("languages") or []) if x in ("fr", "wo", "en")]
        try:
            c.starts_on, c.ends_on = date.fromisoformat(data["starts_on"]), date.fromisoformat(data["ends_on"])
        except (KeyError, TypeError, ValueError) as err:
            raise ApiError("Dates de début et de fin invalides") from err
        if c.ends_on < c.starts_on:
            raise ApiError("La fin doit suivre le début")
        if c.pk and c.status == "approved":
            c.status = "draft"  # modifiée : à revalider
        c.save()
        audit.log(request, "admin_campaign_saved", campaign=str(c.id))
    return Response([campaign_admin(c) for c in Campaign.objects.select_related("partner")[:200]])


@api_view(["POST"])
def admin_campaign_status(request, campaign_id):
    """{status: approved | paused | draft, charter_checked}: validation après contrôle de la charte."""
    admin = require_admin(request)
    c = Campaign.objects.filter(id=campaign_id).first()
    if not c:
        raise not_found("Campagne introuvable")
    data = body(request)
    status = get_choice(data, "status", {"approved", "paused", "draft"})
    if status == "approved":
        if not data.get("charter_checked"):
            raise ApiError("Cochez la vérification de la charte publicitaire avant de valider")
        c.charter_checked, c.approved_by, c.approved_at = True, admin, timezone.now()
    c.status = status
    c.save()
    audit.log(request, "admin_campaign_saved", campaign=str(c.id), status=status)
    return Response(campaign_admin(c))


@api_view(["GET"])
def admin_campaign_report(request, campaign_id):
    """Rapport pour l'annonceur (tableur) : affichages et clics par jour et emplacement, rien de personnel."""
    require_admin(request)
    c = Campaign.objects.filter(id=campaign_id).select_related("partner").first()
    if not c:
        raise not_found("Campagne introuvable")
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Campagne", "Partenaire", "Jour", "Emplacement", "Affichages", "Clics"])
    labels = dict(Campaign.PLACEMENTS)
    for s in c.stats.order_by("day", "placement"):
        w.writerow([c.title, c.partner.name, s.day.isoformat(), labels.get(s.placement, s.placement), s.impressions, s.clicks])
    res = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
    res["Content-Disposition"] = f'attachment; filename="fajma-campagne-{c.id}.csv"'
    return res
