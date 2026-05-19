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

# shellcheck source=ch-port.sh
source "$CH_SCRIPTS_ROOT/lib/ch-port.sh"

# shellcheck source=ch-env.sh
source "$CH_SCRIPTS_ROOT/lib/ch-env.sh"

# shellcheck source=ch-deploy-status.sh
source "$CH_SCRIPTS_ROOT/lib/ch-deploy-status.sh"

LOCK_FILE="${TMPDIR:-/tmp}/ch-deploy.lock"
LOG_FILE="$HOME/.hermes/logs/ch-update.log"
CH_RESTART_LOG="$HOME/.hermes/logs/ch-restart.log"
CH_BUILD_LOG="$HOME/.hermes/logs/ch-build.log"

mkdir -p "$(dirname "$LOG_FILE")"

ch_deploy_log_update() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

ch_deploy_log_restart() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$CH_RESTART_LOG"
}

ch_deploy_log_both() {
  ch_deploy_log_update "$@"
  ch_deploy_log_restart "$@"
}

# Kill every PID ss reports listening on TCP port $1 (multiple socat / fork).
ch_deploy_kill_tcp_listeners_on_port() {
  local port="$1"
  local p
  for p in $(ss -tlnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u); do
    kill -9 "$p" 2>/dev/null || true
  done
}

ch_deploy_acquire_lock() {
  exec 200>"$LOCK_FILE"
  if ! flock -n 200; then
    local LOCK_PID
    LOCK_PID=$(fuser "$LOCK_FILE" 2>/dev/null | head -1 || echo "")
    if [ -n "$LOCK_PID" ]; then
      ch_deploy_log_both "ERROR: Deploy already running (PID $LOCK_PID)"
    else
      ch_deploy_log_both "ERROR: Could not acquire deploy lock"
    fi
    return 1
  fi
  return 0
}

ch_deploy_release_lock() {
  flock -u 200 2>/dev/null || true
  exec 200>&- 2>/dev/null || true
}

ch_deploy_fail() {
  local action="$1"
  local phase="$2"
  local message="$3"
  local exit_code="${4:-1}"
  local log_hint="${5:-ch-restart.log}"
  ch_deploy_status_write "failed" "$action" "$phase" "$message" "$exit_code" "$log_hint"
  ch_deploy_log_both "ERROR: $message"
  ch_deploy_release_lock
  exit "$exit_code"
}

ch_deploy_resolve_tooling() {
  NODE_BIN="$(which node 2>/dev/null || echo "$HOME/.local/bin/node")"
  NPM_BIN="$(which npm 2>/dev/null || echo "$HOME/.local/bin/npm")"
  if [ ! -x "$NPM_BIN" ]; then
    return 1
  fi
  export PATH="$(dirname "$NODE_BIN"):$(dirname "$NPM_BIN"):$PATH"
  return 0
}

ch_deploy_npm_install_if_needed() {
  local action="$1"
  local lock="$CH_APP_DIR/package-lock.json"
  local marker="$CH_APP_DIR/.next/BUILD_ID"
  local need=0

  if [ -f "$lock" ]; then
    if [ ! -f "$marker" ] || [ "$lock" -nt "$marker" ]; then
      need=1
    fi
  fi

  if [ "$need" -eq 0 ]; then
    return 0
  fi

  ch_deploy_status_write "running" "$action" "install" "Installing dependencies…" "" ""
  ch_deploy_log_restart "package-lock.json newer than build — running npm install…"
  if ! "$NPM_BIN" install --prefer-offline >>"$CH_BUILD_LOG" 2>&1; then
    ch_deploy_fail "$action" "install" "npm install failed — see ch-build.log" 1 "ch-build.log"
  fi
  ch_deploy_log_restart "Dependencies installed"
}

ch_deploy_run_build() {
  local action="$1"
  ch_deploy_status_write "running" "$action" "build" "Building production bundle…" "" "ch-build.log"
  ch_deploy_log_restart "Build started (npm=$(which npm), node=$(which node))…"
  if ! "$NPM_BIN" run build >>"$CH_BUILD_LOG" 2>&1; then
    ch_deploy_fail "$action" "build" "Build failed — see ch-build.log" 1 "ch-build.log"
  fi
  ch_deploy_log_restart "Build complete."
}

