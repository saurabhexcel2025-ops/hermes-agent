#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Control Hub — Setup Script
# ═══════════════════════════════════════════════════════════════
# Run after cloning the repository (golden path for developers / in-repo install).
#
# Usage:
#   cd control-hub
#   bash scripts/bootstrap/setup.sh
#
# Prerequisites:
#   - Node.js 18+
#   - Hermes optional: without ~/.hermes/config.yaml you get a standalone Control Hub
#     (missions/cron tied to Hermes paths will be limited until Hermes is installed).
#
# Environment:
#   CI=1 or CH_INSTALL_NONINTERACTIVE=1 — non-interactive; set PORT or auto-pick 42069–42100
#   CH_SETUP_RUN_TESTS=1 — run `npm test` during setup (CI runs tests automatically)
#   CH_INSTALL_ADVANCED=1 — prompt for CH_DATA_DIR, HERMES_HOME, branch, API key (interactive only)
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=../lib/ch-env.sh
source "$SCRIPT_DIR/../lib/ch-env.sh"
# shellcheck source=../lib/ch-port.sh
source "$SCRIPT_DIR/../lib/ch-port.sh"

echo "╔══════════════════════════════════════════╗"
echo "║       Control Hub — Setup               ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Node.js ────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "✗ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "✗ Node.js 18+ required (found v$NODE_VERSION)"
    exit 1
fi
echo "✓ Node.js $(node -v)"

# ── PORT + LAN dev origins (.env.local) ───────────────────────
ch_setup_port_and_dev_origins "$REPO_ROOT" || exit 1
CH_PORT_DISPLAY="${CH_SELECTED_PORT}"

ENV_LOCAL="${REPO_ROOT}/.env.local"

# ── Advanced env (optional; before Hermes detection) ─────────
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
if ! ch_noninteractive_install; then
    if [ "${CH_INSTALL_ADVANCED:-}" = "1" ]; then
        ADVANCED=yes
    else
        read -r -p "Advanced: custom data directory, Hermes home, or update branch? [y/N]: " ADVANCED
        echo ""
    fi
    if [[ "${ADVANCED:-}" =~ ^[Yy]$ ]]; then
        read -r -p "CH_DATA_DIR [${CH_DATA_DIR:-$HOME/control-hub/data}]: " in_data
        echo ""
        if [ -n "${in_data// /}" ]; then
            export CH_DATA_DIR="${in_data// /}"
            ch_env_set "$ENV_LOCAL" "CH_DATA_DIR" "$CH_DATA_DIR"
        fi
        read -r -p "HERMES_HOME [${HERMES_HOME}]: " in_hm
        echo ""
        if [ -n "${in_hm// /}" ]; then
            export HERMES_HOME="${in_hm// /}"
            ch_env_set "$ENV_LOCAL" "HERMES_HOME" "$HERMES_HOME"
        fi
        read -r -p "CH_UPDATE_GIT_BRANCH for deploy scripts [${CH_UPDATE_GIT_BRANCH:-dev}]: " in_br
        echo ""
        if [ -n "${in_br// /}" ]; then
            ch_env_set "$ENV_LOCAL" "CH_UPDATE_GIT_BRANCH" "${in_br// /}"
        fi
    fi
fi

# ── Hermes / agent home (optional) ────────────────────────────
HERMES_CONFIGURED=false
if [ -f "$HERMES_HOME/config.yaml" ]; then
    HERMES_CONFIGURED=true
    echo "✓ Hermes config found at $HERMES_HOME/config.yaml"
else
    echo "ℹ  No Hermes config at $HERMES_HOME/config.yaml — standalone mode."
    echo "   Install Hermes and run hermes setup for full gateway, cron, and config editing."
fi

if [ "$HERMES_CONFIGURED" = true ]; then
    echo ""
    if [ -f "$HERMES_HOME/memory_store.db" ]; then
        echo "✓ Holographic memory detected"
    else
        echo "ℹ  Holographic memory not found — Memory page will show an install notice."
        echo "   To enable: hermes plugins install hermes-memory-store"
    fi

    echo ""
    if [ -f "$HERMES_HOME/.env" ] && grep -q "API_SERVER_ENABLED=true" "$HERMES_HOME/.env" 2>/dev/null; then
        echo "✓ Gateway API server already enabled"
    else
        echo "Enabling gateway API server for Rec Room..."
        mkdir -p "$HERMES_HOME"
        echo "" >> "$HERMES_HOME/.env"
        echo "# Enable API server for Control Hub Rec Room" >> "$HERMES_HOME/.env"
        echo "API_SERVER_ENABLED=true" >> "$HERMES_HOME/.env"
        echo "✓ API server enabled — restart gateway to activate"
        echo "  Run: systemctl --user restart hermes-gateway  (or: hermes gateway stop && hermes gateway start)"
    fi
fi

