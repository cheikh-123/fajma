"""
Ordonnances transmises aux pharmacies.
- Patient : envoie une de ses ordonnances valides à une pharmacie, suit l'état, peut annuler tant que rien n'est préparé.
- Pharmacien : voit les ordonnances reçues par son officine (et seulement celles-là), fait avancer l'état.
- Administration : rattache un compte vérifié à une officine.
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.models import User
from accounts.views import require_admin
from audit import log as audit
from directory.models import Pharmacy
from medical.models import Prescription
from notifications.service import notify
from sunusante.api import ApiError, body, forbidden, get_choice, get_int, get_str, get_uuid, iso, not_found, require_user

from .models import OPEN_ORDER_STATUSES, PharmacyMember, PrescriptionOrder


def dispensed_count(prescription, exclude=None) -> int:
    """Nombre de fois où l'ordonnance a déjà été délivrée (retirée en pharmacie)."""
    qs = PrescriptionOrder.objects.filter(prescription=prescription, status="collected")
    return qs.exclude(id=exclude.id).count() if exclude else qs.count()


def max_dispensings(prescription) -> int:
    """Délivrance initiale + renouvellements autorisés."""
    return 1 + prescription.renewals


def order_dict(o: PrescriptionOrder, *, with_content: bool = False) -> dict:
    p = o.prescription
    data = {
        "id": str(o.id),
        "status": o.status,
        "status_label": o.get_status_display(),
        "patient_note": o.patient_note or None,
        "pharmacy_note": o.pharmacy_note or None,
        "total_price": o.total_price,
        "created_at": iso(o.created_at),
        "updated_at": iso(o.updated_at),
        "pharmacy": {"id": str(o.pharmacy_id), "name": o.pharmacy.name, "address": o.pharmacy.address, "city": o.pharmacy.city, "phone": o.pharmacy.phone or None},
        "prescription": {"id": str(p.id), "reference": p.reference, "doctor_name": p.doctor.full_name, "created_at": iso(p.created_at)},
    }
    if with_content:
        info = p.patient_info or {}
        subject = p.relative or o.patient
        data["prescription"].update(
            {
                "content": p.content,
                "items": p.items or [],
                "instructions": p.instructions or None,
                "valid_until": p.valid_until.isoformat() if p.valid_until else None,
                # Personne soignée (l'enfant pour une ordonnance pédiatrique), pas le titulaire du compte.
                "patient_name": info.get("name") or subject.full_name,
                "patient_birth_date": info.get("birth_date") or (subject.birth_date.isoformat() if subject.birth_date else None),
                "patient_sex": info.get("sex") or subject.sex or None,
                "patient_weight_kg": info.get("weight_kg"),
                "account_holder": o.patient.full_name if p.relative_id else None,
                "patient_phone": o.patient.phone or None,
                "doctor_order_number": (p.issuer or {}).get("order_number") or p.doctor.order_number or None,
                "replacing": (p.issuer or {}).get("replacing") or None,
                "renewals": p.renewals,
                # Délivrances déjà faites (hors cette demande) sur le maximum autorisé.
                "dispensed": dispensed_count(p, exclude=o),
                "max_dispensings": max_dispensings(p),
            }
        )
    return data


def _orders():
    return PrescriptionOrder.objects.select_related("pharmacy", "prescription__doctor", "prescription__relative", "patient")


# ── Patient ──────────────────────────────────────────────────────────


@api_view(["GET", "POST"])
def my_orders(request):
    user = require_user(request)
    if request.method == "GET":
        return Response([order_dict(o) for o in _orders().filter(patient=user)[:50]])

    data = body(request)
    prescription = Prescription.objects.filter(id=get_uuid(data, "prescription_id"), patient=user).select_related("doctor").first()
    if not prescription:
        raise not_found("Ordonnance introuvable")
    if prescription.valid_until and prescription.valid_until < timezone.localdate():
        raise ApiError("Cette ordonnance a expiré : demandez-en une nouvelle à votre médecin")
    if dispensed_count(prescription) >= max_dispensings(prescription):
        raise ApiError("Cette ordonnance a déjà été entièrement délivrée : demandez un renouvellement à votre médecin")
    pharmacy = Pharmacy.objects.filter(id=get_uuid(data, "pharmacy_id")).first()
    if not pharmacy:
        raise not_found("Pharmacie introuvable")
    if not pharmacy.members.exists() or not pharmacy.is_verified:
        raise ApiError("Cette pharmacie ne reçoit pas encore les ordonnances en ligne")
    try:
        with transaction.atomic():
            order = PrescriptionOrder.objects.create(
                prescription=prescription, patient=user, pharmacy=pharmacy, patient_note=get_str(data, "note", max_len=300) or ""
            )
    except IntegrityError as err:
        raise ApiError("Cette ordonnance est déjà en cours dans une pharmacie") from err
    for member in pharmacy.members.select_related("user"):
        notify(member.user, kind="pharmacy_order", title="Nouvelle ordonnance reçue", body=f"Réf. {prescription.reference}", link="/pharmacie")
    return Response(order_dict(_orders().get(id=order.id)))


