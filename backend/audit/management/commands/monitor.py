"""
Supervision interne, toutes les 10 minutes (planificateur) : base de données, envois de SMS, rappels en retard,
sauvegarde récente, espace disque. En cas de problème, email aux adresses ALERT_EMAILS (une fois par problème
toutes les 6 heures, puis un message « résolu »). Code de sortie 1 si un contrôle échoue.

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
