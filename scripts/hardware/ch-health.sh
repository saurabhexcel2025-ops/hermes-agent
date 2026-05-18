#!/usr/bin/env bash
# ch-health.sh — Control Hub health check
# Run by hardware cron: health monitoring for Control Hub services.

LOG_DIR="${LOG_DIR:-${CH_HARDWARE_LOG_DIR:-${CH_DATA_DIR:-$HOME/control-hub/data}/logs}}"
LOG_FILE="${LOG_DIR}/ch-health.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO [ch-health] $*" >> "$LOG_FILE"
}

log "Health check triggered"
exit 0