@api_view(["POST"])
def cancel_my_order(request, order_id):
    user = require_user(request)
    with transaction.atomic():
        order = PrescriptionOrder.objects.select_for_update().filter(id=order_id, patient=user).first()
        if not order:
            raise not_found("Demande introuvable")
        if order.status != "sent":
            raise ApiError("La pharmacie a déjà commencé la préparation : contactez-la directement")
        order.status = "cancelled"
        order.save(update_fields=["status", "updated_at"])
    return Response({"ok": True})


@api_view(["GET"])
def receiving_pharmacies(request):
    """Pharmacies qui reçoivent les ordonnances en ligne (au moins un pharmacien inscrit)."""
    require_user(request)
    city = get_str(request.query_params, "city", max_len=80)
    qs = Pharmacy.objects.filter(members__isnull=False, is_verified=True).distinct()
    if city:
        qs = qs.filter(city__iexact=city)
    return Response(
        [
            {"id": str(p.id), "name": p.name, "city": p.city, "district": p.district or None, "address": p.address, "phone": p.phone or None, "is_on_duty": p.on_duty_now}
            for p in qs.order_by("city", "name")[:200]
        ]
    )


# ── Pharmacien ───────────────────────────────────────────────────────


def _my_pharmacy_ids(user) -> list:
    return list(PharmacyMember.objects.filter(user=user).values_list("pharmacy_id", flat=True))


@api_view(["GET"])
def dashboard(request):
    user = require_user(request)
    ids = _my_pharmacy_ids(user)
    if not ids:
        raise forbidden("Compte non rattaché à une pharmacie")
    orders = list(_orders().filter(pharmacy_id__in=ids).order_by("-created_at")[:200])
    # Première lecture du contenu par la pharmacie : tracée dans le journal visible par le patient.
    for o in orders:
        if o.status in OPEN_ORDER_STATUSES and not o.viewed_at:
            audit.log(request, "prescription_viewed", patient=o.patient, target=o.prescription, via="pharmacy", pharmacy=o.pharmacy.name)
            o.viewed_at = timezone.now()
            PrescriptionOrder.objects.filter(id=o.id).update(viewed_at=o.viewed_at)
    return Response(
        {
            "pharmacies": [{"id": str(p.id), "name": p.name, "city": p.city} for p in Pharmacy.objects.filter(id__in=ids)],
            "orders": [order_dict(o, with_content=o.status in OPEN_ORDER_STATUSES) for o in orders],
            "medicine_questions": pending_medicine_questions(ids),
        }
    )


@api_view(["POST"])
def update_order(request, order_id):
    user = require_user(request)
    data = body(request)
    new_status = get_choice(data, "status", {"preparing", "ready", "unavailable", "collected"})
    with transaction.atomic():
        order = PrescriptionOrder.objects.select_for_update().filter(id=order_id, pharmacy_id__in=_my_pharmacy_ids(user)).first()
        if not order:
            raise not_found("Demande introuvable")
        if new_status not in PrescriptionOrder.TRANSITIONS.get(order.status, set()):
            raise ApiError(f"Passage impossible de « {order.get_status_display()} » à cet état")
        if new_status == "collected" and dispensed_count(order.prescription, exclude=order) >= max_dispensings(order.prescription):
            raise ApiError("Ordonnance déjà entièrement délivrée (renouvellements épuisés) : ne pas délivrer")
        note = get_str(data, "note", max_len=300)
        if new_status == "unavailable" and not note:
            raise ApiError("Indiquez au patient ce qui manque ou quoi faire")
        order.status = new_status
        order.handled_by = user
        if note is not None:
            order.pharmacy_note = note
        price = get_int(data, "total_price", min_value=0, max_value=10_000_000)
        if price is not None:
            order.total_price = price
        order.save()
    order = _orders().get(id=order.id)
    if new_status in {"ready", "unavailable"}:
        ready = new_status == "ready"
        notify(
            order.patient,
            kind="pharmacy_order",
            title=f"Ordonnance {'prête' if ready else 'non disponible'} — {order.pharmacy.name}",
            body=(f"Vos médicaments sont prêts{f' ({order.total_price} F)' if order.total_price else ''}." if ready else order.pharmacy_note),
            link="/dossier",
            sms=True,
        )
    return Response(order_dict(order, with_content=order.status in OPEN_ORDER_STATUSES))


