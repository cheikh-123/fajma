from django.apps import AppConfig


class CarnetConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "carnet"
    verbose_name = "Carnet de santé (vaccination, suivi de grossesse)"
