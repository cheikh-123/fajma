"""Mise en forme JSON des objets de l'annuaire (mêmes formats que ceux attendus par le frontend)."""

from .models import ConsultationType, Doctor, Specialty


def specialty_dict(s: Specialty | None, *, full: bool = False) -> dict | None:
    if s is None:
        return None
    data = {"id": str(s.id), "slug": s.slug, "name": s.name, "icon": s.icon}
    if full:
        data["description"] = s.description
    return data


def consultation_type_dict(t: ConsultationType) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "duration_minutes": t.duration_minutes,
        "price": t.price,
        "mode": t.mode,
        "is_active": t.is_active,
        "position": t.position,
        "series_max": t.series_max,
    }


def doctor_dict(d: Doctor, *, full_specialty: bool = False) -> dict:
    return {
        "id": str(d.id),
        "full_name": d.full_name,
        "city": d.city,
        "address": d.address or None,
        "bio": d.bio or None,
        "years_experience": d.years_experience,
        "consultation_price": d.consultation_price,
        "currency": d.currency,
        "teleconsultation": d.teleconsultation,
        "home_visits": d.home_visits,
        "home_visit_fee": d.home_visit_fee,
        "home_visit_area": d.home_visit_area or None,
        "languages": d.languages or [],
        "rating": float(d.rating),
        "reviews_count": d.reviews_count,
        "avatar_url": photo_url(d),
        "specialty": specialty_dict(d.specialty, full=full_specialty),
        "latitude": d.latitude,
        "longitude": d.longitude,
    }


def photo_url(d: Doctor) -> str | None:
    """Photo déposée par le médecin (servie par Fajma, version dans l'URL pour le cache), sinon lien externe."""
    if d.photo_path:
        return f"/api/directory/doctors/{d.id}/photo?v={int(d.updated_at.timestamp())}"
    return d.avatar_url or None


def pharmacy_dict(p) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "city": p.city,
        "district": p.district or None,
        "address": p.address,
        "phone": p.phone or None,
        "is_on_duty": p.on_duty_now,
        "on_duty_until": p.on_duty_until.isoformat() if p.on_duty_now and p.on_duty_until else None,
        "opens_at": p.opens_at.strftime("%H:%M:%S"),
        "closes_at": p.closes_at.strftime("%H:%M:%S"),
        "open_days": p.open_days if p.open_days else [1, 2, 3, 4, 5, 6],
        "latitude": p.latitude,
        "longitude": p.longitude,
    }


def location_dict(loc) -> dict:
    return {
        "id": str(loc.id),
        "name": loc.name,
        "address": loc.address,
        "city": loc.city,
        "phone": loc.phone or None,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
    }
