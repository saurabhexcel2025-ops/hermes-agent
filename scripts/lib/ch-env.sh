#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Control Hub — shared .env.local helpers (sourced by setup.sh / install)
# ═══════════════════════════════════════════════════════════════

# Set KEY=value in a dotenv file (removes prior KEY= lines, appends one).
ch_env_set() {
  local file="$1"
  local key="$2"
  local val="$3"
  local dir
  dir="$(dirname "$file")"
  mkdir -p "$dir"
  touch "$file"
  local tmp
  tmp="$(mktemp)"
  grep -v "^${key}=" "$file" >"$tmp" 2>/dev/null || true
  echo "${key}=${val}" >>"$tmp"
  mv "$tmp" "$file"
}

# Print PORT value from .env.local or empty.
ch_env_read_port() {
  local file="$1"
  [ -f "$file" ] || return 1
  local line
  line="$(grep -E '^PORT=' "$file" | tail -n1)" || return 1
  line="${line#PORT=}"
  line="${line%$'\r'}"
  [ -n "$line" ] || return 1
  printf '%s' "$line"
}

# Build CH_ALLOWED_DEV_ORIGINS for next.config (comma-separated full origins).
ch_build_allowed_dev_origins() {
  local port="$1"
  local origins="http://localhost:${port},http://127.0.0.1:${port}"
  local ips
  ips="$(hostname -I 2>/dev/null || true)"
  for ip in $ips; do
    [[ "$ip" =~ ^127\. ]] && continue
    [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
    origins="${origins},http://${ip}:${port}"
  done
  printf '%s' "$origins"
}

# True if something is listening on TCP port (this host).
ch_tcp_port_in_use() {
  local p="$1"
  if command -v ss &>/dev/null; then
    ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN
    return $?
  fi
  if command -v lsof &>/dev/null; then
    lsof -iTCP:"$p" -sTCP:LISTEN &>/dev/null
    return $?
  fi
  if (echo >/dev/tcp/127.0.0.1/"$p") &>/dev/null; then
    return 0
  fi
  return 1
}
