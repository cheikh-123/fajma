#!/bin/sh
# Restauration complète de Fajma après une panne ou une perte de données : base + fichiers privés.
#
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env stop backend worker scheduler
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env run --rm backup sh /restore.sh /backups/fajma-2026-10-06_0300.tar.gz.enc
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env start backend worker scheduler
#
# Sans argument : la sauvegarde la plus récente. ATTENTION : remplace la base et les fichiers actuels.
# Les objets sont rendus à `fajma_app` (compte de l'application) : sans cela l'application restaurée ne
# pourrait plus lire ses propres données. Le test mensuel (restore-test.sh) vérifie précisément ce point.
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD manquant}"

archive="${1:-$(ls -t /backups/fajma-* 2>/dev/null | head -n 1 || true)}"
[ -n "$archive" ] || { echo "aucune sauvegarde à restaurer" >&2; exit 1; }
echo "Restauration de $(basename "$archive")"
if [ -t 0 ]; then
  printf "La base et les fichiers actuels seront remplacés. Taper OUI pour continuer : "
  read -r answer
  [ "$answer" = "OUI" ] || { echo "annulé"; exit 1; }
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
case "$archive" in
  *.enc) openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$archive" | tar -xz -C "$work" ;;
  *) tar -xzf "$archive" -C "$work" ;;
esac

dropdb -h db -U fajma --if-exists fajma
createdb -h db -U fajma -O fajma_app fajma
pg_restore --no-owner --role=fajma_app -h db -U fajma -d fajma "$work/base.dump"

if [ -d "$work/private_media" ]; then
  rm -rf /data/private_media.old
  [ -d /data/private_media ] && mv /data/private_media /data/private_media.old
  cp -a "$work/private_media" /data/private_media
fi

users=$(PGPASSWORD="$APP_DB_PASSWORD" psql -h db -U fajma_app -d fajma -tAc "SELECT count(*) FROM accounts_user")
echo "Restauration terminée : $users comptes, $(find /data/private_media -type f 2>/dev/null | wc -l) fichiers."
echo "Les fichiers restent chiffrés : FILE_ENCRYPTION_KEYS (conservée hors sauvegarde) est indispensable pour les relire."
