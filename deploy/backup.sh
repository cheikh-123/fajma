#!/bin/sh
# Sauvegarde quotidienne de Fajma : base PostgreSQL (pg_dump) + fichiers privés (documents médicaux,
# justificatifs, signatures et cachets des médecins), dans /backups (dossier deploy/backups du serveur).
# Chiffrée (AES-256) si BACKUP_PASSPHRASE est défini, conservée BACKUP_KEEP_DAYS jours (30 par défaut).
# À copier ensuite hors du serveur (rclone, scp…) : une sauvegarde sur la même machine ne protège pas d'une panne.
#
# Restauration :
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in fajma-XXXX.tar.gz.enc | tar -xz
#   pg_restore --clean --no-owner -d "$DATABASE_URL" base.dump   puis recopier private_media/
set -eu
KEEP="${BACKUP_KEEP_DAYS:-30}"
if [ -n "${BACKUP_PASSPHRASE:-}" ] && ! command -v openssl >/dev/null; then
  apk add --no-cache openssl >/dev/null
fi
while true; do
  stamp=$(date +%Y-%m-%d_%H%M)
  work=$(mktemp -d)
  if pg_dump -h db -U fajma -d fajma -Fc -f "$work/base.dump" \
    && tar -czf "$work/fajma.tar.gz" -C "$work" base.dump -C /data private_media; then
    if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
      openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE \
        -in "$work/fajma.tar.gz" -out "/backups/fajma-$stamp.tar.gz.enc"
    else
      mv "$work/fajma.tar.gz" "/backups/fajma-$stamp.tar.gz"
    fi
    echo "sauvegarde $stamp : ok"
  else
    echo "sauvegarde $stamp : ÉCHEC" >&2
  fi
  rm -rf "$work"
  find /backups -name 'fajma-*' -mtime +"$KEEP" -delete
  # Test de restauration le 1er de chaque mois (résultat dans les journaux du service backup).
  if [ "$(date +%d)" = "01" ]; then
    sh /restore-test.sh || echo "test de restauration : ÉCHEC" >&2
  fi
  sleep 86400
done
