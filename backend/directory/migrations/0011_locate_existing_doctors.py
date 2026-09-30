"""Fiches créées sans position (avant le placement automatique) : position déduite de l'adresse et de la ville."""

from django.db import migrations


def locate(apps, schema_editor):
    from directory import localities

    Doctor = apps.get_model("directory", "Doctor")
    for d in Doctor.objects.filter(latitude__isnull=True):
        loc = localities.locate_address(d.address, d.city)
        if loc:
            d.latitude, d.longitude = loc.latitude, loc.longitude
            d.save(update_fields=["latitude", "longitude"])


class Migration(migrations.Migration):
    dependencies = [("directory", "0010_doctor_photo_path_pharmacy_on_duty_until_and_more")]
    operations = [migrations.RunPython(locate, migrations.RunPython.noop)]
