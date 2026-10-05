"""
Catalogue des spécialités sur toute installation (production comprise) : sans lui, une base neuve n'avait
aucune spécialité et un médecin ne pouvait pas créer sa fiche. Les spécialités déjà présentes gardent leur
identifiant (slug) ; leur nom, icône et description sont mis à jour.
"""

from django.db import migrations


def install(apps, schema_editor):
    from directory.specialties import CATALOG

    Specialty = apps.get_model("directory", "Specialty")
    for slug, name, icon, description in CATALOG:
        Specialty.objects.update_or_create(slug=slug, defaults={"name": name, "icon": icon, "description": description})


class Migration(migrations.Migration):
    dependencies = [("directory", "0011_locate_existing_doctors")]

    operations = [migrations.RunPython(install, migrations.RunPython.noop)]