# Restart next-server. Caller must hold deploy lock; lock is released before server spawn.
ch_deploy_do_restart_body() {
  cd "$CH_APP_DIR"

  local PID_FILE="$HOME/.hermes/logs/ch-server.pid"
  local SOCAT_PID_FILE="$HOME/.hermes/logs/ch-socat.pid"

  ch_deploy_log_restart "Restarting server…"

  local ENV_PORT=""
  if [ -f "$CH_APP_DIR/.env.local" ]; then
    ENV_PORT="$(grep -E '^PORT=' "$CH_APP_DIR/.env.local" | tail -n1 | sed 's/^PORT=//' | tr -d '\r')"
  fi
  local STALE_PORT="${ENV_PORT:-42069}"
  local ZOMBIE_PIDS
  ZOMBIE_PIDS=$(ss -tlnp "sport = :$STALE_PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' || true)
  if [ -n "$ZOMBIE_PIDS" ]; then
    for zp in $ZOMBIE_PIDS; do
      if kill -0 "$zp" 2>/dev/null; then
        ch_deploy_log_restart "Killing stale next-server on port $STALE_PORT (PID $zp)…"
        kill -9 "$zp" 2>/dev/null || true
      fi
    done
    sleep 1
  fi

  local OLD_SOCAT_PID
  OLD_SOCAT_PID=$(cat "$SOCAT_PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_SOCAT_PID" ] && kill -0 "$OLD_SOCAT_PID" 2>/dev/null; then
    ch_deploy_log_restart "Stopping old socat relay (PID $OLD_SOCAT_PID)…"
    kill -9 "$OLD_SOCAT_PID" 2>/dev/null || true
    sleep 1
  fi
  local RELAY_PORT="${CH_SOCAT_RELAY_PORT:-42069}"
  ch_deploy_log_restart "Stopping all listeners on relay port ${RELAY_PORT}…"
  ch_deploy_kill_tcp_listeners_on_port "$RELAY_PORT"
  sleep 1

  local PORT="42069"
  while ch_tcp_port_in_use "$PORT" 2>/dev/null; do
    local BLOCKER_PIDS
    BLOCKER_PIDS=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' || true)
    if [ -n "$BLOCKER_PIDS" ]; then
      for p in $BLOCKER_PIDS; do
        if kill -0 "$p" 2>/dev/null; then
          ch_deploy_log_restart "Port $PORT held by PID $p — killing…"
          kill -9 "$p" 2>/dev/null || true
        fi
      done
      sleep 2
    fi
    if ch_tcp_port_in_use "$PORT" 2>/dev/null; then
      ch_deploy_log_restart "Port $PORT still in use — trying next port…"
      PORT=$((PORT + 1))
      if [ "$PORT" -gt 42100 ]; then
        ch_deploy_log_restart "ERROR: No free port in 42069–42100"
        return 1
      fi
    fi
  done
  [ "$PORT" != "42069" ] && ch_deploy_log_restart "Port 42069 unavailable — using $PORT"

  if [ -f "$CH_APP_DIR/.env.local" ]; then
    if grep -q '^PORT=' "$CH_APP_DIR/.env.local" 2>/dev/null; then
      sed -i "s/^PORT=.*/PORT=$PORT/" "$CH_APP_DIR/.env.local"
    else
      echo "PORT=$PORT" >>"$CH_APP_DIR/.env.local"
    fi
  fi

  if [ -f "$PID_FILE" ]; then
    local OLD_SERVER_PID
    OLD_SERVER_PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$OLD_SERVER_PID" ] && kill -0 "$OLD_SERVER_PID" 2>/dev/null; then
      ch_deploy_log_restart "Stopping old next-server (PID $OLD_SERVER_PID)…"
      kill -9 "$OLD_SERVER_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    sleep 1
  fi

  local use_relay=0
  local relay_listen
  case "${CH_SOCAT_RELAY:-}" in 1 | yes | YES | true | True) use_relay=1 ;; esac
  if [ -n "${CH_SOCAT_BIND:-}" ]; then
    use_relay=1
  fi
  local HOST
  if [ "$use_relay" -eq 1 ]; then
    HOST="${CH_NEXT_BIND_HOST:-127.0.0.1}"
    relay_listen="${CH_SOCAT_BIND:-0.0.0.0}"
  else
    HOST="${CH_NEXT_BIND_HOST:-0.0.0.0}"
  fi
  export CH_ENABLE_DEPLOY_API="${CH_ENABLE_DEPLOY_API:-true}"

  ch_deploy_log_restart "Starting next-server on $HOST:$PORT…"
  rm -f "$PID_FILE"
  ch_deploy_release_lock
  nohup "$NODE_BIN" node_modules/next/dist/bin/next start -p "$PORT" -H "$HOST" \
    >>"$CH_RESTART_LOG" 2>&1 </dev/null &
  local SERVER_PID=$!
  echo "$SERVER_PID" >"$PID_FILE"
  ch_deploy_log_restart "Server started (PID $SERVER_PID)"

  local i ready=0
  for i in $(seq 1 20); do
    if curl -s -o /dev/null -w '' "http://127.0.0.1:${PORT}" 2>/dev/null; then
      ch_deploy_log_restart "Server is ready on http://127.0.0.1:${PORT}"
      ready=1
      break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      ch_deploy_log_restart "ERROR: next-server died during startup"
      return 1
    fi
    sleep 1
  done

  if [ "$ready" -ne 1 ]; then
    ch_deploy_log_restart "ERROR: Server did not become ready in time"
    return 1
  fi

  if [ "$use_relay" -eq 1 ]; then
    ch_deploy_log_restart "Starting socat relay on ${relay_listen}:${RELAY_PORT} → 127.0.0.1:$PORT…"
    nohup /usr/bin/socat TCP-LISTEN:"$RELAY_PORT",fork,reuseaddr,bind="${relay_listen}" TCP:127.0.0.1:"$PORT" \
      >>"$CH_RESTART_LOG" 2>&1 </dev/null &
    local SOCAT_PID=$!
    echo "$SOCAT_PID" >"$SOCAT_PID_FILE"
    ch_deploy_log_restart "socat relay started (PID $SOCAT_PID)"
    sleep 1
    if ss -tlnp "sport = :$RELAY_PORT" 2>/dev/null | grep -q LISTEN; then
      ch_deploy_log_restart "Relay active: ${relay_listen}:${RELAY_PORT} → 127.0.0.1:$PORT"
    else
      ch_deploy_log_restart "WARNING: socat relay may not have started correctly"
    fi
  else
    rm -f "$SOCAT_PID_FILE"
  fi

  ch_deploy_log_restart "Restart complete."
  sleep 2
  return 0
}

