"""
Sous PostgreSQL (production) : contrainte d'exclusion qui rend physiquement impossible le chevauchement
de deux rendez-vous actifs d'un même médecin, même en cas de requêtes simultanées.
Sans effet sous SQLite (développement), où la vérification applicative suffit.
"""

from django.db import migrations

CREATE = """
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments_appointment
  ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (doctor_id WITH =, tstzrange(scheduled_at, ends_at) WITH &&)
  WHERE (status IN ('pending', 'confirmed'));
"""
DROP = "ALTER TABLE appointments_appointment DROP CONSTRAINT IF EXISTS appointment_no_overlap;"


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(CREATE)


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(DROP)


class Migration(migrations.Migration):
    dependencies = [("appointments", "0004_appointment_location_appointment_video_started_at")]
    operations = [migrations.RunPython(forwards, backwards)]