# ── Data directories ─────────────────────────────────────────
echo ""
echo "Creating data directories..."
CH_DATA_ROOT="${CH_DATA_DIR:-$HOME/control-hub/data}"
mkdir -p "$CH_DATA_ROOT/missions"
mkdir -p "$CH_DATA_ROOT/templates"
mkdir -p "$CH_DATA_ROOT/operations"
mkdir -p "$CH_DATA_ROOT/recroom"
mkdir -p "$CH_DATA_ROOT/stories"
mkdir -p "$CH_DATA_ROOT/workspaces" 2>/dev/null || true
mkdir -p "$CH_DATA_ROOT/audit" 2>/dev/null || true
mkdir -p "$CH_DATA_ROOT/scripts" 2>/dev/null || true
mkdir -p "$CH_DATA_ROOT/logs" 2>/dev/null || true
if [ -d "$REPO_ROOT/scripts/hardware" ]; then
    for f in "$REPO_ROOT/scripts/hardware"/*.sh; do
        [ -f "$f" ] || continue
        base=$(basename "$f")
        if [ ! -f "$CH_DATA_ROOT/scripts/$base" ]; then
            cp "$f" "$CH_DATA_ROOT/scripts/$base" && chmod +x "$CH_DATA_ROOT/scripts/$base"
        fi
    done
fi
if [ "$HERMES_CONFIGURED" = true ]; then
    mkdir -p "$HERMES_HOME/logs"
fi
echo "✓ Control Hub data directories created at $CH_DATA_ROOT"

# ── Discover local Hermes install (hermes-detection.json) ───
if command -v node &>/dev/null && [ -f "$REPO_ROOT/scripts/tooling/discover-agents.mjs" ]; then
    CH_DATA_DIR="$CH_DATA_ROOT" node "$REPO_ROOT/scripts/tooling/discover-agents.mjs" || true
    if [ -f "$CH_DATA_ROOT/hermes-detection.json" ]; then
        if ! grep -q '"valid": true' "$CH_DATA_ROOT/hermes-detection.json" 2>/dev/null; then
            echo "⚠  Hermes install not detected at HERMES_HOME — set HERMES_HOME in .env.local (see .env.example)"
        fi
    fi
fi

# ── Scripts executable ───────────────────────────────────────
chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true
chmod +x "$REPO_ROOT/scripts/lib"/*.sh 2>/dev/null || true
chmod +x "$REPO_ROOT/scripts/application"/*.sh 2>/dev/null || true
chmod +x "$REPO_ROOT/scripts/hardware"/*.sh 2>/dev/null || true
echo "✓ Scripts ready"

# ── Dependencies ─────────────────────────────────────────────
echo ""
echo "Installing dependencies..."
npm install
echo "✓ Dependencies installed"

# ── Tests (optional — default skip for faster local setup) ───
if [ "${CH_SETUP_RUN_TESTS:-}" = "1" ] || [ "${CI:-}" = "true" ]; then
    echo ""
    echo "Running tests..."
    if npm test -- --passWithNoTests 2>/dev/null; then
        echo "✓ All tests passed"
    else
        echo "⚠  Some tests failed — check output above"
    fi
else
    echo ""
    echo "ℹ  Skipping tests (set CH_SETUP_RUN_TESTS=1 or CI=true to run during setup)"
fi

# ── Build ─────────────────────────────────────────────────────
echo ""
echo "Building production bundle..."
npm run build
echo "✓ Build complete"

# ── Database migrate + catalog seed ───────────────────────────
echo ""
echo "Applying database migrations…"
CH_DATA_DIR="$CH_DATA_ROOT" npm run db:migrate
echo "✓ Migrations applied"
echo "Seeding professional catalog (merge)…"
if npx tsx "$REPO_ROOT/scripts/tooling/seed-catalog.ts" --merge; then
  echo "✓ Catalog seeded"
else
  echo "⚠  Catalog seed failed — run: npx tsx scripts/tooling/seed-catalog.ts --merge"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       Setup Complete!                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "PORT (Control Hub):     $CH_PORT_DISPLAY"
echo "CH_DATA_DIR:            $CH_DATA_ROOT"
echo "HERMES_HOME:            $HERMES_HOME"
echo "Hermes integrated:     $HERMES_CONFIGURED"
echo ""
echo "Start the server:"
echo "  npm run start          # bind per package.json / .env.local"
echo "  npm run start:network  # 0.0.0.0 (LAN)"
echo ""
echo "Local URL:  http://127.0.0.1:${CH_PORT_DISPLAY}/"
echo "LAN: use http://<this-host-ip>:${CH_PORT_DISPLAY}/ or http://<hostname>.local:${CH_PORT_DISPLAY}/"
echo ""
echo "Development (hot reload):"
echo "  npm run dev            # PORT and CH_ALLOWED_DEV_ORIGINS come from .env.local"
echo ""
echo "Deploy / update:"
echo "  bash scripts/application/ch-deploy.sh update   (branch: CH_UPDATE_GIT_BRANCH in .env.local, default dev)"
echo ""
