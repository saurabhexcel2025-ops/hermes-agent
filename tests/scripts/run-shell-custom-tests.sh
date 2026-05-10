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

# bash -n on touched scripts
echo ""
echo "== bash -n on scripts"
for f in \
  "$REPO_ROOT/scripts/bootstrap/install.sh" \
  "$REPO_ROOT/scripts/application/ch-deploy.sh" \
  "$REPO_ROOT/scripts/lib/ch-hermes-profile-templates.sh" \
  "$REPO_ROOT/scripts/lib/ch-dotenv-local.sh" \
  "$REPO_ROOT/scripts/hardware/ch-backup.sh"; do
  bash -n "$f" || fail "bash -n $f"
  pass "bash -n $(basename "$f")"
done

echo ""
echo "All shell custom checks passed."
if ! report; then
  exit 1
fi
