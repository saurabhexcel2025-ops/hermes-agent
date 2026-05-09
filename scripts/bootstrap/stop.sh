#!/bin/bash
# Stop Control Hub Next.js server on PORT (from env, .env.local, or default 3000).
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CH_PORT_FILE=""
if [ -z "${PORT:-}" ] && [ -f "$APP_DIR/.env.local" ]; then
  CH_PORT_FILE="$(grep -E '^PORT=' "$APP_DIR/.env.local" | tail -n1 | sed 's/^PORT=//' | tr -d '\r')"
fi
PORT="${PORT:-${CH_PORT_FILE:-3000}}"
if command -v fuser &>/dev/null; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
elif command -v lsof &>/dev/null; then
  for pid in $(lsof -ti:"$PORT" 2>/dev/null); do
    kill -9 "$pid" 2>/dev/null || true
  done
else
  echo "Install fuser (psmisc) or lsof to stop the server." >&2
  exit 1
fi
echo "Stopped listeners on port $PORT"
