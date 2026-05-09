#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Control Hub — deploy implementation (sourced by application/ch-deploy.sh)
#
# Expects exports from ch-deploy.sh:
#   CH_APPLICATION_DIR  scripts/application
#   CH_SCRIPTS_ROOT       scripts/
#   CH_APP_DIR            repository root (Next.js app)
# ═══════════════════════════════════════════════════════════════

ch_deploy_usage() {
  echo "Usage: bash scripts/application/ch-deploy.sh update [--restart-only] [--branch NAME]" >&2
  echo "       bash scripts/application/ch-deploy.sh restart" >&2
  echo "       bash scripts/application/ch-deploy.sh rebuild [--branch NAME]" >&2
}

# shellcheck source=ch-dotenv-local.sh
source "$CH_SCRIPTS_ROOT/lib/ch-dotenv-local.sh"
ch_load_control_hub_env_local "$CH_APP_DIR"

LOCK_FILE="${TMPDIR:-/tmp}/ch-deploy.lock"
LOG_FILE="$HOME/.hermes/logs/ch-update.log"

mkdir -p "$(dirname "$LOG_FILE")"

ch_deploy_log_update() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

ch_deploy_acquire_lock() {
  cleanup() {
    rm -f "$LOCK_FILE"
  }
  trap cleanup EXIT
  if [ -f "$LOCK_FILE" ]; then
    local LOCK_PID
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
      ch_deploy_log_update "ERROR: Deploy already running (PID $LOCK_PID)"
      exit 1
    fi
    ch_deploy_log_update "WARNING: Stale lock file found, removing"
    rm -f "$LOCK_FILE"
  fi
  echo $$ >"$LOCK_FILE"
}

ch_deploy_cmd_restart() {
  local APP_DIR="$CH_APP_DIR"
  local LOG_FILE_RESTART="$HOME/.hermes/logs/ch-restart.log"
  local PID_FILE="$HOME/.hermes/logs/ch-server.pid"

  mkdir -p "$(dirname "$LOG_FILE_RESTART")"

  log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE_RESTART"
  }

  cd "$APP_DIR"

  local CH_PORT_FILE=""
  if [ -z "${PORT:-}" ] && [ -f "$APP_DIR/.env.local" ]; then
    CH_PORT_FILE="$(grep -E '^PORT=' "$APP_DIR/.env.local" | tail -n1 | sed 's/^PORT=//' | tr -d '\r')"
  fi
  local PORT="${PORT:-${CH_PORT_FILE:-3000}}"
  local HOST="${HOST:-0.0.0.0}"

  export CH_ENABLE_DEPLOY_API="${CH_ENABLE_DEPLOY_API:-true}"

  local NODE_BIN
  NODE_BIN="$(which node 2>/dev/null || echo "$HOME/.local/bin/node")"
  local NPM_BIN
  NPM_BIN="$(which npm 2>/dev/null || echo "$HOME/.local/bin/npm")"

  if [ ! -x "$NODE_BIN" ]; then
    log "ERROR: node not found at $NODE_BIN — cannot start server"
    exit 1
  fi

  export PATH="$(dirname "$NODE_BIN"):$(dirname "$NPM_BIN"):$PATH"

  log "Stopping server on port $PORT..."
  stop_port() {
    local p="$1"
    if command -v fuser &>/dev/null; then
      fuser -k "${p}/tcp" 2>/dev/null || true
    elif command -v lsof &>/dev/null; then
      local pid
      for pid in $(lsof -ti:"$p" 2>/dev/null); do
        kill -9 "$pid" 2>/dev/null || true
      done
    else
      log "WARNING: install psmisc (fuser) or lsof to free port $p"
    fi
  }
  stop_port "$PORT"
  sleep 2

  rm -f "$PID_FILE"

  log "Starting server on $HOST:$PORT..."
  CH_ENABLE_DEPLOY_API=true \
    "$NODE_BIN" node_modules/next/dist/bin/next start -p "$PORT" -H "$HOST" \
      >>"$LOG_FILE_RESTART" 2>&1 &
  local SERVER_PID=$!
  echo "$SERVER_PID" >"$PID_FILE"
  log "Server started (PID $SERVER_PID)"

  local i
  for i in $(seq 1 15); do
    if curl -s -o /dev/null -w '' "http://127.0.0.1:${PORT}" 2>/dev/null; then
      log "Server is ready on http://127.0.0.1:${PORT}"
      exit 0
    fi
    sleep 1
  done

  log "WARNING: Server may not be ready yet (timeout after 15s)"
  exit 0
}

