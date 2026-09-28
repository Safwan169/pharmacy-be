#!/bin/sh
# One dump a night, unattended.
#
# A backup that waits for someone to press a button is a backup that stops
# happening in the week it turns out to be needed, so this takes one on its
# own. It runs the same code the Settings button runs, so the file is named
# the same way and BACKUP_KEEP_DAYS prunes the old ones the same way.
#
# BACKUP_HOUR (0-23, default 2) is the hour of the shop's own day — the
# container is set to Asia/Dhaka in docker-compose.yml.
set -u

# Zero-padded to compare against `date +%H`. Done with a case rather than
# printf %d, which reads a leading zero as octal and chokes on "08".
hour="${BACKUP_HOUR:-2}"
case "$hour" in [0-9]) hour="0$hour" ;; esac
dir="${BACKUP_DIR:-/app/backups}"

take() {
  echo "[backup] $(date '+%Y-%m-%d %H:%M') starting"
  # Never exit on failure: the database being briefly unreachable must not
  # leave the shop with no backups for every night after it.
  node dist/database/seeds/backup.script.js || echo "[backup] failed, will try again tomorrow"
}

# A server set up this afternoon should not be unprotected until 2 a.m.
if [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
  echo "[backup] no dumps yet, taking one now"
  take
fi

echo "[backup] waiting for ${hour}:00 each night"
done_on=""
while true; do
  today=$(date '+%Y-%m-%d')
  if [ "$(date '+%H')" = "$hour" ] && [ "$today" != "$done_on" ]; then
    take
    done_on="$today"
  fi
  sleep 60
done
