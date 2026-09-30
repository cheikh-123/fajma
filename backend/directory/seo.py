"""
Référencement : sitemap.xml, robots.txt, et pages médecin/spécialité en HTML simple pour les robots
(Google, aperçus de liens WhatsApp/Facebook) qui n'exécutent pas ou mal le JavaScript du site.
nginx n'envoie ici que les robots (détectés par leur User-Agent) ; les visiteurs reçoivent le site normal.
"""

import json

from django.conf import settings
from django.http import Http404, HttpResponse
from django.utils.html import escape
from django.views.decorators.cache import cache_page
from django.views.decorators.http import require_GET

from .models import Doctor, Specialty
from .serializers import photo_url

STATIC_PAGES = ["/", "/medecins", "/specialites", "/pharmacies", "/assistant", "/legal", "/cgu", "/confidentialite"]


def _url(path: str) -> str:
    return settings.PUBLIC_SITE_URL + path


@require_GET
def robots_txt(request):
    lines = [
        "User-agent: *",
        "Allow: /",
        # Espaces privés : inutiles (et interdits) dans les moteurs de recherche.
        *(f"Disallow: {p}" for p in ["/mon-espace", "/dossier", "/pro", "/admin", "/clinique", "/messages", "/api/", "/django-admin/"]),
        f"Sitemap: {_url('/sitemap.xml')}",
    ]
    return HttpResponse("\n".join(lines) + "\n", content_type="text/plain")


@require_GET
@cache_page(60 * 60)
def sitemap_xml(request):
    entries = [(_url(p), None) for p in STATIC_PAGES]
    entries += [(_url(f"/specialites/{s.slug}"), None) for s in Specialty.objects.filter(doctors__is_verified=True).distinct()]
    entries += [
        (_url(f"/medecins/{d.id}"), d.updated_at.date().isoformat())
        for d in Doctor.objects.filter(is_verified=True).only("id", "updated_at")
    ]
    body = "".join(
        f"<url><loc>{escape(loc)}</loc>{f'<lastmod>{mod}</lastmod>' if mod else ''}</url>" for loc, mod in entries
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'
    return HttpResponse(xml, content_type="application/xml")


def _json_ld(data: dict) -> str:
    # « </script> » ne doit jamais pouvoir fermer la balise : on échappe < > &.
    raw = json.dumps(data, ensure_ascii=False)
    return raw.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def _page(*, title: str, description: str, path: str, body: str, json_ld: dict | None = None, image: str = "") -> HttpResponse:
    url = _url(path)
    meta = [
        f'<meta name="description" content="{escape(description)}">',
        f'<link rel="canonical" href="{escape(url)}">',
        '<meta property="og:site_name" content="Fajma">',
        '<meta property="og:locale" content="fr_SN">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:title" content="{escape(title)}">',
        f'<meta property="og:description" content="{escape(description)}">',
        f'<meta property="og:url" content="{escape(url)}">',
        '<meta name="twitter:card" content="summary">',
    ]
    if image:
        meta.append(f'<meta property="og:image" content="{escape(image)}">')
    ld = f'<script type="application/ld+json">{_json_ld(json_ld)}</script>' if json_ld else ""
    html = (
        f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{escape(title)}</title>'
        f'{"".join(meta)}{ld}</head><body>{body}</body></html>'
    )
    return HttpResponse(html, content_type="text/html; charset=utf-8")


@require_GET
def doctor_page(request, doctor_id):
    d = Doctor.objects.filter(id=doctor_id, is_verified=True).select_related("specialty").first()
    if not d:
        raise Http404
    specialty = d.specialty.name if d.specialty else "Médecin"
    title = f"{d.full_name} — {specialty} à {d.city} | Prendre RDV sur Fajma"
    description = (
        f"Prenez rendez-vous en ligne avec {d.full_name}, {specialty.lower()} à {d.city}. "
        f"Consultation {d.consultation_price} {d.currency}"
        + (", téléconsultation possible" if d.teleconsultation else "")
        + ". Confirmation et rappel par SMS."
    )
    path = f"/medecins/{d.id}"
    ld = {
        "@context": "https://schema.org",
        "@type": "Physician",
        "name": d.full_name,
        "url": _url(path),
        "medicalSpecialty": specialty,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": d.address or None,
            "addressLocality": d.city,
            "addressCountry": "SN",
        },
        "priceRange": f"{d.consultation_price} {d.currency}",
        "availableService": {"@type": "MedicalProcedure", "name": "Téléconsultation"} if d.teleconsultation else None,
    }
    if d.latitude is not None and d.longitude is not None:
        ld["geo"] = {"@type": "GeoCoordinates", "latitude": d.latitude, "longitude": d.longitude}
    if d.reviews_count:
        ld["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": float(d.rating), "reviewCount": d.reviews_count}
    ld = {k: v for k, v in ld.items() if v is not None}
    body = (
        f"<h1>{escape(d.full_name)}</h1><p>{escape(specialty)} · {escape(d.city)}</p>"
        f"<p>{escape(', '.join(x for x in (d.address, d.city) if x))}</p>"
        f"<p>Consultation : {d.consultation_price} {escape(d.currency)}</p>"
        + (f"<p>{escape(d.bio)}</p>" if d.bio else "")
        + f'<p><a href="{escape(_url(path))}">Prendre rendez-vous en ligne</a></p>'
    )
    return _page(title=title, description=description, path=path, body=body, json_ld=ld, image=_absolute(photo_url(d)))


@require_GET
def specialty_page(request, slug):
    s = Specialty.objects.filter(slug=slug).first()
    if not s:
        raise Http404
    doctors = Doctor.objects.filter(specialty=s, is_verified=True).order_by("city", "full_name")[:100]
    cities = sorted({d.city for d in doctors})
    title = f"{s.name} au Sénégal — prendre RDV en ligne | Fajma"
    description = f"{len(doctors)} médecin(s) en {s.name.lower()} disponibles sur Fajma" + (f" à {', '.join(cities[:5])}" if cities else "") + "."
    items = "".join(f'<li><a href="{escape(_url(f"/medecins/{d.id}"))}">{escape(d.full_name)}</a> — {escape(d.city)}</li>' for d in doctors)
    ld = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": s.name,
        "itemListElement": [
            {"@type": "ListItem", "position": i, "url": _url(f"/medecins/{d.id}"), "name": d.full_name} for i, d in enumerate(doctors, 1)
        ],
    }
    return _page(title=title, description=description, path=f"/specialites/{s.slug}", body=f"<h1>{escape(s.name)}</h1><ul>{items}</ul>", json_ld=ld)


def _absolute(url: str | None) -> str | None:
    """Photo déposée sur Fajma (chemin relatif) : adresse complète pour les aperçus WhatsApp et Facebook."""
    if url and url.startswith("/"):
        return f"{settings.PUBLIC_SITE_URL}{url}"
    return url