ch_deploy_cmd_rebuild() {
  local CH_BRANCH="${CH_DEPLOY_BRANCH:-${CH_UPDATE_GIT_BRANCH:-dev}}"
  local APP_DIR="$CH_APP_DIR"
  local LOG_FILE_RESTART="$HOME/.hermes/logs/ch-restart.log"
  local BUILD_LOG="$HOME/.hermes/logs/ch-build.log"

  mkdir -p "$(dirname "$LOG_FILE_RESTART")"

  log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE_RESTART"
  }

  cd "$APP_DIR"

  if [ -n "$CH_BRANCH" ]; then
    log "Checking out branch: $CH_BRANCH"
    git fetch origin "$CH_BRANCH" --quiet 2>>"$LOG_FILE_RESTART" || true
    git checkout "$CH_BRANCH" --quiet 2>>"$LOG_FILE_RESTART" || true
  fi

  local NODE_BIN
  NODE_BIN="$(which node 2>/dev/null || echo "$HOME/.local/bin/node")"
  local NPM_BIN
  NPM_BIN="$(which npm 2>/dev/null || echo "$HOME/.local/bin/npm")"

  if [ ! -x "$NPM_BIN" ]; then
    log "ERROR: npm not found at $NPM_BIN — cannot build"
    exit 1
  fi

  export PATH="$(dirname "$NODE_BIN"):$(dirname "$NPM_BIN"):$PATH"

  log "Build started (npm=$(which npm), node=$(which node))..."
  "$NPM_BIN" run build >>"$BUILD_LOG" 2>&1
  log "Build complete."
  log "Restarting server..."
  ch_deploy_cmd_restart
}

