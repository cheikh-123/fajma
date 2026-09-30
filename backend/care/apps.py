from django.apps import AppConfig


class CareConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "care"
    verbose_name = "Suivi à domicile (mesures, rappels de médicaments)"
