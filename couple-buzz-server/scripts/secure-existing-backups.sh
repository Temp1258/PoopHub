#!/bin/bash
# One-shot: encrypt or wipe any pre-existing plaintext backups in BACKUP_DIR.
# Run this once after switching to encrypted backups so old plaintext copies
# stop sitting on disk.
#
# Usage:
#   POOPHUB_BACKUP_RECIPIENT=your@key /opt/poophub/couple-buzz-server/scripts/secure-existing-backups.sh
#   POOPHUB_WIPE_PLAINTEXT=1         /opt/poophub/couple-buzz-server/scripts/secure-existing-backups.sh
#
# Modes:
#   default — encrypt each app_*.db to app_*.db.gpg, then shred the original
#   POOPHUB_WIPE_PLAINTEXT=1 — just shred them (you don't need the data)

set -euo pipefail

BACKUP_DIR="/opt/poophub/backups"
WIPE_ONLY="${POOPHUB_WIPE_PLAINTEXT:-}"
GPG_RECIPIENT="${POOPHUB_BACKUP_RECIPIENT:-}"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Nothing to do — $BACKUP_DIR does not exist."
  exit 0
fi

chmod 700 "$BACKUP_DIR"

shopt -s nullglob
plaintext=("$BACKUP_DIR"/app_*.db)
if [ ${#plaintext[@]} -eq 0 ]; then
  echo "No plaintext backups found in $BACKUP_DIR."
  exit 0
fi

if [ "$WIPE_ONLY" = "1" ]; then
  echo "Wiping ${#plaintext[@]} plaintext backup(s) (no encryption)..."
  for f in "${plaintext[@]}"; do
    shred -u "$f" 2>/dev/null || rm -f "$f"
    echo "  - removed $(basename "$f")"
  done
  exit 0
fi

if [ -z "$GPG_RECIPIENT" ]; then
  echo "ERROR: set POOPHUB_BACKUP_RECIPIENT (or POOPHUB_WIPE_PLAINTEXT=1 to just delete)" >&2
  exit 2
fi

echo "Encrypting ${#plaintext[@]} plaintext backup(s) to GPG and shredding originals..."
for f in "${plaintext[@]}"; do
  enc="$f.gpg"
  gpg --batch --yes --trust-model always \
      --output "$enc" --encrypt --recipient "$GPG_RECIPIENT" "$f"
  chmod 600 "$enc"
  shred -u "$f" 2>/dev/null || rm -f "$f"
  echo "  - $(basename "$f") -> $(basename "$enc")"
done

echo "Done."
