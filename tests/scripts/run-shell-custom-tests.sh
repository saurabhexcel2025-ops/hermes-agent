#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Validates scripts/lib/ch-dotenv-local.sh and ch-hermes-profile-templates.sh
# plus the CH_UPDATE_SYNC_* decision logic (mirror of scripts/lib/ch-deploy-impl.sh).
#
# Safe: uses mktemp fake HERMES_HOME only.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TESTS_RUN=0
TESTS_FAIL=0
TMP_ENV=""
FAKE_HOME=""

pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  echo "  OK: $*"
}

fail() {
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_FAIL=$((TESTS_FAIL + 1))
  echo "  FAIL: $*" >&2
}

cleanup() {
  rm -rf "${TMP_ENV:-}" "${FAKE_HOME:-}" 2>/dev/null || true
}
trap cleanup EXIT

report() {
  echo ""
  echo "Shell custom tests: $TESTS_RUN run, $TESTS_FAIL failed"
  [ "$TESTS_FAIL" -eq 0 ]
}

echo "== Repo root: $REPO_ROOT"

# ── dotenv loader ───────────────────────────────────────────────
echo ""
echo "== ch-dotenv-local.sh"

TMP_ENV=$(mktemp -d)
mkdir -p "$TMP_ENV"
printf '%s\n' \
  '# comment' \
  'FOO=ignored' \
  'CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES=no' \
  'HERMES_HOME=/tmp/from-dotenv' \
  'INSTALL_HERMES_PROFILE_TEMPLATES=yes' \
  'CH_DATA_DIR=/tmp/chdata' \
  >"$TMP_ENV/.env.local"

# shellcheck source=../../scripts/lib/ch-dotenv-local.sh
source "$REPO_ROOT/scripts/lib/ch-dotenv-local.sh"

unset CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES HERMES_HOME INSTALL_HERMES_PROFILE_TEMPLATES CH_DATA_DIR CH_READ_ONLY FOO || true
ch_load_control_hub_env_local "$TMP_ENV"

[[ -z "${FOO+x}" ]] || fail "FOO should not be exported"
[[ "${CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES:-}" == "no" ]] || fail "expected CH_UPDATE_SYNC from dotenv"
[[ "${HERMES_HOME:-}" == "/tmp/from-dotenv" ]] || fail "expected HERMES_HOME from dotenv"
[[ "${INSTALL_HERMES_PROFILE_TEMPLATES:-}" == "yes" ]] || fail "expected INSTALL_HERMES_PROFILE_TEMPLATES"
[[ "${CH_DATA_DIR:-}" == "/tmp/chdata" ]] || fail "expected CH_DATA_DIR"
pass "loads whitelisted keys from .env.local"

printf '# CRLF line\r\nCH_READ_ONLY=1\r\n' >>"$TMP_ENV/.env.local"
unset CH_READ_ONLY || true
ch_load_control_hub_env_local "$TMP_ENV"
[[ "${CH_READ_ONLY:-}" == "1" ]] || fail "CRLF strip for CH_READ_ONLY"
pass "strips CR on keys"

rm -rf "$TMP_ENV"
TMP_ENV=""

# ── eval_sync_gate — MUST match ch-deploy-impl.sh gate ──────────
echo ""
echo "== update profile sync gate (mirror of ch-deploy update)"

eval_sync_gate() {
  local sync_profiles=false
  case "${CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES:-}" in
    no|NO|0|false|False)
      ;;
    yes|YES|1|true|True)
      sync_profiles=true
      ;;
    *)
      if [ -t 0 ]; then
        read -r -p "Sync bundled profile templates now? [y/N]: " REPLY_SYNC_PROFILES || true
        echo ""
        if [[ "${REPLY_SYNC_PROFILES:-}" =~ ^[Yy]$ ]]; then
          sync_profiles=true
        fi
      else
        sync_profiles=true
      fi
      ;;
  esac
  if [ "$sync_profiles" = true ]; then
    echo yes
  else
    echo no
  fi
}

want_gate() {
  local env_exports="$1"
  local expect="$2"
  local got
  # stdin is not a TTY → unset CH_* branch matches API/non-interactive deploy behaviour.
  # Minimal env so gate sees unset CH_*; PATH required so nested bash exists (env -i clears PATH).
  got="$(env -i HOME=/tmp PATH="/usr/bin:/bin" /bin/bash -c "${env_exports}
$(declare -f eval_sync_gate)
eval_sync_gate
" </dev/null)"
  got="$(echo "$got" | tail -n1 | tr -d '\r')"
  if [[ "$got" != "$expect" ]]; then
    fail "gate want=$expect got='$got' (exports: ${env_exports//$'\n'/; })"
  else
    pass "gate → $expect"
  fi
}

unset CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES || true
want_gate "export CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES=no" "no"
want_gate "export CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES=yes" "yes"
want_gate "export CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES=YES" "yes"
want_gate "" "yes"

# ── Hermes profile library ────────────────────────────────────
echo ""
echo "== ch-hermes-profile-templates.sh"

