#!/bin/sh
# Sauvegarde de Fajma toutes les BACKUP_INTERVAL_HOURS heures (24 par défaut, 6 conseillé) : base PostgreSQL
# (pg_dump) + fichiers privés (documents médicaux,
# justificatifs, signatures et cachets des médecins), dans /backups (dossier deploy/backups du serveur).
# Chiffrée (AES-256) si BACKUP_PASSPHRASE est défini, conservée BACKUP_KEEP_DAYS jours (30 par défaut).
# À copier ensuite hors du serveur (rclone, scp…) : une sauvegarde sur la même machine ne protège pas d'une panne.
#
# Restauration :
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in fajma-XXXX.tar.gz.enc | tar -xz
#   pg_restore --clean --no-owner -d "$DATABASE_URL" base.dump   puis recopier private_media/
# (procédure vérifiée : copie identique table par table, voir docs/dossier-technique/04-exploitation.md).
# Les fichiers sont chiffrés : sans FILE_ENCRYPTION_KEYS (conservée à part), ils sont illisibles.
set -eu
KEEP="${BACKUP_KEEP_DAYS:-30}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
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
  # Test de restauration une fois par mois, le 1er (résultat dans les journaux du service backup ; la commande
  # « monitor » alerte s'il n'a pas réussi depuis plus de 35 jours).
  month=$(date +%Y-%m)
  if [ "$(date +%d)" = "01" ] && [ "$(cat /backups/.last-restore-test-month 2>/dev/null)" != "$month" ]; then
    if sh /restore-test.sh; then echo "$month" > /backups/.last-restore-test-month; else echo "test de restauration : ÉCHEC" >&2; fi
  fi
  sleep $((INTERVAL_HOURS * 3600))
done
