"""Relit les agendas personnels des médecins (à lancer toutes les 10 minutes avec send_reminders)."""

from django.core.management.base import BaseCommand

from directory.calendar_sync import import_calendar
from directory.models import CalendarLink
from sunusante.api import ApiError


class Command(BaseCommand):
    help = "Importe les occupations des agendas personnels des médecins"

    def handle(self, *args, **options):
        ok = failed = 0
        for link in CalendarLink.objects.exclude(import_url=""):
            try:
                import_calendar(link)
                ok += 1
            except ApiError:
                failed += 1  # erreur enregistrée sur le lien et affichée au médecin
        self.stdout.write(f"agendas : {ok} synchronisés, {failed} en erreur")
