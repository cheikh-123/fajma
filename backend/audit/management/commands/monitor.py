"""
Supervision interne, toutes les 10 minutes (planificateur) : base de données, envois de SMS, rappels en retard,
sauvegarde récente, espace disque, et **signaux de sécurité** (vague de mots de passe essayés, comptes verrouillés,
fiches d'urgence consultées anormalement, rafale d'actions sensibles de l'administration).

En cas de problème, email aux adresses ALERT_EMAILS (une fois par problème toutes les 6 heures, puis un message
« résolu ») ; les problèmes GRAVES partent aussi par SMS aux numéros ALERT_PHONES, parce qu'un email n'est pas lu
la nuit. Code de sortie 1 si un contrôle échoue.

    python manage.py monitor [--quiet]

Complément indispensable : un service EXTERNE (UptimeRobot, Better Stack…) qui appelle /api/health chaque
minute, car si le serveur entier tombe, cette commande ne tourne plus et ne peut prévenir personne.
"""

import json
import shutil
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone

REPEAT_AFTER = timedelta(hours=6)

# Contrôles dont l'échec part aussi par SMS : on ne réveille personne pour un disque à 9 %.
SERIOUS = {"base de données", "antivirus", "sauvegarde", "mots de passe essayés en masse", "comptes verrouillés"}

# Seuils des signaux de sécurité. Volontairement larges : une alerte qui sonne pour rien finit ignorée.
FAILED_LOGINS_15MIN = 60  # échecs de connexion, toutes adresses confondues
LOCKED_ACCOUNTS_1H = 5  # comptes différents ayant atteint le verrou de 10 échecs
EMERGENCY_VIEWS_1H = 30  # consultations de fiches d'urgence par QR code
ADMIN_SENSITIVE_1H = 10  # suspensions, réactivations, réinitialisations de double authentification


def security_checks(now) -> dict[str, str | None]:
    """Signaux qui trahissent une attaque en cours. Lus dans le journal d'audit, qui enregistre déjà tout."""
    from audit.models import AuditEvent

    events = AuditEvent.objects.filter(created_at__gte=now - timedelta(hours=1))
    results: dict[str, str | None] = {}

    quarter = [e for e in events if e.created_at >= now - timedelta(minutes=15) and e.action == "login_failed"]
    results["mots de passe essayés en masse"] = (
        f"{len(quarter)} échecs de connexion en 15 min (seuil {FAILED_LOGINS_15MIN})"
        if len(quarter) >= FAILED_LOGINS_15MIN
        else None
    )

    # Un compte est verrouillé dès 10 échecs en 15 min : plusieurs comptes verrouillés d'affilée signalent
    # une attaque répartie, que la limite par adresse IP ne voit pas.
    tries: dict[str, int] = {}
    for e in events:
        if e.action == "login_failed":
            email = (e.metadata or {}).get("email") or ""
            if email:
                tries[email] = tries.get(email, 0) + 1
    locked = [email for email, n in tries.items() if n >= 10]
    results["comptes verrouillés"] = (
        f"{len(locked)} compte(s) verrouillé(s) en 1 h : {', '.join(sorted(locked)[:5])}"
        if len(locked) >= LOCKED_ACCOUNTS_1H
        else None
    )

    cards = sum(1 for e in events if e.action == "emergency_card_viewed")
    results["fiches d'urgence consultées"] = (
        f"{cards} consultations par QR code en 1 h (seuil {EMERGENCY_VIEWS_1H}) : lien diffusé ?"
        if cards >= EMERGENCY_VIEWS_1H
        else None
    )

    sensitive = {"admin_user_suspend", "admin_user_reactivate", "admin_user_reset_mfa"}
    admin_actions = sum(1 for e in events if e.action in sensitive)
    results["actions d'administration en rafale"] = (
        f"{admin_actions} suspensions / réactivations / réinitialisations de 2FA en 1 h (seuil {ADMIN_SENSITIVE_1H})"
        if admin_actions >= ADMIN_SENSITIVE_1H
        else None
    )
    return results


