#!/usr/bin/env bash
# Take a fresh Heroku backup of the TMP database and keep a copy on THIS computer.
# Heroku itself keeps only 7 daily backups and 1 weekly one on the Essential database plan, and 5 manual ones,
# so a copy off Heroku is the real safety net.
#
# Usage:   bash scripts/backup-download.sh            (app name defaults to themodernpedagogues)
#          bash scripts/backup-download.sh other-app
# Options (environment): BACKUP_DIR=backups  KEEP=12 (how many copies to keep on this computer)
#
# The files contain every learner's and parent's personal details. Keep them private: never email them, never
# commit them to git (the backups/ folder is ignored), and delete the old ones this script does not prune.
set -euo pipefail

APP="${1:-themodernpedagogues}"
DIR="${BACKUP_DIR:-backups}"
KEEP="${KEEP:-12}"

command -v heroku >/dev/null 2>&1 || { echo "The Heroku command is not installed or not on your PATH." >&2; exit 1; }

mkdir -p "$DIR"
chmod 700 "$DIR" 2>/dev/null || true

echo "Asking Heroku for a fresh backup of $APP (this can take a minute)..."
heroku pg:backups:capture -a "$APP"

OUT="$DIR/tmp-$(date +%Y-%m-%d_%H%M%S).dump"
echo "Downloading it to $OUT ..."
heroku pg:backups:download -a "$APP" -o "$OUT"

SIZE=$(wc -c < "$OUT" | tr -d ' ')
if [ "$SIZE" -lt 10000 ]; then
  echo "The downloaded file is only $SIZE bytes, which is too small to be a real backup. Deleting it." >&2
  rm -f "$OUT"
  exit 1
fi

if command -v pg_restore >/dev/null 2>&1; then
  if pg_restore --list "$OUT" >/dev/null 2>&1; then
    echo "Checked: the file reads as a valid PostgreSQL backup."
  else
    echo "WARNING: pg_restore cannot read $OUT. Do not rely on it; run this script again." >&2
    exit 1
  fi
else
  echo "Note: pg_restore is not installed here, so the file's contents were not checked (only its size)."
fi

# Keep the newest $KEEP copies on this computer and remove the rest.
ls -1t "$DIR"/tmp-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  rm -f -- "$old"
  echo "Removed old copy $old"
done

echo "Done. Saved $OUT ($SIZE bytes). Copies kept: up to $KEEP."
