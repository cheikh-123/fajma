from django.apps import AppConfig


class AppointmentsConfig(AppConfig):
    name = 'appointments'

    def ready(self):
        from . import history  # noqa: F401 — branche l'historique automatique des rendez-vous