FAKE_HOME=$(mktemp -d)

export HOME="$FAKE_HOME"
export HERMES_HOME="$FAKE_HOME/hermes"
mkdir -p "$HERMES_HOME/profiles"

# shellcheck source=../../scripts/lib/ch-hermes-profile-templates.sh
source "$REPO_ROOT/scripts/lib/ch-hermes-profile-templates.sh"

unset HERMES_HOME || true
ch_resolve_hermes_home
[[ "$HERMES_HOME" == "$HOME/.hermes" ]] || fail "default HERMES_HOME should be \$HOME/.hermes"
pass "ch_resolve_hermes_home defaults to \$HOME/.hermes"

export HERMES_HOME="$FAKE_HOME/hermes"
ch_resolve_hermes_home
[[ "$HERMES_HOME" == "$FAKE_HOME/hermes" ]] || fail "explicit HERMES_HOME preserved"
pass "ch_resolve_hermes_home respects env"

rm -f "$HERMES_HOME/config.yaml"
ch_resolve_hermes_home
if ch_hermes_config_present; then fail "config absent should be false"; fi
pass "ch_hermes_config_present false without config.yaml"

touch "$HERMES_HOME/config.yaml"
ch_resolve_hermes_home
ch_hermes_config_present || fail "config present should be true"
pass "ch_hermes_config_present true with config.yaml"

# Install must not overwrite existing SOUL.md
mkdir -p "$HERMES_HOME/profiles/qa-engineer"
echo 'USER_CUSTOM_SOUL' >"$HERMES_HOME/profiles/qa-engineer/SOUL.md"
printf '{}' >"$HERMES_HOME/auth.json"

ch_bundled_profiles_install "$REPO_ROOT"
[[ "$(cat "$HERMES_HOME/profiles/qa-engineer/SOUL.md")" == "USER_CUSTOM_SOUL" ]] || fail "install overwrote existing qa-engineer/SOUL.md"
pass "install preserves existing SOUL.md"

[[ -f "$HERMES_HOME/profiles/qa-engineer/AGENTS.md" ]] || fail "install should add missing AGENTS.md for qa-engineer"
grep -q "QA Engineer Agent" "$HERMES_HOME/profiles/qa-engineer/AGENTS.md" || fail "qa AGENTS content unexpected"
pass "install adds missing AGENTS.md from template"

rm -rf "$HERMES_HOME/profiles/devops-engineer"
ch_bundled_profiles_install "$REPO_ROOT"
[[ -f "$HERMES_HOME/profiles/devops-engineer/SOUL.md" ]] || fail "devops SOUL missing after install"
grep -q "DevOps specialist" "$HERMES_HOME/profiles/devops-engineer/AGENTS.md" || fail "devops AGENTS missing expected phrase"
pass "install creates missing profile dirs and copies templates"

echo 'STALE' >"$HERMES_HOME/profiles/qa-engineer/SOUL.md"
ch_bundled_profiles_sync "$REPO_ROOT"
grep -q "subject matter expert" "$HERMES_HOME/profiles/qa-engineer/SOUL.md" || fail "sync did not overwrite SOUL from template"
[[ "$(cat "$HERMES_HOME/profiles/qa-engineer/SOUL.md")" == STALE ]] && fail "sync left stale SOUL"
pass "sync overwrites SOUL.md from repo templates"

# ── ch-backup.sh (mock hindsight_bridge.py) ───────────────────
echo ""
echo "== ch-backup.sh (mock bridge)"

BKROOT="$(mktemp -d)"
mkdir -p "$BKROOT/scripts" "$BKROOT/hermes-agent" "$BKROOT/out"
cat >"$BKROOT/scripts/hindsight_bridge.py" <<'PY'
#!/usr/bin/env python3
import json
import sys

cmd = sys.argv[1] if len(sys.argv) > 1 else ""
if cmd == "list":
    print(json.dumps({"memories": [{"id": "m1", "content": "x"}], "count": 1, "total": 99}))
elif cmd == "directives":
    print(json.dumps({"directives": [{"id": "d1", "name": "n"}]}))
elif cmd == "mental-models":
    print(json.dumps({"models": [{"id": "mm1", "name": "M"}]}))
else:
    print(json.dumps({"error": "bad cmd", "cmd": cmd}))
    sys.exit(1)
PY
chmod +x "$BKROOT/scripts/hindsight_bridge.py"

HERMES_HOME="$BKROOT" \
  HINDSIGHT_BACKUP_DIR="$BKROOT/out" \
  HINDSIGHT_BACKUP_BANK="testbank" \
  HINDSIGHT_BACKUP_RETENTION_DAYS="365" \
  HINDSIGHT_BACKUP_LIMIT="10" \
  bash "$REPO_ROOT/scripts/hardware/ch-backup.sh" || fail "ch-backup.sh exited non-zero"

