"""
Justificatifs pour tous les professionnels : le justificatif du médecin devient générique (médecin, clinique,
pharmacie, laboratoire), avec date de fin de validité et trace du contrôleur. Les pièces déjà déposées sont
conservées (renommage de la table, pas de recréation). Pharmacies déjà partenaires : restent en ligne.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

from directory.requirements import KIND_LABELS


def keep_existing_partners(apps, schema_editor):
    Pharmacy = apps.get_model("directory", "Pharmacy")
    Pharmacy.objects.filter(members__isnull=False).update(is_verified=True)


class Migration(migrations.Migration):
    dependencies = [
        ("directory", "0012_specialty_catalog"),
        ("clinics", "0003_mark_solo_practices"),
        ("labs", "0003_laboratory_verified"),
        ("pharmacy", "0002_medicinequery_medicineanswer"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameModel("DoctorCredential", "Credential"),
        migrations.AlterField(
            model_name="credential",
            name="doctor",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="credentials", to="directory.doctor"
            ),
        ),
        migrations.AddField(
            model_name="credential",
            name="clinic",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="credentials", to="clinics.clinic"
            ),
        ),
        migrations.AddField(
            model_name="credential",
            name="pharmacy",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="credentials", to="directory.pharmacy"
            ),
        ),
        migrations.AddField(
            model_name="credential",
            name="laboratory",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="credentials", to="labs.laboratory"
            ),
        ),
        migrations.AlterField(
            model_name="credential",
            name="kind",
            field=models.CharField(choices=list(KIND_LABELS.items()), max_length=24),
        ),
        migrations.AddField(
            model_name="credential",
            name="reviewed_by",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL
            ),
        ),
        migrations.AddField(model_name="credential", name="expires_at", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="credential", name="expiry_reminded_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddConstraint(
            model_name="credential",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(doctor__isnull=False, clinic__isnull=True, pharmacy__isnull=True, laboratory__isnull=True)
                    | models.Q(doctor__isnull=True, clinic__isnull=False, pharmacy__isnull=True, laboratory__isnull=True)
                    | models.Q(doctor__isnull=True, clinic__isnull=True, pharmacy__isnull=False, laboratory__isnull=True)
                    | models.Q(doctor__isnull=True, clinic__isnull=True, pharmacy__isnull=True, laboratory__isnull=False)
                ),
                name="credential_single_owner",
            ),
        ),
        migrations.AddIndex(model_name="credential", index=models.Index(fields=["status", "created_at"], name="credential_queue_idx")),
        migrations.AddField(model_name="pharmacy", name="is_verified", field=models.BooleanField(default=False)),
        migrations.RunPython(keep_existing_partners, migrations.RunPython.noop),
    ]
