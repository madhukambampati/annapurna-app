#!/bin/sh
# Hosts like Fly mount the volume as root. Make it writable for the app user, then drop root.
set -e
DATA_DIR="$(dirname "${DB_PATH:-/data/annapurna.db}")"
mkdir -p "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R "${APP_USER:-node}:" "$DATA_DIR"
  exec runuser -u "${APP_USER:-node}" -- "$@"
fi
exec "$@"
