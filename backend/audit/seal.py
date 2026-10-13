"""
Scellement du journal d'audit : chaque évènement est signé avec le sceau du précédent, ce qui forme une chaîne.

Ce que cela protège. L'application interdit déjà de modifier ou de supprimer un évènement (`AuditEvent.save`
et `.delete` lèvent une erreur). Mais ces garde-fous vivent dans le code Python : quelqu'un qui atteint la base
directement — console technique, sauvegarde volée, prestataire d'hébergement, administrateur de base de
données — pouvait jusqu'ici retoucher une ligne ou en effacer une pour couvrir ses traces, sans laisser de
marque. Avec la chaîne, toute retouche, insertion ou suppression casse le sceau de tous les évènements
suivants, et `manage.py verifier_journal` le dit avec précision.

Ce que cela ne protège pas, et il faut le savoir : quelqu'un qui contrôle le **serveur applicatif** possède la
clé et peut recalculer une chaîne entière. Pour s'en prémunir, il faudrait publier périodiquement le dernier
sceau hors du système (impression, envoi à un tiers, horodatage externe) : `manage.py verifier_journal
--ancre` affiche la valeur à conserver. Deux lignes dans un carnet suffisent.

Clé : `AUDIT_SEAL_KEY`, sinon dérivée de `DJANGO_SECRET_KEY`. Elle ne doit jamais changer sans raison — la
vérification des évènements antérieurs deviendrait impossible.
"""

from __future__ import annotations

import hashlib
import hmac
import json

from django.conf import settings
from django.db import models, transaction

from sunusante.models import BaseModel

GENESIS = "0" * 64  # sceau fictif du tout premier évènement


def _key() -> bytes:
    raw = getattr(settings, "AUDIT_SEAL_KEY", "") or f"audit:{settings.SECRET_KEY}"
    return hashlib.sha256(raw.encode()).digest()


def content(event) -> str:
    """Représentation stable d'un évènement. Tout champ qui compte doit y figurer : ce qui n'est pas scellé
    peut être modifié sans que la vérification s'en aperçoive."""
    return json.dumps(
        [
            str(event.id),
            event.created_at.isoformat() if event.created_at else "",
            str(event.actor_id or ""),
            str(event.patient_id or ""),
            event.action,
            event.target_type,
            event.target_id,
            event.ip or "",
            event.user_agent,
            event.metadata or {},
        ],
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )


def compute(index: int, previous_seal: str, event) -> str:
    message = f"{index}|{previous_seal}|{content(event)}".encode()
    return hmac.new(_key(), message, hashlib.sha256).hexdigest()


class AuditChainHead(BaseModel):
    """Dernier maillon de la chaîne : une seule ligne, verrouillée le temps d'ajouter un évènement.

    Ce verrou sérialise les écritures du journal. C'est volontaire : un numéro d'ordre sans trou est ce qui
    permet de détecter une suppression. Le journal s'écrit en quelques millisecondes, le coût est négligeable
    devant la garantie obtenue.
    """

    singleton = models.PositiveSmallIntegerField(unique=True, default=1)
    last_index = models.BigIntegerField(default=0)
    last_seal = models.CharField(max_length=64, default=GENESIS)

    class Meta:
        verbose_name = "tête de chaîne du journal d'audit"

    @classmethod
    def next_link(cls, event) -> tuple[int, str]:
        """Attribue son rang et son sceau à `event`. À appeler dans la transaction qui l'enregistre."""
        head = cls.objects.select_for_update().filter(singleton=1).first()
        if head is None:
            head = cls.objects.create(singleton=1)
            head = cls.objects.select_for_update().get(pk=head.pk)
        index = head.last_index + 1
        seal = compute(index, head.last_seal, event)
        head.last_index, head.last_seal = index, seal
        head.save(update_fields=["last_index", "last_seal"])
        return index, seal


def verify(events) -> list[str]:
    """Reparcourt une suite d'évènements triés par rang croissant et renvoie les anomalies constatées.

    Le tout premier évènement reçu n'est pas vérifiable si son prédécesseur a été purgé (voir `purge_data`,
    qui efface le journal au-delà de la durée de conservation) : on repart alors de son sceau tel quel.
    """
    problems: list[str] = []
    previous: tuple[int, str] | None = None
    for event in events:
        if event.chain_index is None:
            problems.append(f"{event.created_at:%d/%m/%Y %H:%M} — évènement {event.id} sans rang (antérieur au scellement)")
            continue
        if previous is not None:
            expected_index, previous_seal = previous[0] + 1, previous[1]
            if event.chain_index != expected_index:
                missing = event.chain_index - expected_index
                problems.append(
                    f"{event.created_at:%d/%m/%Y %H:%M} — {missing} évènement(s) manquant(s) avant le rang {event.chain_index}"
                )
            elif compute(event.chain_index, previous_seal, event) != event.seal:
                problems.append(
                    f"{event.created_at:%d/%m/%Y %H:%M} — évènement {event.chain_index} modifié depuis son enregistrement ({event.action})"
                )
        previous = (event.chain_index, event.seal)
    return problems


@transaction.atomic
def seal_and_create(model, **fields):
    """Crée un évènement scellé.

    L'évènement est d'abord enregistré — c'est l'insertion qui fixe son identifiant et son horodatage, deux
    valeurs qui entrent dans le sceau —, puis scellé dans la même transaction. L'écriture du sceau passe par
    `update()` et non par `save()`, que le modèle interdit volontairement sur un évènement existant.
    """
    event = model.objects.create(**fields)
    event.chain_index, event.seal = AuditChainHead.next_link(event)
    model.objects.filter(pk=event.pk).update(chain_index=event.chain_index, seal=event.seal)
    return event