latest=""
latest=$(ls -t "$BKROOT/out"/testbank-*.json 2>/dev/null | head -1)
[[ -n "$latest" ]] || fail "expected testbank-*.json in backup dir"
jq -e '.bank == "testbank" and (.memories | length) == 1 and (.directives | length) == 1 and (.mental_models | length) == 1' "$latest" >/dev/null 2>&1 || fail "merged json shape unexpected: $latest"
pass "ch-backup.sh wrote valid merged snapshot"

rm -rf "$BKROOT"

# ── ch-deploy status + lock / build failure (mocked npm) ─────────
echo ""
echo "== ch-deploy rebuild status (mock npm)"

ORIG_PATH="$PATH"
FAKE_HOME=$(mktemp -d)
export HOME="$FAKE_HOME"
mkdir -p "$HOME/.hermes/logs"
export CH_DEPLOY_STATUS_FILE="$HOME/.hermes/logs/ch-deploy.status"
DEPLOY_TMP=$(mktemp -d)
export TMPDIR="$DEPLOY_TMP"
MOCK_BIN="$DEPLOY_TMP/mock-bin"
mkdir -p "$MOCK_BIN"

cat >"$MOCK_BIN/npm" <<'MOCKNPM'
#!/usr/bin/env bash
if [[ "$1" == "run" && "$2" == "build" ]]; then
  if [[ "${CH_DEPLOY_TEST_BUILD_FAIL:-}" == "1" ]]; then
    echo "mock build failed" >&2
    exit 1
  fi
  echo "mock build ok"
  exit 0
fi
if [[ "$1" == "install" ]]; then
  exit 0
fi
echo "mock npm: $*" >&2
exit 0
MOCKNPM
chmod +x "$MOCK_BIN/npm"
ln -sf "$MOCK_BIN/npm" "$MOCK_BIN/node"
export PATH="$MOCK_BIN:$ORIG_PATH"

# shellcheck source=../../scripts/lib/ch-deploy-status.sh
source "$REPO_ROOT/scripts/lib/ch-deploy-status.sh"
ch_deploy_status_write "running" "rebuild" "build" "test" "" "ch-build.log"
grep -q '^state=running' "$CH_DEPLOY_STATUS_FILE" || fail "status file missing running state"
pass "ch_deploy_status_write"

LOCK_FILE="${TMPDIR}/ch-deploy.lock"
(
  exec 200>"$LOCK_FILE"
  flock 200
  sleep 60
) &
LOCK_HOLDER=$!
sleep 0.2
set +e
bash "$REPO_ROOT/scripts/application/ch-deploy.sh" rebuild >/dev/null 2>&1
REBUILD_RC=$?
set -e
kill "$LOCK_HOLDER" 2>/dev/null || true
wait "$LOCK_HOLDER" 2>/dev/null || true

[[ "$REBUILD_RC" -eq 1 ]] || fail "rebuild should exit 1 on lock contention (got $REBUILD_RC)"
grep -q '^state=failed' "$CH_DEPLOY_STATUS_FILE" || fail "status should be failed after lock contention"
pass "rebuild exits 1 when deploy lock held"

export CH_DEPLOY_TEST_BUILD_FAIL=1
rm -f "$LOCK_FILE"
set +e
bash "$REPO_ROOT/scripts/application/ch-deploy.sh" rebuild >/dev/null 2>&1
FAIL_RC=$?
set -e
unset CH_DEPLOY_TEST_BUILD_FAIL
[[ "$FAIL_RC" -eq 1 ]] || fail "rebuild should exit 1 on build failure (got $FAIL_RC)"
grep -q '^state=failed' "$CH_DEPLOY_STATUS_FILE" || fail "status should be failed after build failure"
grep -q 'ch-build.log' "$CH_DEPLOY_STATUS_FILE" || fail "expected ch-build.log logHint"
pass "rebuild exits 1 and records failed status on build failure"

rm -rf "$FAKE_HOME" "$DEPLOY_TMP"
export PATH="$ORIG_PATH"
unset HOME CH_DEPLOY_STATUS_FILE TMPDIR

# bash -n on touched scripts
echo ""
echo "== bash -n on scripts"
for f in \
  "$REPO_ROOT/scripts/bootstrap/install.sh" \
  "$REPO_ROOT/scripts/application/ch-deploy.sh" \
  "$REPO_ROOT/scripts/lib/ch-deploy-impl.sh" \
  "$REPO_ROOT/scripts/lib/ch-deploy-status.sh" \
  "$REPO_ROOT/scripts/lib/ch-hermes-profile-templates.sh" \
  "$REPO_ROOT/scripts/lib/ch-dotenv-local.sh" \
  "$REPO_ROOT/scripts/hardware/ch-backup.sh"; do
  bash -n "$f" || fail "bash -n $f"
  pass "bash -n $(basename "$f")"
done

echo ""
# Note: full ch-deploy restart / port-free / fixture-git smoke is not in this harness
# (see docs/TESTING.md — CI docker-image job + manual staging checks).
echo "All shell custom checks passed."
if ! report; then
  exit 1
fi