ch_deploy_cmd_restart() {
  if ! ch_deploy_acquire_lock; then
    ch_deploy_fail "restart" "lock" "Deploy already in progress" 1 "ch-restart.log"
  fi
  ch_deploy_status_write "running" "restart" "restart" "Restarting server…" "" "ch-restart.log"
  if ! ch_deploy_resolve_tooling; then
    ch_deploy_fail "restart" "restart" "npm not found — cannot restart" 1 "ch-restart.log"
  fi
  if ! ch_deploy_do_restart_body; then
    ch_deploy_fail "restart" "restart" "Restart failed — see ch-restart.log" 1 "ch-restart.log"
  fi
  ch_deploy_status_write "success" "restart" "done" "Restart complete" 0 "ch-restart.log"
  exit 0
}

ch_deploy_cmd_rebuild() {
  local CH_BRANCH="${CH_DEPLOY_BRANCH:-}"

  if ! ch_deploy_acquire_lock; then
    ch_deploy_fail "rebuild" "lock" "Deploy already in progress" 1 "ch-restart.log"
  fi

  ch_deploy_status_write "running" "rebuild" "build" "Rebuild started…" "" "ch-build.log"
  cd "$CH_APP_DIR"

  if ! ch_deploy_resolve_tooling; then
    ch_deploy_fail "rebuild" "build" "npm not found — cannot build" 1 "ch-build.log"
  fi

  if [ -n "$CH_BRANCH" ]; then
    local current_branch
    current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
    if [ -n "$current_branch" ] && [ "$current_branch" != "$CH_BRANCH" ]; then
      ch_deploy_status_write "running" "rebuild" "git" "Checking out $CH_BRANCH…" "" ""
      ch_deploy_log_restart "Checking out branch: $CH_BRANCH"
      if ! git checkout "$CH_BRANCH" --quiet 2>>"$CH_RESTART_LOG"; then
        ch_deploy_fail "rebuild" "git" "Branch '$CH_BRANCH' not found locally" 1 "ch-restart.log"
      fi
    fi
  fi

  ch_deploy_npm_install_if_needed "rebuild"
  ch_deploy_run_build "rebuild"

  ch_deploy_status_write "running" "rebuild" "restart" "Restarting server…" "" "ch-restart.log"
  if ! ch_deploy_do_restart_body; then
    ch_deploy_fail "rebuild" "restart" "Restart failed after build — see ch-restart.log" 1 "ch-restart.log"
  fi

  ch_deploy_status_write "success" "rebuild" "done" "Rebuild complete" 0 "ch-restart.log"
  exit 0
}

