#!/bin/bash
# Daily encrypted SQLite backup for Couple Buzz.
# Cron: 0 3 * * * POOPHUB_BACKUP_RECIPIENT=your@key /opt/poophub/couple-buzz-server/scripts/backup.sh
#
# The backup is encrypted with a GPG public key whose private half lives OFF
# the server. If an attacker reads /opt/poophub/backups/*.gpg they still need
# the offline private key to decrypt. See docs/BACKUP.md for setup.

set -euo pipefail

BACKUP_DIR="/opt/poophub/backups"
DB_PATH="/opt/poophub/couple-buzz-server/data/app.db"
DATE=$(date +%Y%m%d_%H%M%S)
GPG_RECIPIENT="${POOPHUB_BACKUP_RECIPIENT:-}"

if [ -z "$GPG_RECIPIENT" ]; then
  echo "ERROR: set POOPHUB_BACKUP_RECIPIENT to your gpg key id/email" >&2
  exit 2
fi

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TMP_DB="$BACKUP_DIR/.tmp_app_$DATE.db"
ENCRYPTED="$BACKUP_DIR/app_$DATE.db.gpg"

# .backup is online-safe — no need to stop the server
sqlite3 "$DB_PATH" ".backup '$TMP_DB'"

gpg --batch --yes --trust-model always \
    --output "$ENCRYPTED" --encrypt --recipient "$GPG_RECIPIENT" "$TMP_DB"

# Wipe the plaintext intermediate. shred is best-effort on journaling FS;
# the encrypted file is the canonical artifact regardless.
shred -u "$TMP_DB" 2>/dev/null || rm -f "$TMP_DB"
chmod 600 "$ENCRYPTED"

echo "Backup created: $ENCRYPTED"

# Retain only the 30 most recent encrypted backups
ls -t "$BACKUP_DIR"/app_*.db.gpg 2>/dev/null | tail -n +31 | xargs -r rm
