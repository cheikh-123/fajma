"""
Vérifie que le journal d'audit n'a pas été retouché dans la base.

    python manage.py verifier_journal              # tout le journal
    python manage.py verifier_journal --depuis 30  # les 30 derniers jours (rapide, pour un contrôle mensuel)
    python manage.py verifier_journal --ancre      # affiche le dernier sceau, à conserver hors du système

Chaque évènement est signé avec le sceau du précédent : modifier une ligne, en insérer une ou en supprimer une
casse la chaîne, et la commande dit laquelle. Code de sortie 1 si une anomalie est trouvée — à brancher sur le
contrôle mensuel, à côté du test de restauration.

L'« ancre » est le dernier sceau de la chaîne. Noté ailleurs (carnet, email à un tiers, impression), il protège
aussi contre quelqu'un qui contrôlerait le serveur : une chaîne recalculée de bout en bout ne retomberait pas
sur l'ancre conservée.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from audit.models import AuditEvent
from audit.seal import AuditChainHead, verify


class Command(BaseCommand):
    help = "Vérifie le scellement du journal d'audit"

    def add_arguments(self, parser):
        parser.add_argument("--depuis", type=int, default=0, help="Ne vérifier que les N derniers jours")
        parser.add_argument("--ancre", action="store_true", help="Afficher le dernier sceau à conserver")

    def handle(self, *args, depuis=0, ancre=False, **options):
        head = AuditChainHead.objects.filter(singleton=1).first()
        if ancre:
            if not head:
                self.stdout.write("Aucun évènement scellé pour le moment.")
                return
            self.stdout.write(f"Ancre au {timezone.now():%d/%m/%Y %H:%M} UTC")
            self.stdout.write(f"  rang  : {head.last_index}")
            self.stdout.write(f"  sceau : {head.last_seal}")
            self.stdout.write("Conservez ces deux lignes hors du système (carnet, email à un tiers).")
            return

        events = AuditEvent.objects.order_by("chain_index")
        if depuis:
            events = events.filter(created_at__gte=timezone.now() - timedelta(days=depuis))
        # Les évènements antérieurs au scellement n'ont pas de rang : ils sont signalés, pas comptés en erreur.
        total = events.count()
        problems = verify(events.iterator(chunk_size=2000))

        anciens = [p for p in problems if "sans rang" in p]
        ruptures = [p for p in problems if "sans rang" not in p]
        self.stdout.write(f"{total} évènement(s) examiné(s).")
        if anciens:
            self.stdout.write(f"{len(anciens)} évènement(s) antérieur(s) au scellement, non vérifiables.")
        if head:
            self.stdout.write(f"Dernier rang scellé : {head.last_index}.")
        if not ruptures:
            self.stdout.write(self.style.SUCCESS("Journal intact : aucune retouche détectée."))
            return
        self.stdout.write(self.style.ERROR(f"{len(ruptures)} anomalie(s) :"))
        for p in ruptures[:50]:
            self.stdout.write(f"  - {p}")
        if len(ruptures) > 50:
            self.stdout.write(f"  … et {len(ruptures) - 50} autre(s).")
        raise SystemExit(1)
