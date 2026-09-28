#!/bin/sh
# Copies the dumps somewhere that is not this machine.
#
# The database and the nightly dumps sit on one disk; when that disk dies they
# die together, so the backups are worth little until a copy lives elsewhere.
# rclone does the carrying and speaks Google Drive, Dropbox, OneDrive and S3
# alike — OFFSITE_REMOTE just names which one and which folder.
set -u

remote="${OFFSITE_REMOTE:-}"
every="${OFFSITE_EVERY_DAYS:-2}"
keep="${OFFSITE_KEEP_DAYS:-180}"
conf="${RCLONE_CONFIG:-/config/rclone/rclone.conf}"
state=/state/last-offsite

# Setting this up needs a browser, so a shop that has not got to it yet must
# still be able to start the rest of the stack.
idle() {
  echo "[offsite] $1"
  echo "[offsite] copies to Google Drive are off; see 'Copying the backups off the machine' in the README"
  while true; do sleep 3600; done
}
[ -n "$remote" ] || idle "OFFSITE_REMOTE is not set in .env"
[ -f "$conf" ] || idle "no rclone config at $conf"

send() {
  echo "[offsite] $(date '+%Y-%m-%d %H:%M') copying to $remote"
  if rclone copy /backups "$remote" --log-level NOTICE; then
    # Only new files are sent, so nothing is re-uploaded; without this the
    # remote would grow for ever and fill a free Drive in a few years.
    rclone delete "$remote" --min-age "${keep}d" --log-level NOTICE || true
    date +%s > "$state"
    echo "[offsite] done"
  else
    # Never give up: the internet being down tonight must not mean no copies
    # are ever made again.
    echo "[offsite] failed — trying again in an hour"
  fi
}

mkdir -p /state
echo "[offsite] every ${every} day(s) to ${remote}, keeping ${keep} days there"
while true; do
  last=$(cat "$state" 2>/dev/null) || last=""
  [ -n "$last" ] || last=0
  if [ $(( $(date +%s) - last )) -ge $(( every * 86400 )) ]; then
    send
  fi
  sleep 3600
done
