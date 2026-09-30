"""
Paiement mobile via PayDunya (Wave, Orange Money, Free Money, cartes) — API « Checkout Invoice ».
Un paiement n'est marqué payé qu'après relecture de la facture auprès de PayDunya.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.utils import timezone

from sunusante.api import ApiError

from .models import Payment

logger = logging.getLogger(__name__)


def _config() -> tuple[str, dict[str, str]]:
    cfg = settings.PAYDUNYA
    if not (cfg["MASTER_KEY"] and cfg["PRIVATE_KEY"] and cfg["TOKEN"]):
        raise ApiError("Le paiement mobile n'est pas encore activé. Choisissez le paiement au cabinet.", 503)
    base = "https://app.paydunya.com/api/v1" if cfg["MODE"] == "live" else "https://app.paydunya.com/sandbox-api/v1"
    headers = {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": cfg["MASTER_KEY"],
        "PAYDUNYA-PRIVATE-KEY": cfg["PRIVATE_KEY"],
        "PAYDUNYA-TOKEN": cfg["TOKEN"],
    }
    return base, headers


def _request(url: str, headers: dict, payload: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        try:
            return err.code, json.loads(err.read() or b"{}")
        except ValueError:
            return err.code, {}
    except (urllib.error.URLError, TimeoutError, ValueError) as err:
        logger.error("PayDunya injoignable : %s", err)
        return 0, {}


def create_invoice(*, amount: int, description: str, payment_id: str, return_url: str, cancel_url: str, callback_url: str) -> tuple[str, str]:
    base, headers = _config()
    status, body = _request(
        f"{base}/checkout-invoice/create",
        headers,
        {
            "invoice": {"total_amount": amount, "description": description},
            "store": {"name": "Fajma"},
            "actions": {"return_url": return_url, "cancel_url": cancel_url, "callback_url": callback_url},
            "custom_data": {"payment_id": payment_id},
        },
    )
    if status != 200 or body.get("response_code") != "00" or not body.get("token") or not body.get("response_text"):
        logger.error("PayDunya création facture échouée : %s %s", status, body)
        raise ApiError("Le service de paiement est indisponible. Réessayez dans un instant.", 502)
    return body["token"], body["response_text"]


def confirm_invoice(token: str) -> tuple[str, int | None]:
    base, headers = _config()
    status, body = _request(f"{base}/checkout-invoice/confirm/{token}", headers)
    if status != 200 or body.get("response_code") != "00":
        return "unknown", None
    state = body.get("status")
    state = state if state in {"completed", "pending", "cancelled", "failed"} else "unknown"
    total = body.get("invoice", {}).get("total_amount")
    try:
        amount = int(float(total)) if total is not None else None
    except (TypeError, ValueError):
        amount = None
    return state, amount


def sync_invoice(obj, on_paid=None) -> str:
    """
    Relit l'état de la facture chez PayDunya (source de vérité) et met à jour l'objet payé
    (paiement de consultation ou d'abonnement). on_paid est appelé une fois, au passage à « payé ».
    """
    if obj.status == "paid" or not obj.provider_token:
        return obj.status
    state, amount = confirm_invoice(obj.provider_token)
    new_status = "pending"
    if state == "completed":
        if amount is not None and amount < obj.amount:
            logger.error("PayDunya : montant incohérent pour %s (%s < %s)", obj.id, amount, obj.amount)
            new_status = "failed"
        else:
            new_status = "paid"
    elif state in {"cancelled", "failed"}:
        new_status = "failed"
    if new_status != obj.status:
        obj.status = new_status
        obj.paid_at = timezone.now() if new_status == "paid" else None
        obj.save(update_fields=["status", "paid_at", "updated_at"])
        if new_status == "paid" and on_paid:
            on_paid(obj)
    return obj.status


def sync_payment(payment: Payment) -> str:
    from .ledger import record_earning

    return sync_invoice(payment, record_earning)