ch_deploy_run_update() {
  local RESTART_ONLY="${CH_DEPLOY_RESTART_ONLY:-false}"
  local CH_BRANCH="${CH_DEPLOY_BRANCH:-${CH_UPDATE_GIT_BRANCH:-dev}}"
  local APP_DIR="$CH_APP_DIR"
  local SCRIPT_DIR="$CH_SCRIPTS_ROOT"

  ch_deploy_acquire_lock

  cd "$APP_DIR"

  local NODE_BIN
  NODE_BIN="$(which node 2>/dev/null || echo "$HOME/.local/bin/node")"
  local NPM_BIN
  NPM_BIN="$(which npm 2>/dev/null || echo "$HOME/.local/bin/npm")"

  if [ ! -x "$NPM_BIN" ]; then
    ch_deploy_log_update "ERROR: npm not found at $NPM_BIN — cannot build"
    exit 1
  fi

  export PATH="$(dirname "$NODE_BIN"):$(dirname "$NPM_BIN"):$PATH"

  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    ch_deploy_log_update "ERROR: $APP_DIR is not a git repository — cannot update"
    exit 1
  fi

  if [ "$RESTART_ONLY" = false ]; then
    ch_deploy_log_update "Fetching latest from origin/${CH_BRANCH}..."
    git fetch origin "$CH_BRANCH" --quiet 2>>"$LOG_FILE"

    ch_deploy_log_update "Checking out ${CH_BRANCH} branch..."
    git checkout "$CH_BRANCH" --quiet 2>>"$LOG_FILE"

    ch_deploy_log_update "Resetting to origin/${CH_BRANCH}..."
    git reset --hard "origin/${CH_BRANCH}" --quiet 2>>"$LOG_FILE"

    ch_deploy_log_update "Code updated to $(git rev-parse --short HEAD)"

    if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "package-lock.json\|package.json"; then
      ch_deploy_log_update "package.json changed — running npm install..."
      "$NPM_BIN" install --prefer-offline 2>>"$LOG_FILE"
      ch_deploy_log_update "Dependencies installed"
    else
      ch_deploy_log_update "No dependency changes — skipping npm install"
    fi

    ch_deploy_log_update "Building production bundle..."
    if ! "$NPM_BIN" run build >>"$LOG_FILE" 2>&1; then
      ch_deploy_log_update "ERROR: Build failed — aborting deploy"
      exit 1
    fi
    ch_deploy_log_update "Build successful"

    # shellcheck source=ch-hermes-profile-templates.sh
    source "$SCRIPT_DIR/lib/ch-hermes-profile-templates.sh"

    local sync_profiles=false
    case "${CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES:-}" in
      no | NO | 0 | false | False)
        ch_deploy_log_update "Skipping Hermes bundled profile sync (CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES=no)"
        ;;
      yes | YES | 1 | true | True)
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
            ch_deploy_log_update "Skipping Hermes bundled profile sync (declined at prompt)"
          fi
        else
          sync_profiles=true
        fi
        ;;
    esac

    if [ "$sync_profiles" = true ]; then
      ch_profiles_log() { ch_deploy_log_update "$*"; }
      ch_deploy_log_update "Updating bundled Hermes agent profiles from templates..."
      ch_bundled_profiles_sync "$APP_DIR"
      ch_deploy_log_update "Bundled Hermes agent profiles updated"
    fi
  fi

  local HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
  if command -v hermes &>/dev/null && [ -f "$HERMES_HOME/.env" ]; then
    if ! grep -q "API_SERVER_ENABLED=true" "$HERMES_HOME/.env" 2>/dev/null; then
      ch_deploy_log_update "Enabling API_SERVER_ENABLED=true in ~/.hermes/.env for Story Weaver..."
      echo "" >>"$HERMES_HOME/.env"
      echo "# Enable API server for Control Hub Rec Room (added by ch-deploy)" >>"$HERMES_HOME/.env"
      echo "API_SERVER_ENABLED=true" >>"$HERMES_HOME/.env"
    fi
    ch_deploy_log_update "Restarting Hermes gateway..."
    if hermes gateway stop 2>/dev/null; then
      hermes gateway start 2>/dev/null || ch_deploy_log_update "WARNING: Gateway start failed — restart manually"
    else
      ch_deploy_log_update "WARNING: Could not stop gateway — restart manually if needed"
    fi
  fi

  local CH_DATA_ROOT="${CH_DATA_DIR:-$HOME/control-hub/data}"
  mkdir -p "$CH_DATA_ROOT/scripts" "$CH_DATA_ROOT/logs"
  if command -v node &>/dev/null; then
    CH_DATA_DIR="$CH_DATA_ROOT" node "$CH_SCRIPTS_ROOT/tooling/discover-agents.mjs" >>"$LOG_FILE" 2>&1 ||
      ch_deploy_log_update "WARNING: discover-agents.mjs failed"
  fi

  ch_deploy_log_update "Restarting server..."
  ch_deploy_cmd_restart
  ch_deploy_log_update "Update complete"
}

ch_deploy_dispatch_update() {
  CH_DEPLOY_RESTART_ONLY=false
  CH_DEPLOY_BRANCH="${CH_UPDATE_GIT_BRANCH:-dev}"
  while [ "${1:-}" ]; do
    case "${1}" in
      --restart-only) CH_DEPLOY_RESTART_ONLY=true ; shift ;;
      --branch)
        CH_DEPLOY_BRANCH="${2:-}"
        shift 2
        ;;
      *) shift ;;
    esac
  done
  ch_deploy_run_update
}

ch_deploy_dispatch_rebuild() {
  CH_DEPLOY_BRANCH="${CH_UPDATE_GIT_BRANCH:-dev}"
  while [ "${1:-}" ]; do
    case "${1}" in
      --branch)
        CH_DEPLOY_BRANCH="${2:-}"
        shift 2
        ;;
      *) shift ;;
    esac
  done
  ch_deploy_cmd_rebuild
}

ch_deploy_main() {
  local sub="${1:-}"
  shift || true
  case "$sub" in
    update) ch_deploy_dispatch_update "$@" ;;
    restart) ch_deploy_cmd_restart ;;
    rebuild) ch_deploy_dispatch_rebuild "$@" ;;
    "" | -h | --help)
      ch_deploy_usage
      exit 1
      ;;
    *)
      echo "Unknown subcommand: $sub" >&2
      ch_deploy_usage
      exit 1
      ;;
  esac
}
