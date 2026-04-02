#!/bin/bash
# Daily SQLite backup for Couple Buzz
# Cron: 0 3 * * * /opt/poophub/couple-buzz-server/scripts/backup.sh

BACKUP_DIR="/opt/poophub/backups"
DB_PATH="/opt/poophub/couple-buzz-server/data/app.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH"
  exit 1
fi

sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/app_$DATE.db'"
echo "Backup created: $BACKUP_DIR/app_$DATE.db"

# Keep last 30 backups
ls -t "$BACKUP_DIR"/app_*.db 2>/dev/null | tail -n +31 | xargs -r rm