# ── « Avez-vous ce médicament ? » ────────────────────────────────────

QUERY_TTL = timedelta(hours=24)
MAX_QUERIES_PER_DAY = 5
MAX_PHARMACIES_PER_QUERY = 5


def medicine_query_dict(q) -> dict:
    return {
        "id": str(q.id),
        "medicine": q.medicine,
        "note": q.note or None,
        "created_at": iso(q.created_at),
        "expires_at": iso(q.expires_at),
        "expired": q.expires_at <= timezone.now(),
        "answers": [
            {
                "id": str(a.id),
                "status": a.status,
                "price": a.price,
                "note": a.note or None,
                "answered_at": iso(a.answered_at),
                "pharmacy": {"id": str(a.pharmacy_id), "name": a.pharmacy.name, "city": a.pharmacy.city,
                             "address": a.pharmacy.address, "phone": a.pharmacy.phone or None,
                             "latitude": a.pharmacy.latitude, "longitude": a.pharmacy.longitude},
            }
            for a in q.answers.all()
        ],
    }


@api_view(["GET", "POST"])
def my_medicine_queries(request):
    """POST {medicine, note?, pharmacy_ids[1..5]} : demande envoyée aux pharmacies choisies (partenaires)."""
    from .models import MedicineAnswer, MedicineQuery

    user = require_user(request)
    if request.method == "POST":
        data = body(request)
        if MedicineQuery.objects.filter(patient=user, created_at__gte=timezone.now() - timedelta(days=1)).count() >= MAX_QUERIES_PER_DAY:
            raise ApiError("Vous avez déjà envoyé 5 demandes aujourd'hui")
        ids = data.get("pharmacy_ids")
        if not isinstance(ids, list) or not 1 <= len(ids) <= MAX_PHARMACIES_PER_QUERY:
            raise ApiError(f"Choisissez de 1 à {MAX_PHARMACIES_PER_QUERY} pharmacies")
        pharmacies = list(Pharmacy.objects.filter(id__in=ids, members__isnull=False, is_verified=True).distinct())
        if not pharmacies:
            raise ApiError("Ces pharmacies ne reçoivent pas encore de demandes en ligne")
        query = MedicineQuery.objects.create(
            patient=user,
            medicine=get_str(data, "medicine", required=True, min_len=2, max_len=160),
            note=get_str(data, "note", max_len=200) or "",
            expires_at=timezone.now() + QUERY_TTL,
        )
        for p in pharmacies:
            MedicineAnswer.objects.create(query=query, pharmacy=p)
            for m in p.members.select_related("user"):
                notify(m.user, kind="medicine_query", title="Un patient cherche un médicament", body=query.medicine, link="/pharmacie")
        return Response(medicine_query_dict(query))
    since = timezone.now() - timedelta(days=30)
    qs = MedicineQuery.objects.filter(patient=user, created_at__gte=since).prefetch_related("answers__pharmacy")
    return Response([medicine_query_dict(q) for q in qs[:50]])


def pending_medicine_questions(pharmacy_ids) -> list[dict]:
    """Questions encore ouvertes pour ces officines (tableau de bord du pharmacien) : sans identité du patient."""
    from .models import MedicineAnswer

    qs = MedicineAnswer.objects.filter(pharmacy_id__in=pharmacy_ids, query__expires_at__gt=timezone.now()).select_related("query", "pharmacy")
    return [
        {"id": str(a.id), "status": a.status, "medicine": a.query.medicine, "note": a.query.note or None,
         "pharmacy": a.pharmacy.name, "created_at": iso(a.query.created_at), "expires_at": iso(a.query.expires_at),
         "price": a.price}
        for a in qs.order_by("status", "-query__created_at")[:100]
    ]


