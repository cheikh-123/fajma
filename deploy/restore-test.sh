#!/bin/sh
# Test de restauration : une sauvegarde n'a de valeur que si on sait la relire.
# Restaure la dernière sauvegarde dans une base temporaire, vérifie qu'elle contient des données ET que le
# compte de l'application (fajma_app, sans droits d'administrateur) peut vraiment les lire — une restauration
# faite sous un autre compte laisserait l'application sans accès à ses propres données. Puis efface la base.
# Lancé automatiquement chaque mois par backup.sh ; manuellement :
#   docker compose exec backup sh /restore-test.sh
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD manquant}"
latest=$(ls -t /backups/fajma-* 2>/dev/null | head -n 1 || true)
if [ -z "$latest" ]; then
  echo "test de restauration : ÉCHEC, aucune sauvegarde" >&2
  exit 1
fi
work=$(mktemp -d)
trap 'rm -rf "$work"; dropdb -h db -U fajma --if-exists fajma_restore_test >/dev/null 2>&1 || true' EXIT
case "$latest" in
  *.enc) openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$latest" | tar -xz -C "$work" ;;
  *) tar -xzf "$latest" -C "$work" ;;
esac
dropdb -h db -U fajma --if-exists fajma_restore_test
createdb -h db -U fajma -O fajma_app fajma_restore_test
pg_restore --no-owner --role=fajma_app -h db -U fajma -d fajma_restore_test "$work/base.dump"
# Lecture avec le compte de l'application, pas celui d'administration : c'est tout l'intérêt du test.
count() { PGPASSWORD="$APP_DB_PASSWORD" psql -h db -U fajma_app -d fajma_restore_test -tAc "SELECT count(*) FROM $1"; }
users=$(count accounts_user)
appointments=$(count appointments_appointment)
files=$(find "$work/private_media" -type f 2>/dev/null | wc -l)
if [ "$users" -lt 1 ]; then
  echo "test de restauration : ÉCHEC, base restaurée vide ou illisible par l'application ($latest)" >&2
  exit 1
fi
echo "test de restauration $(date +%Y-%m-%d) : OK — $(basename "$latest") : $users comptes, $appointments rendez-vous, $files fichiers"
date +%s > /backups/.last-restore-test-ok
