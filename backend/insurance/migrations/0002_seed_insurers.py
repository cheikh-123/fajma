"""Liste de référence des organismes (voir insurance/reference.py)."""

from django.db import migrations

from insurance.reference import INSURERS, ensure_insurers


def seed(apps, schema_editor):
    ensure_insurers(apps.get_model("insurance", "Insurer"))


def unseed(apps, schema_editor):
    apps.get_model("insurance", "Insurer").objects.filter(slug__in=[s for s, *_ in INSURERS], coverages__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("insurance", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