ch_deploy_run_update() {
  local RESTART_ONLY="${CH_DEPLOY_RESTART_ONLY:-false}"
  local CH_BRANCH="${CH_DEPLOY_BRANCH:-${CH_UPDATE_GIT_BRANCH:-dev}}"
  local APP_DIR="$CH_APP_DIR"
  local SCRIPT_DIR="$CH_SCRIPTS_ROOT"

  if ! ch_deploy_acquire_lock; then
    ch_deploy_fail "update" "lock" "Deploy already in progress" 1 "ch-update.log"
  fi

  ch_deploy_status_write "running" "update" "git" "Update started…" "" "ch-update.log"
  cd "$APP_DIR"

  if ! ch_deploy_resolve_tooling; then
    ch_deploy_fail "update" "git" "npm not found — cannot update" 1 "ch-update.log"
  fi

  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    ch_deploy_fail "update" "git" "$APP_DIR is not a git repository" 1 "ch-update.log"
  fi

  if [ "$RESTART_ONLY" = false ]; then
    ch_deploy_log_update "Fetching latest from origin/${CH_BRANCH}…"
    git fetch origin "$CH_BRANCH" --quiet 2>>"$LOG_FILE"

    ch_deploy_log_update "Checking out ${CH_BRANCH} branch…"
    git checkout "$CH_BRANCH" --quiet 2>>"$LOG_FILE"

    ch_deploy_log_update "Resetting to origin/${CH_BRANCH}…"
    git reset --hard "origin/${CH_BRANCH}" --quiet 2>>"$LOG_FILE"

    ch_deploy_log_update "Code updated to $(git rev-parse --short HEAD)"

    if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "package-lock.json\|package.json"; then
      ch_deploy_status_write "running" "update" "install" "Installing dependencies…" "" "ch-update.log"
      ch_deploy_log_update "package.json changed — running npm install…"
      if ! "$NPM_BIN" install --prefer-offline 2>>"$LOG_FILE"; then
        ch_deploy_fail "update" "install" "npm install failed — see ch-update.log" 1 "ch-update.log"
      fi
      ch_deploy_log_update "Dependencies installed"
    else
      ch_deploy_log_update "No dependency changes — skipping npm install"
    fi

    ch_deploy_status_write "running" "update" "build" "Building production bundle…" "" "ch-update.log"
    ch_deploy_log_update "Building production bundle…"
    if ! "$NPM_BIN" run build >>"$LOG_FILE" 2>&1; then
      ch_deploy_fail "update" "build" "Build failed — see ch-update.log" 1 "ch-update.log"
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
      ch_deploy_log_update "Updating bundled Hermes agent profiles from templates…"
      ch_bundled_profiles_sync "$APP_DIR"
      ch_deploy_log_update "Bundled Hermes agent profiles updated"
    fi
  fi

  local HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
  if command -v hermes &>/dev/null && [ -f "$HERMES_HOME/.env" ]; then
    if ! grep -q "API_SERVER_ENABLED=true" "$HERMES_HOME/.env" 2>/dev/null; then
      ch_deploy_log_update "Enabling API_SERVER_ENABLED=true in ~/.hermes/.env for Story Weaver…"
      echo "" >>"$HERMES_HOME/.env"
      echo "# Enable API server for Control Hub Rec Room (added by ch-deploy)" >>"$HERMES_HOME/.env"
      echo "API_SERVER_ENABLED=true" >>"$HERMES_HOME/.env"
    fi
    ch_deploy_log_update "Restarting Hermes gateway…"
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

  ch_deploy_status_write "running" "update" "restart" "Restarting server…" "" "ch-restart.log"
  ch_deploy_log_update "Restarting server…"
  if ! ch_deploy_do_restart_body; then
    ch_deploy_fail "update" "restart" "Restart failed — see ch-restart.log" 1 "ch-restart.log"
  fi

  ch_deploy_status_write "success" "update" "done" "Update complete" 0 "ch-update.log"
  ch_deploy_log_update "Update complete"
  exit 0
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
  CH_DEPLOY_BRANCH=""
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
