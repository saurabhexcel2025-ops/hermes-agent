#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Control Hub — Deploy Script
# ═══════════════════════════════════════════════════════════════
# Safely pulls latest code from origin (default branch dev), rebuilds, and restarts.
#
# Usage:
#   bash scripts/update.sh [--restart-only]
#
# Environment (.env.local keys CH_* / HERMES_HOME / INSTALL_HERMES_* are loaded when present):
#   CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES=yes — overwrite bundled Hermes profile SOUL.md/AGENTS.md from repo (no prompt)
#   CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES=no  — skip Hermes profile sync entirely
#   unset + interactive TTY — prompt before syncing bundled profiles; decline skips sync only (deploy continues)
#   unset + non-TTY (e.g. API deploy) — sync bundled profiles (backward compatible)
#
# This script is designed to be called by the update API endpoint.
# It handles: git pull, npm install, build, and restart.
#
# Safety:
#   - Lock file prevents concurrent deploys
#   - Build failure aborts without restart
#   - Atomic git operations (reset --hard origin/$CH_UPDATE_GIT_BRANCH)
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Load CH_UPDATE_GIT_BRANCH / HERMES_HOME / profile sync flags from .env.local before parsing args.
# shellcheck source=lib/ch-dotenv-local.sh
source "$SCRIPT_DIR/lib/ch-dotenv-local.sh"
ch_load_control_hub_env_local "$APP_DIR"

LOCK_FILE="${TMPDIR:-/tmp}/ch-deploy.lock"
LOG_FILE="$HOME/.hermes/logs/ch-update.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ── Lock Guard ────────────────────────────────────────────────
cleanup() {
    rm -f "$LOCK_FILE"
}
trap cleanup EXIT

if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        log "ERROR: Deploy already running (PID $LOCK_PID)"
        exit 1
    fi
    log "WARNING: Stale lock file found, removing"
    rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"

# ── Parse Arguments ──────────────────────────────────────────
RESTART_ONLY=false
CH_BRANCH="${CH_UPDATE_GIT_BRANCH:-dev}"
while [ "${1:-}" ]; do
    case "${1}" in
        --restart-only) RESTART_ONLY=true; shift ;;
        --branch)       CH_BRANCH="${2:-}"; shift 2 ;;
        *)              shift ;;
    esac
done

cd "$APP_DIR"

# Resolve full paths using which (more reliable than command -v)
NODE_BIN="$(which node 2>/dev/null || echo "$HOME/.local/bin/node")"
NPM_BIN="$(which npm 2>/dev/null || echo "$HOME/.local/bin/npm")"

# Verify binaries exist before proceeding
if [ ! -x "$NPM_BIN" ]; then
    log "ERROR: npm not found at $NPM_BIN — cannot build"
    exit 1
fi

# Add node/npm bin directories to PATH
export PATH="$(dirname "$NODE_BIN"):$(dirname "$NPM_BIN"):$PATH"

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    log "ERROR: $APP_DIR is not a git repository — cannot update"
    exit 1
fi

# ── Git Update ───────────────────────────────────────────────
if [ "$RESTART_ONLY" = false ]; then
    log "Fetching latest from origin/${CH_BRANCH}..."
    git fetch origin "$CH_BRANCH" --quiet 2>>"$LOG_FILE"

    log "Checking out ${CH_BRANCH} branch..."
    git checkout "$CH_BRANCH" --quiet 2>>"$LOG_FILE"

    log "Resetting to origin/${CH_BRANCH}..."
    git reset --hard "origin/${CH_BRANCH}" --quiet 2>>"$LOG_FILE"

    log "Code updated to $(git rev-parse --short HEAD)"

    # ── Dependencies ───────────────────────────────────────────
    if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "package-lock.json\|package.json"; then
        log "package.json changed — running npm install..."
        "$NPM_BIN" install --prefer-offline 2>>"$LOG_FILE"
        log "Dependencies installed"
    else
        log "No dependency changes — skipping npm install"
    fi

    # ── Build ──────────────────────────────────────────────────
    log "Building production bundle..."
    if ! "$NPM_BIN" run build >>"$LOG_FILE" 2>&1; then
        log "ERROR: Build failed — aborting deploy"
        exit 1
    fi
    log "Build successful"

    # ── Bundled Hermes profile templates (optional / gated) ─────
    # shellcheck source=lib/ch-hermes-profile-templates.sh
    source "$SCRIPT_DIR/lib/ch-hermes-profile-templates.sh"

    sync_profiles=false
    case "${CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES:-}" in
        no|NO|0|false|False)
            log "Skipping Hermes bundled profile sync (CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES=no)"
            ;;
        yes|YES|1|true|True)
            sync_profiles=true
            ;;
        *)
            if [ -t 0 ]; then
                echo ""
                echo "Control Hub update: refresh bundled Hermes profiles?" >&2
                echo "" >&2
                echo "  This replaces SOUL.md and AGENTS.md only for Control Hub's bundled profiles" >&2
                echo "  (e.g. qa-engineer, devops-engineer, swe-engineer, and related defaults)." >&2
                echo "  Any other profiles you created yourself are not touched." >&2
                echo "" >&2
                echo "  If you edited those bundled files, save or commit your changes first — they will be overwritten." >&2
                echo "" >&2
                read -r -p "Sync bundled profile templates now? [y/N]: " REPLY_SYNC_PROFILES
                echo ""
                if [[ "$REPLY_SYNC_PROFILES" =~ ^[Yy]$ ]]; then
                    sync_profiles=true
                else
                    log "Skipping Hermes bundled profile sync (declined at prompt)"
                fi
            else
                sync_profiles=true
            fi
            ;;
    esac

    if [ "$sync_profiles" = true ]; then
        ch_profiles_log() { log "$*"; }
        log "Updating bundled Hermes agent profiles from templates..."
        ch_bundled_profiles_sync "$APP_DIR"
        log "Bundled Hermes agent profiles updated"
    fi
fi

# ── Ensure Hermes Gateway API Server is enabled ─────────────────
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
if command -v hermes &>/dev/null && [ -f "$HERMES_HOME/.env" ]; then
    if ! grep -q "API_SERVER_ENABLED=true" "$HERMES_HOME/.env" 2>/dev/null; then
        log "Enabling API_SERVER_ENABLED=true in ~/.hermes/.env for Story Weaver..."
        echo "" >> "$HERMES_HOME/.env"
        echo "# Enable API server for Control Hub Rec Room (added by update.sh)" >> "$HERMES_HOME/.env"
        echo "API_SERVER_ENABLED=true" >> "$HERMES_HOME/.env"
    fi
    # Restart gateway so the setting takes effect
    log "Restarting Hermes gateway..."
    if hermes gateway stop 2>/dev/null; then
        hermes gateway start 2>/dev/null || log "WARNING: Gateway start failed — restart manually"
    else
        log "WARNING: Could not stop gateway — restart manually if needed"
    fi
fi

# ── Discover local Hermes installs ───────────────────────────
CH_DATA_ROOT="${CH_DATA_DIR:-$HOME/control-hub/data}"
mkdir -p "$CH_DATA_ROOT/scripts" "$CH_DATA_ROOT/logs"
if command -v node &>/dev/null; then
    CH_DATA_DIR="$CH_DATA_ROOT" node "$APP_DIR/scripts/discover-agents.mjs" >>"$LOG_FILE" 2>&1 || log "WARNING: discover-agents.mjs failed"
fi

# ── Restart Server ────────────────────────────────────────────
log "Restarting server..."
bash "$SCRIPT_DIR/restart.sh"
log "Update complete"
