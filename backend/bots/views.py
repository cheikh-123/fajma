"""
Points d'entrée des robots :
- WhatsApp : webhook Twilio (message entrant → réponse TwiML), signature Twilio vérifiée ;
- USSD : protocole des agrégateurs (Africa's Talking, Orange…) — réponse « CON … » ou « END … »,
  authentifié par un secret partagé ; le numéro est fourni par l'opérateur.
"""

import base64
import hashlib
import hmac
import logging
from datetime import timedelta
from xml.sax.saxutils import escape

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from notifications.sms import normalize_phone

from .engine import HOME, handle
from .models import BotSession

logger = logging.getLogger(__name__)

WHATSAPP_SESSION_TTL = timedelta(minutes=30)
RESET_WORDS = {"menu", "bonjour", "salut", "hello", "start", "salam", "nanga def", HOME}
MAX_INPUTS = 30


def twilio_signature_ok(request) -> bool:
    """Signature X-Twilio-Signature : HMAC-SHA1 (jeton du compte) de l'URL publique + paramètres triés."""
    token = settings.TWILIO["AUTH_TOKEN"]
    if not token:
        return settings.DEBUG  # en local, sans compte Twilio, on accepte pour pouvoir tester
    url = settings.PUBLIC_SITE_URL + request.get_full_path()
    payload = url + "".join(k + v for k in sorted(request.POST) for v in request.POST.getlist(k))
    expected = base64.b64encode(hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(expected, request.headers.get("X-Twilio-Signature", ""))


def _twiml(text: str) -> HttpResponse:
    return HttpResponse(
        f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{escape(text)}</Message></Response>',
        content_type="application/xml",
    )


# Intention comprise → réponse du menu à rejouer (1 RDV, 2 mes RDV, 3 annuler, 4 pharmacies).
INTENT_INPUTS = {"book": ["1"], "mine": ["2"], "cancel": ["3"], "pharma": ["4"]}



def _guess(text: str) -> dict:
    """Intention, spécialité (si des médecins la proposent), ville et langue d'un message libre."""
    from directory.models import Doctor, Specialty

    from .understand import understand

    doctors = Doctor.objects.filter(is_verified=True, availability__isnull=False)
    cities = list(doctors.values_list("city", flat=True).distinct())
    found = understand(text, cities)
    if found.get("specialty"):
        spec = Specialty.objects.filter(slug=found["specialty"], doctors__in=doctors).distinct().first()
        if spec and found.get("intent") == "book":
            found["spec"] = str(spec.id)
    return found


@csrf_exempt
@require_POST
def whatsapp(request):
    if not twilio_signature_ok(request):
        return HttpResponse(status=403)
    phone = normalize_phone(request.POST.get("From", "").removeprefix("whatsapp:"))
    text = (request.POST.get("Body") or "").strip()[:200]
    if not phone:
        return HttpResponse(status=400)
    sid = (request.POST.get("MessageSid") or "")[:64]
    from notifications.optout import STOP_REPLY, is_start, is_stop, opt_in, opt_out

    if is_stop(text):
        opt_out(phone, "whatsapp")
        return _twiml(STOP_REPLY)
    if is_start(text):
        opt_in(phone)  # puis le menu s'affiche comme d'habitude
    with transaction.atomic():
        session, _ = BotSession.objects.select_for_update().get_or_create(channel="whatsapp", key=phone, defaults={"phone": phone})
        # Twilio renvoie le même message s'il n'a pas eu de réponse à temps : on redonne la même réponse.
        if sid and session.memo.get("_sid") == sid:
            return _twiml(session.memo.get("_reply", ""))
        expired = timezone.now() - session.updated_at > WHATSAPP_SESSION_TTL
        guess = _guess(text) if text and not text.isdigit() and (expired or not session.inputs) else {}
        if guess.get("intent") in INTENT_INPUTS:
            # Demande en phrase libre : le menu reprend directement à la bonne étape.
            session.inputs, session.memo = list(INTENT_INPUTS[guess["intent"]]), {}
            for key in ("spec", "city", "lang"):
                if guess.get(key):
                    session.memo[f"_{key}"] = guess[key]
        elif expired or text.lower() in RESET_WORDS or len(session.inputs) >= MAX_INPUTS:
            session.inputs, session.memo = [], {}
        elif text:
            session.inputs = [*session.inputs, text]
        reply = handle(phone, session.inputs, session.memo)
        if reply.end:
            session.inputs, session.memo = [], {}
            text_out = reply.text + "\n\nÉcrivez « menu » pour recommencer."
        else:
            text_out = reply.text
        if sid:
            session.memo = {**session.memo, "_sid": sid, "_reply": text_out}
        session.save()
    return _twiml(text_out)


@csrf_exempt
@require_POST
def ussd(request):
    secret = settings.USSD_SECRET
    given = request.headers.get("X-Ussd-Secret") or request.GET.get("secret", "")
    if not secret or not hmac.compare_digest(secret, given):
        return HttpResponse(status=403)
    session_id = (request.POST.get("sessionId") or "")[:100]
    phone = normalize_phone(request.POST.get("phoneNumber"))
    if not session_id or not phone:
        return HttpResponse("END Requête invalide", content_type="text/plain")
    text = request.POST.get("text") or ""
    inputs = [part for part in text.split("*")][:MAX_INPUTS] if text else []
    with transaction.atomic():
        session, _ = BotSession.objects.select_for_update().get_or_create(channel="ussd", key=session_id, defaults={"phone": phone})
        if session.phone != phone:  # identifiant de session réutilisé pour un autre numéro : refus
            return HttpResponse("END Session invalide", content_type="text/plain")
        # Requête répétée par l'opérateur (même saisie) : même réponse, sans refaire l'action.
        if session.memo.get("_text") == text and "_reply" in session.memo:
            out = session.memo["_reply"]
        else:
            reply = handle(phone, inputs, session.memo, compact=True)
            out = ("END " if reply.end else "CON ") + reply.text
            session.memo = {**session.memo, "_text": text, "_reply": out}
        session.inputs = inputs
        session.save()
    return HttpResponse(out, content_type="text/plain; charset=utf-8")