def run_checks() -> dict[str, str | None]:
    """{nom du contrôle: None si OK, sinon description du problème}."""
    from notifications.models import SmsReminder

    now = timezone.now()
    results: dict[str, str | None] = {}
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        results["base de données"] = None
    except Exception as err:  # noqa: BLE001
        return {"base de données": f"injoignable ({err})"}

    overdue = SmsReminder.objects.filter(status="pending", scheduled_for__lt=now - timedelta(minutes=30)).count()
    results["rappels SMS en retard"] = f"{overdue} rappel(s) non envoyé(s) depuis plus de 30 min" if overdue else None

    recent = SmsReminder.objects.filter(scheduled_for__gte=now - timedelta(hours=24), scheduled_for__lt=now)
    total, failed = recent.count(), recent.filter(status="failed").count()
    results["échecs SMS"] = (
        f"{failed} échec(s) sur {total} SMS en 24 h (crédit Twilio ? numéro WhatsApp ?)" if total >= 5 and failed / total > 0.2 else None
    )

    if settings.BACKUP_DIR:
        folder = Path(settings.BACKUP_DIR)
        backups = sorted(folder.glob("fajma-*"), key=lambda p: p.stat().st_mtime) if folder.is_dir() else []
        if not backups:
            results["sauvegarde"] = f"aucune sauvegarde dans {folder}"
        else:
            age = now.timestamp() - backups[-1].stat().st_mtime
            too_old = age > settings.BACKUP_MAX_AGE_HOURS * 3600
            tiny = backups[-1].stat().st_size < 1024
            results["sauvegarde"] = (
                f"dernière sauvegarde vieille de {int(age // 3600)} h" if too_old else "dernière sauvegarde vide ou tronquée" if tiny else None
            )
            # Une sauvegarde n'a de valeur que si on sait la relire : test de restauration réussi depuis moins de 35 jours.
            marker = folder / ".last-restore-test-ok"
            oldest = now.timestamp() - backups[0].stat().st_mtime
            if not marker.exists():
                results["test de restauration"] = "jamais réussi" if oldest > 35 * 86400 else None
            else:
                days = (now.timestamp() - marker.stat().st_mtime) / 86400
                results["test de restauration"] = f"dernier succès il y a {int(days)} jours" if days > 35 else None

    if settings.CLAMAV_ADDRESS:
        from sunusante.uploads import _clamd_scan

        try:
            _clamd_scan(b"fajma-monitor")
            results["antivirus"] = None
        except (OSError, ValueError) as err:
            results["antivirus"] = f"injoignable ({err}) : les dépôts de documents sont refusés"

    usage = shutil.disk_usage(settings.PRIVATE_MEDIA_ROOT if Path(settings.PRIVATE_MEDIA_ROOT).exists() else "/")
    free_pct = usage.free * 100 / usage.total
    results["espace disque"] = f"plus que {free_pct:.0f} % d'espace libre" if free_pct < 10 else None
    results.update(security_checks(now))
    return results


class Command(BaseCommand):
    help = "Contrôle la santé de la plateforme et alerte par email"

    def add_arguments(self, parser):
        parser.add_argument("--quiet", action="store_true", help="N'affiche rien si tout va bien")

    def handle(self, *args, quiet=False, **options):
        results = run_checks()
        problems = {k: v for k, v in results.items() if v}
        state_file = Path(settings.PRIVATE_MEDIA_ROOT) / ".monitor-state.json"
        try:
            state = json.loads(state_file.read_text())
        except (OSError, ValueError):
            state = {}
        now = timezone.now()
        to_alert = [
            k for k in problems if k not in state or now.timestamp() - state[k] > REPEAT_AFTER.total_seconds()
        ]
        resolved = [k for k in state if k not in problems]
        lines = []
        if to_alert:
            lines += ["PROBLÈMES :"] + [f"- {k} : {problems[k]}" for k in to_alert]
        if resolved:
            lines += ["RÉSOLU :"] + [f"- {k}" for k in resolved]
        if lines and settings.ALERT_EMAILS:
            subject = f"[Fajma] {'ALERTE' if to_alert else 'Résolu'} : {', '.join(to_alert or resolved)}"
            try:
                send_mail(subject, "\n".join(lines) + f"\n\n{now:%d/%m/%Y %H:%M} UTC", None, settings.ALERT_EMAILS)
            except Exception as err:  # noqa: BLE001
                self.stderr.write(f"envoi de l'alerte impossible : {err}")

        # Problèmes graves : aussi par SMS, envoyé directement et non par la file des tâches, qui peut être à
        # l'arrêt précisément parce que la plateforme va mal. Un échec d'envoi ne masque jamais l'alerte email.
        serious = [k for k in to_alert if k in SERIOUS]
        if serious and settings.ALERT_PHONES:
            from notifications.sms import send_message

            text = "[Fajma] ALERTE : " + " ; ".join(f"{k} — {problems[k]}" for k in serious)
            for phone in settings.ALERT_PHONES:
                try:
                    send_message(to=phone, body=text[:300], essential=True)
                except Exception as err:  # noqa: BLE001
                    self.stderr.write(f"SMS d'alerte vers {phone} impossible : {err}")

        for k in to_alert:
            state[k] = now.timestamp()
        for k in resolved:
            state.pop(k, None)
        try:
            state_file.parent.mkdir(parents=True, exist_ok=True)
            state_file.write_text(json.dumps(state))
        except OSError:
            pass
        if problems or not quiet:
            self.stdout.write("; ".join(f"{k} : {v or 'ok'}" for k, v in results.items()))
        if problems:
            raise SystemExit(1)