@api_view(["POST"])
def answer_medicine_query(request, answer_id):
    """{status: available|unavailable, price?, note?} : réponse de la pharmacie ; le patient est prévenu."""
    from .models import MedicineAnswer

    user = require_user(request)
    a = MedicineAnswer.objects.filter(id=answer_id, pharmacy_id__in=_my_pharmacy_ids(user)).select_related("query__patient", "pharmacy").first()
    if not a:
        raise not_found("Demande introuvable")
    if a.query.expires_at <= timezone.now():
        raise ApiError("Cette demande a expiré")
    data = body(request)
    a.status = get_choice(data, "status", {"available", "unavailable"})
    a.price = get_int(data, "price", min_value=0, max_value=10_000_000) if a.status == "available" else None
    a.note = get_str(data, "note", max_len=200) or ""
    a.answered_at = timezone.now()
    a.save()
    if a.status == "available":
        notify(a.query.patient, kind="medicine_answer", title=f"{a.query.medicine} : disponible",
               body=f"{a.pharmacy.name}{f' — {a.price:,} F'.replace(',', ' ') if a.price else ''}", link="/pharmacies#disponibilite", sms=True)
    else:
        notify(a.query.patient, kind="medicine_answer", title=f"{a.query.medicine} : indisponible", body=a.pharmacy.name, link="/pharmacies#disponibilite")
    return Response({"ok": True})


# ── Informations de l'officine (pharmacien et administration) ────────


def _time(data: dict, key: str):
    from datetime import time

    value = data.get(key)
    try:
        h, m = str(value).split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, TypeError) as err:
        raise ApiError("Horaire invalide (format HH:MM)") from err


def _apply_pharmacy_fields(p: Pharmacy, data: dict) -> None:
    """Coordonnées, horaires, jours d'ouverture et garde : champs modifiables par le pharmacien."""
    if "phone" in data:
        p.phone = get_str(data, "phone", max_len=30) or ""
    if "address" in data:
        p.address = get_str(data, "address", required=True, min_len=3, max_len=200)
    if "district" in data:
        p.district = get_str(data, "district", max_len=80) or ""
    if "opens_at" in data or "closes_at" in data:
        opens = _time(data, "opens_at") if "opens_at" in data else p.opens_at
        closes = _time(data, "closes_at") if "closes_at" in data else p.closes_at
        if closes <= opens:
            raise ApiError("L'heure de fermeture doit être après l'heure d'ouverture (00:00 – 23:59 pour une officine ouverte 24 h/24)")
        p.opens_at, p.closes_at = opens, closes
    if "open_days" in data:
        days = data.get("open_days")
        if not isinstance(days, list) or not days or any(not isinstance(d, int) or not 0 <= d <= 6 for d in days):
            raise ApiError("Choisissez au moins un jour d'ouverture")
        p.open_days = sorted(set(days))
    if "is_on_duty" in data:
        p.is_on_duty = bool(data.get("is_on_duty"))
        p.on_duty_until = None
        if p.is_on_duty and data.get("on_duty_until"):
            from appointments.scheduling import parse_datetime

            until = parse_datetime(data.get("on_duty_until"))
            if until <= timezone.now():
                raise ApiError("La fin de la garde doit être dans le futur")
            if until > timezone.now() + timedelta(days=31):
                raise ApiError("Garde trop longue (un mois au plus)")
            p.on_duty_until = until


def pharmacy_edit_dict(p: Pharmacy) -> dict:
    from directory.serializers import pharmacy_dict

    return {**pharmacy_dict(p), "is_on_duty_setting": p.is_on_duty, "members": p.members.count()}


@api_view(["GET", "POST"])
def my_pharmacies(request):
    """GET : mes officines. POST {pharmacy_id, …} : mise à jour (horaires, garde, téléphone, adresse)."""
    user = require_user(request)
    ids = _my_pharmacy_ids(user)
    if not ids:
        raise forbidden("Compte non rattaché à une pharmacie")
    if request.method == "POST":
        data = body(request)
        pharmacy = Pharmacy.objects.filter(id=get_uuid(data, "pharmacy_id"), id__in=ids).first()
        if not pharmacy:
            raise not_found("Pharmacie introuvable")
        _apply_pharmacy_fields(pharmacy, data)
        pharmacy.save()
        audit.log(request, "pharmacy_updated", pharmacy=str(pharmacy.id), on_duty=pharmacy.on_duty_now)
    return Response([pharmacy_edit_dict(p) for p in Pharmacy.objects.filter(id__in=ids)])


