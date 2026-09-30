"""Cabinets créés pour le secrétariat d'un médecin seul avant l'ajout du champ « kind » : pas de page publique."""

from django.db import migrations


def mark(apps, schema_editor):
    Clinic = apps.get_model("clinics", "Clinic")
    Doctor = apps.get_model("directory", "Doctor")
    for clinic in Clinic.objects.filter(name__startswith="Cabinet "):
        doctor = Doctor.objects.filter(user_id=clinic.owner_id).first()
        members = list(clinic.members.values_list("doctor_id", flat=True))
        if doctor and members == [doctor.id]:
            clinic.kind = "practice"
            clinic.save(update_fields=["kind"])


class Migration(migrations.Migration):
    dependencies = [("clinics", "0002_clinic_kind"), ("directory", "0010_doctor_photo_path_pharmacy_on_duty_until_and_more")]
    operations = [migrations.RunPython(mark, migrations.RunPython.noop)]
