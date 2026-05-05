#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Control Hub — Build Script
# ═══════════════════════════════════════════════════════════════
# Runs npm build in the background then calls restart.sh.
# This separates the build's memory pressure from the server
# process that spawned it (avoids OOM kills).
#
# Usage:
#   bash scripts/build.sh
#
# Called by:
#   - POST /api/update { action: "rebuild" }
#
# NOTE: Uses plain & NOT nohup — nohup causes agent terminal freeze.
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$HOME/.hermes/logs/ch-restart.log"
BUILD_LOG="$HOME/.hermes/logs/ch-build.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

cd "$APP_DIR"

log "Build started..."
npm run build >> "$BUILD_LOG" 2>&1
log "Build complete."
log "Restarting server..."
bash "$SCRIPT_DIR/restart.sh"