def _locate(p: Pharmacy, data: dict) -> None:
    """Position : saisie, sinon celle du quartier ou de la ville (localités du Sénégal)."""
    from directory import localities

    lat, lng = data.get("latitude"), data.get("longitude")
    if lat not in (None, "") and lng not in (None, ""):
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError) as err:
            raise ApiError("Coordonnées invalides") from err
        if not (12 <= lat <= 17 and -18 <= lng <= -11):
            raise ApiError("Ces coordonnées ne sont pas au Sénégal")
        p.latitude, p.longitude = lat, lng
        return
    if p.latitude is not None and p.longitude is not None and not data.get("relocate"):
        return
    found = localities.find(p.district) if p.district else None
    found = found or localities.find(p.city)
    if not found:
        raise ApiError("Ville ou quartier inconnu : indiquez les coordonnées GPS de l'officine")
    p.latitude, p.longitude = found.latitude, found.longitude


@api_view(["GET", "POST"])
def admin_pharmacies(request):
    """GET : toutes les officines. POST : ajout d'une officine (nom, ville, adresse…)."""
    require_admin(request)
    if request.method == "POST":
        data = body(request)
        p = Pharmacy(
            name=get_str(data, "name", required=True, min_len=2, max_len=120),
            city=get_str(data, "city", required=True, min_len=2, max_len=80),
        )
        if not data.get("address"):
            raise ApiError("Indiquez l'adresse de l'officine")
        if Pharmacy.objects.filter(name__iexact=p.name, city__iexact=p.city).exists():
            raise ApiError("Cette pharmacie existe déjà dans cette ville")
        p.latitude = p.longitude = None
        data = {"open_days": [1, 2, 3, 4, 5, 6], **data}
        _apply_pharmacy_fields(p, data)
        _locate(p, data)
        p.save()
        p.refresh_from_db()  # horaires par défaut relus comme des heures (et non du texte)
        audit.log(request, "admin_pharmacy_created", pharmacy=str(p.id))
        return Response(pharmacy_edit_dict(p))
    q = (request.query_params.get("q") or "").strip()
    qs = Pharmacy.objects.all()
    if q:
        from django.db.models import Q

        qs = qs.filter(Q(name__icontains=q) | Q(city__icontains=q) | Q(district__icontains=q))
    return Response([pharmacy_edit_dict(p) for p in qs.order_by("city", "name")[:300]])


@api_view(["POST"])
def admin_update_pharmacy(request, pharmacy_id):
    """Correction d'une officine par l'administration (nom et ville compris)."""
    require_admin(request)
    p = Pharmacy.objects.filter(id=pharmacy_id).first()
    if not p:
        raise not_found("Pharmacie introuvable")
    data = body(request)
    if "name" in data:
        p.name = get_str(data, "name", required=True, min_len=2, max_len=120)
    if "city" in data:
        p.city = get_str(data, "city", required=True, min_len=2, max_len=80)
    _apply_pharmacy_fields(p, data)
    _locate(p, data)
    p.save()
    audit.log(request, "admin_pharmacy_updated", pharmacy=str(p.id))
    return Response(pharmacy_edit_dict(p))


# ── Administration ───────────────────────────────────────────────────


@api_view(["GET", "POST"])
def admin_members(request):
    require_admin(request)
    if request.method == "POST":
        data = body(request)
        pharmacy = Pharmacy.objects.filter(id=get_uuid(data, "pharmacy_id")).first()
        email = (get_str(data, "email", required=True, max_len=254) or "").lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not pharmacy or not user:
            raise not_found("Pharmacie ou compte introuvable (le pharmacien doit d'abord créer son compte)")
        _, created = PharmacyMember.objects.get_or_create(pharmacy=pharmacy, user=user)
        audit.log(request, "admin_verification", kind="pharmacy_member", pharmacy=str(pharmacy.id), user=str(user.id))
        if created:
            notify(user, kind="verification", title="Compte pharmacie activé",
                   body=f"Votre compte est rattaché à {pharmacy.name}. Vous recevez maintenant les ordonnances des patients.",
                   link="/pharmacie", email=True)
    return Response(
        [
            {"id": str(m.id), "pharmacy": m.pharmacy.name, "city": m.pharmacy.city, "user": m.user.full_name, "email": m.user.email}
            for m in PharmacyMember.objects.select_related("pharmacy", "user").order_by("pharmacy__name")
        ]
    )


@api_view(["POST"])
def admin_remove_member(request, member_id):
    require_admin(request)
    deleted, _ = PharmacyMember.objects.filter(id=member_id).delete()
    if not deleted:
        raise not_found("Rattachement introuvable")
    return Response({"ok": True})
