from django.db import migrations, models


def activer_confirmation_automatique(apps, schema_editor):
    """
    Les fiches existantes avaient la valeur par défaut d'avant (validation manuelle de chaque demande) :
    elles passent à la confirmation automatique, qui devient la règle. Un médecin qui préfère valider
    lui-même peut la désactiver dans « Profil et cabinet ».
    """
    apps.get_model("directory", "Doctor").objects.filter(auto_confirm=False).update(auto_confirm=True)


class Migration(migrations.Migration):

    dependencies = [
        ("directory", "0013_credentials_for_all"),
    ]

    operations = [
        migrations.AlterField(
            model_name="doctor",
            name="auto_confirm",
            field=models.BooleanField(default=True, help_text="Confirme automatiquement les RDV pris sur un créneau libre"),
        ),
        migrations.RunPython(activer_confirmation_automatique, migrations.RunPython.noop),
    ]
