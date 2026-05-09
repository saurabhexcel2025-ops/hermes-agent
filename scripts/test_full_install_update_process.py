#!/usr/bin/env python3
"""
Control Hub — release-confidence install/update harness (Docker, local-only).

Runs isolated scenarios against your **current working tree copy**: ``setup.sh``,
``install.sh`` (bootstrap + ``--in-repo``), ``update.sh``, optional upstream Hermes
installer, with runtime-generated user data under ``CH_DATA_DIR`` and Hermes profile
markers. Ephemeral ``git`` state lives **inside the container** only.

**Manual verification (required before releases):** run
``python scripts/test_full_install_update_process.py --profile release`` with Docker
up, read full logs + final summary, fix failures until exit 0. Not intended for CI.

TTY installers are not exercised; use non-interactive env flags documented in
``scripts/install.sh`` and ``scripts/update.sh``.

Usage (from repository root):
  python scripts/test_full_install_update_process.py --profile smoke --skip-http
  python scripts/test_full_install_update_process.py --profile release --skip-http
  python scripts/test_full_install_update_process.py --profile release --with-real-hermes-install
"""

from __future__ import annotations

import argparse
import os
import random
import shutil
import signal
import string
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable

IMAGE_TAG = "ch-control-hub-fulltest:latest"
DOCKERFILE_REL = Path("docker/TestHarness.dockerfile")

DEFAULT_HERMES_INSTALL_URL = (
    "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh"
)

MARKER_USER_CH = "HARNESS_USER_DATA_MARKER"
MARKER_HERMES_QA_EDIT = "HERMES_USER_EDIT_QA_SOUL"
MARKER_CUSTOM_PROFILE = "CUSTOM_OPERATOR_IMMUTABLE"

# Copy workspace to container without heavy artefacts (rebuilt inside container).
COPY_IGNORE_DIR_NAMES = frozenset(
    {
        "node_modules",
        ".next",
        "coverage",
        ".turbo",
        "playwright-report",
        "test-results",
    }
)


def _repo_root_default() -> Path:
    return Path(__file__).resolve().parent.parent


def _rand_suffix(length: int = 8) -> str:
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(length))


def _smoke_scenarios(*, include_hermes_upstream: bool) -> list[str]:
    s = ["fresh", "hermes", "dashboard", "both", "update"]
    if include_hermes_upstream:
        s.append("hermes-upstream")
    return s


def _release_scenarios(*, include_hermes_upstream: bool) -> list[str]:
    s = _smoke_scenarios(include_hermes_upstream=False)
    s.extend(
        [
            "install_bootstrap",
            "install_in_repo",
            "update_preserves_sync_off",
            "update_sync_on",
        ]
    )
    if include_hermes_upstream:
        s.append("hermes-upstream")
    return s


class Harness:
    def __init__(
        self,
        repo_root: Path,
        skip_http: bool,
        keep_artifacts: bool,
        with_real_hermes_install: bool,
        hermes_install_url: str,
        profile: str,
        fail_fast: bool,
        continue_on_failure: bool,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.skip_http = skip_http
        self.keep_artifacts = keep_artifacts
        self.with_real_hermes_install = with_real_hermes_install
        self.hermes_install_url = hermes_install_url
        self.profile = profile
        self.fail_fast = fail_fast
        self.continue_on_failure = continue_on_failure
        self.run_id = _rand_suffix(10)
        self.containers: list[str] = []
        self.temp_dirs: list[Path] = []
        self._built_image = False
        self.scenario_results: list[tuple[str, float, bool, str | None]] = []
        self._started_at = time.perf_counter()

    def register_cleanup(self) -> None:
        def _cleanup(signum: int | None = None, frame: object | None = None) -> None:
            self.cleanup()

        signal.signal(signal.SIGINT, _cleanup)
        signal.signal(signal.SIGTERM, _cleanup)

    def cleanup(self) -> None:
        if self.keep_artifacts:
            print("[harness] --keep-artifacts: leaving Docker resources in place")
            return
        for name in list(self.containers):
            subprocess.run(
                ["docker", "rm", "-f", name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        self.containers.clear()
        for d in list(self.temp_dirs):
            shutil.rmtree(d, ignore_errors=True)
        self.temp_dirs.clear()

    def check_docker(self) -> None:
        r = subprocess.run(
            ["docker", "info"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if r.returncode != 0:
            print(
                "ERROR: Docker daemon not reachable. Start Docker Desktop / dockerd, then retry.",
                file=sys.stderr,
            )
            sys.exit(2)

    def build_image(self) -> None:
        dockerfile = self.repo_root / DOCKERFILE_REL
        if not dockerfile.is_file():
            print(f"ERROR: missing {dockerfile}", file=sys.stderr)
            sys.exit(2)
        print(f"[harness] building image {IMAGE_TAG} …")
        subprocess.run(
            [
                "docker",
                "build",
                "-f",
                str(dockerfile),
                "-t",
                IMAGE_TAG,
                str(self.repo_root),
            ],
            check=True,
        )
        self._built_image = True

    def copy_workspace(self, dest: Path) -> None:
        dest.mkdir(parents=True, exist_ok=True)

        def _ignore(_path: str, names: list[str]) -> list[str]:
            return [n for n in names if n in COPY_IGNORE_DIR_NAMES]

        shutil.copytree(
            self.repo_root,
            dest,
            dirs_exist_ok=True,
            ignore=_ignore,
        )
        self._normalize_shell_lf(dest)

    def _normalize_shell_lf(self, workspace: Path) -> None:
        for path in workspace.rglob("*.sh"):
            try:
                data = path.read_bytes()
            except OSError:
                continue
            if b"\r\n" not in data and b"\r" not in data:
                continue
            path.write_bytes(data.replace(b"\r\n", b"\n").replace(b"\r", b"\n"))

    def temp_workspace(self) -> Path:
        d = Path(tempfile.mkdtemp(prefix=f"ch-fulltest-{self.run_id}-"))
        self.temp_dirs.append(d)
        self.copy_workspace(d)
        return d

    def start_container(self, scenario: str) -> str:
        name = f"ch-ft-{self.run_id}-{scenario}"
        subprocess.run(
            ["docker", "rm", "-f", name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                name,
                IMAGE_TAG,
                "sleep",
                "infinity",
            ],
            check=True,
        )
        self.containers.append(name)
        return name

    def docker_cp_workspace(self, container: str, workspace: Path) -> None:
        subprocess.run(
            ["docker", "cp", str(workspace) + "/.", f"{container}:/workspace"],
            check=True,
        )

    def docker_exec(
        self,
        container: str,
        script: str,
        env: dict[str, str] | None = None,
        *,
        workdir: str = "/workspace",
    ) -> None:
        cmd = ["docker", "exec", "-w", workdir]
        if env:
            for k, v in env.items():
                cmd.extend(["-e", f"{k}={v}"])
        cmd.extend([container, "bash", "-lc", script])
        print(f"[harness] docker exec … {script[:80]}…")
        subprocess.run(cmd, check=True)

    def docker_exec_capture(
        self,
        container: str,
        script: str,
        env: dict[str, str] | None = None,
        *,
        workdir: str = "/workspace",
    ) -> str:
        cmd = ["docker", "exec", "-w", workdir]
        if env:
            for k, v in env.items():
                cmd.extend(["-e", f"{k}={v}"])
        cmd.extend([container, "bash", "-lc", script])
        p = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return (p.stdout or "").strip()

    # ── seeds ─────────────────────────────────────────────────

    def seed_fresh(self, container: str) -> None:
        self.docker_exec(
            container,
            "rm -rf /root/.hermes /root/control-hub/data /tmp/chdata /tmp/ch-hub-bare.git "
            "/tmp/ch-install-harness 2>/dev/null || true\n"
            "mkdir -p /root\n",
        )

    def seed_hermes_existing(self, container: str) -> None:
        """Minimal Hermes for smoke persona (custom QA SOUL must survive setup)."""
        self.docker_exec(
            container,
            "mkdir -p /root/.hermes/profiles/qa-engineer\n"
            f"printf '%s\\n' '{MARKER_HERMES_QA_EDIT}' > /root/.hermes/profiles/qa-engineer/SOUL.md\n"
            "printf '%s\\n' 'version: 1' > /root/.hermes/config.yaml\n"
            "mkdir -p /root/.hermes/logs\n",
        )

    def seed_hermes_rich(self, container: str) -> None:
        """Hermes + bundled qa-engineer edit marker + non-bundled profile (immutable)."""
        self.docker_exec(
            container,
            "mkdir -p /root/.hermes/profiles/qa-engineer /root/.hermes/profiles/custom-operator "
            "/root/.hermes/logs\n"
            f"printf '%s\\n' '{MARKER_HERMES_QA_EDIT}' > /root/.hermes/profiles/qa-engineer/SOUL.md\n"
            "printf '%s\\n' 'version: 1' > /root/.hermes/config.yaml\n"
            "printf '%s\\n' '# harness placeholder' > /root/.hermes/.env\n"
            f"printf '%s\\n' '{MARKER_CUSTOM_PROFILE}' > "
            "/root/.hermes/profiles/custom-operator/SOUL.md\n",
        )

    def precreate_env_local_ch_data_dir(self, container: str, ch_data_dir: str) -> None:
        escaped = ch_data_dir.replace("'", "'\"'\"'")
        self.docker_exec(
            container,
            f"echo 'CH_DATA_DIR={escaped}' > /workspace/.env.local",
        )

    def seed_ch_data_rich(self, container: str, data_root: str) -> None:
        """Runtime CH_DATA_DIR with sentinel JSON + SQLite from prebuild."""
        dr = data_root.replace("'", "'\"'\"'")
        self.docker_exec(
            container,
            "set -e\n"
            f"mkdir -p '{dr}/missions' '{dr}/templates'\n"
            f"printf '%s\\n' '{{\"id\":\"harness-mission-1\",\"title\":\"Harness\"}}' "
            f"> '{dr}/missions/harness-sentinel.json'\n"
            f"printf '%s\\n' '{{\"id\":\"harness-template-1\"}}' "
            f"> '{dr}/templates/harness-sentinel.json'\n"
            f"printf '%s\\n' '{MARKER_USER_CH}' > '{dr}/USER_OWNED_MARKER.txt'\n"
            "cd /workspace\n"
            "npm ci\n"
            "npm run prebuild\n"
            f"cp -f data/control-hub.db '{dr}/control-hub.db'\n",
        )

    def seed_both(self, container: str, *, rich_hermes: bool) -> None:
        if rich_hermes:
            self.seed_hermes_rich(container)
        else:
            self.seed_hermes_existing(container)
        self.seed_ch_data_rich(container, "/root/chdata-pre")

    # ── Snapshot / SQLite ─────────────────────────────────────

    def manifest_data_dir(self, container: str, root: str) -> str:
        """Sorted sha256 listing for stable comparison (excludes logs)."""
        r = root.replace("'", "'\"'\"'")
        return self.docker_exec_capture(
            container,
            f"set -e\n"
            f"cd '{r}' && find . -type f ! -path './logs/*' | LC_ALL=C sort | xargs -r sha256sum\n",
            workdir="/",
        )

    def sha256_file(self, container: str, path: str) -> str:
        p = path.replace("'", "'\"'\"'")
        out = self.docker_exec_capture(
            container,
            f"sha256sum '{p}' | awk '{{print $1}}'\n",
            workdir="/",
        )
        return out.strip()

    def sqlite_schema_version(self, container: str, db_path: str) -> int:
        dp = db_path.replace("'", "'\"'\"'")
        out = self.docker_exec_capture(
            container,
            "cd /workspace && "
            f"export CH_HARNESS_DB='{dp}' && "
            "node -e \""
            "const Database=require('better-sqlite3');"
            "const db=new Database(process.env.CH_HARNESS_DB);"
            "const row=db.prepare(\\\"SELECT value FROM meta WHERE key='schema_version'\\\").get();"
            "console.log(row?row.value:'0');"
            "\"\n",
            workdir="/workspace",
        )
        return int(out.strip() or "0")

    # ── setup / install ─────────────────────────────────────────

    def run_setup(
        self,
        container: str,
        extra_env: dict[str, str] | None = None,
        *,
        install_profile_templates: bool = False,
    ) -> None:
        env = {
            "CI": "1",
            "CH_INSTALL_NONINTERACTIVE": "1",
            "INSTALL_HERMES_PROFILE_TEMPLATES": (
                "yes" if install_profile_templates else "no"
            ),
            "CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES": "no",
        }
        if extra_env:
            env.update(extra_env)
        self.docker_exec(
            container,
            "cd /workspace && bash scripts/setup.sh",
            env=env,
        )

    def prepare_hub_bare_repo(self, container: str) -> None:
        """Bare clone at file:///tmp/ch-hub-bare.git with branch dev for install.sh bootstrap."""
        self.docker_exec(
            container,
            r"""
set -e
cd /workspace
git config user.email "harness@local"
git config user.name "harness"
if ! git rev-parse HEAD >/dev/null 2>&1; then
  git add -A
  git commit -m "harness initial" --allow-empty
fi
git add -A
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "harness workspace snapshot"
fi
git checkout -B dev
rm -rf /tmp/ch-hub-bare.git
git clone --bare . /tmp/ch-hub-bare.git
""",
        )

    def run_install_bootstrap(self, container: str, install_dir: str) -> None:
        """Full install.sh clone path into INSTALL_DIR (offline hub via file://)."""
        self.prepare_hub_bare_repo(container)
        idir = install_dir.replace("'", "'\"'\"'")
        self.docker_exec(
            container,
            f"set -e\n"
            f"rm -rf '{idir}'\n"
            f"export CI=1 CH_INSTALL_NONINTERACTIVE=1 INSTALL_HERMES=no INSTALL_HINDSIGHT=no\n"
            f"export REPO_URL=file:///tmp/ch-hub-bare.git BRANCH=dev INSTALL_DIR='{idir}'\n"
            "bash /workspace/scripts/install.sh\n"
            f"test -f '{idir}/.env.local'\n"
            f"test -d '{idir}/.next'\n"
            f"grep -q '^PORT=' '{idir}/.env.local'\n",
            env={
                "CI": "1",
                "CH_INSTALL_NONINTERACTIVE": "1",
                "INSTALL_HERMES": "no",
                "INSTALL_HINDSIGHT": "no",
                "REPO_URL": "file:///tmp/ch-hub-bare.git",
                "BRANCH": "dev",
                "INSTALL_DIR": install_dir,
            },
        )

    def run_install_in_repo(self, container: str) -> None:
        """install.sh --in-repo with bundled profile templates (Hermes config present)."""
        self.docker_exec(
            container,
            r"""
set -e
mkdir -p /root/.hermes/logs
printf '%s\n' 'version: 1' > /root/.hermes/config.yaml
cd /workspace
""",
        )
        self.docker_exec(
            container,
            "cd /workspace && bash scripts/install.sh --in-repo",
            env={
                "CI": "1",
                "CH_INSTALL_NONINTERACTIVE": "1",
                "INSTALL_HERMES_PROFILE_TEMPLATES": "yes",
                "INSTALL_HINDSIGHT": "no",
            },
        )
        self.docker_exec(
            container,
            r"""
set -e
test -s /root/.hermes/profiles/qa-engineer/SOUL.md
test -s /root/.hermes/profiles/qa-engineer/AGENTS.md
""",
        )

    def assert_paths(self, container: str) -> None:
        self.docker_exec(
            container,
            "set -e\n"
            "test -f /workspace/.env.local\n"
            "grep -q '^PORT=' /workspace/.env.local\n"
            "test -d /workspace/.next\n",
        )

    def assert_paths_at(self, container: str, repo: str) -> None:
        rp = repo.replace("'", "'\"'\"'")
        self.docker_exec(
            container,
            f"set -e\n"
            f"test -f '{rp}/.env.local'\n"
            f"grep -q '^PORT=' '{rp}/.env.local'\n"
            f"test -d '{rp}/.next'\n",
            workdir="/",
        )

    def assert_hermes_qa_marker(self, container: str) -> None:
        out = self.docker_exec_capture(
            container,
            "cat /root/.hermes/profiles/qa-engineer/SOUL.md",
        )
        if MARKER_HERMES_QA_EDIT not in out:
            raise AssertionError(
                f"expected QA SOUL to retain marker {MARKER_HERMES_QA_EDIT!r}",
            )

    def assert_dashboard_db(self, container: str, data_root: str) -> None:
        self.docker_exec(
            container,
            f"set -e\n"
            f'test -s "{data_root}/control-hub.db"\n',
            workdir="/",
        )

    def assert_sentinel_ch_files(self, container: str, data_root: str) -> None:
        dr = data_root.replace("'", "'\"'\"'")
        self.docker_exec(
            container,
            f"set -e\n"
            f"grep -q '{MARKER_USER_CH}' '{dr}/USER_OWNED_MARKER.txt'\n"
            f"grep -q 'harness-mission-1' '{dr}/missions/harness-sentinel.json'\n",
            workdir="/",
        )

    def assert_custom_profile_unchanged(self, container: str) -> None:
        out = self.docker_exec_capture(
            container,
            "cat /root/.hermes/profiles/custom-operator/SOUL.md",
        )
        if MARKER_CUSTOM_PROFILE not in out:
            raise AssertionError("custom-operator profile should stay immutable")

    def assert_bundled_qa_matches_template(self, container: str) -> None:
        t = self.docker_exec_capture(
            container,
            "sha256sum /workspace/scripts/profiles/qa-engineer/SOUL.md | awk '{print $1}'",
            workdir="/",
        )
        u = self.docker_exec_capture(
            container,
            "sha256sum /root/.hermes/profiles/qa-engineer/SOUL.md | awk '{print $1}'",
            workdir="/",
        )
        if t.strip() != u.strip():
            raise AssertionError(
                "bundled qa-engineer SOUL.md should match repo template after sync",
            )

    def assert_hermes_cli(self, container: str) -> None:
        self.docker_exec(
            container,
            r"""
set -e
export PATH="/usr/local/bin:/root/.local/bin:${PATH}"
command -v hermes
hermes --version
""",
        )

    def assert_bundled_hermes_profiles_installed(self, container: str) -> None:
        self.docker_exec(
            container,
            r"""
set -e
test -s /root/.hermes/profiles/qa-engineer/SOUL.md
test -s /root/.hermes/profiles/qa-engineer/AGENTS.md
""",
        )

    # ── Hermes upstream ─────────────────────────────────────────

    def run_hermes_upstream_install(self, container: str) -> None:
        url = self.hermes_install_url.replace("'", "'\"'\"'")
        script = f"""
set -euo pipefail
unset PYTHONPATH PYTHONHOME 2>/dev/null || true
export UV_NO_CONFIG=1
export DEBIAN_FRONTEND=noninteractive
export PATH="/usr/local/bin:/root/.local/bin:${{PATH}}"
rm -rf /root/.hermes /usr/local/lib/hermes-agent 2>/dev/null || true
curl -fsSL '{url}' | bash -s --
export PATH="/usr/local/bin:/root/.local/bin:${{PATH}}"
hash -r
command -v hermes
hermes --version
"""
        print("[harness] Hermes upstream install (long-running; needs network) …")
        self.docker_exec(container, script)

    def ensure_hermes_config_after_install(self, container: str) -> None:
        self.docker_exec(
            container,
            r"""
set -e
export PATH="/usr/local/bin:/root/.local/bin:${PATH}"
mkdir -p /root/.hermes
if [ -f /root/.hermes/config.yaml ]; then
  exit 0
fi
if command -v script >/dev/null 2>&1; then
  script -q -c "hermes setup || true" /dev/null || true
fi
if [ ! -f /root/.hermes/config.yaml ]; then
  printf '%s\n' 'version: 1' > /root/.hermes/config.yaml
fi
test -f /root/.hermes/config.yaml
""",
        )

    # ── HTTP smoke ─────────────────────────────────────────────

    def http_smoke(self, container: str, *, workspace: str = "/workspace") -> None:
        if self.skip_http:
            print("[harness] skipping HTTP smoke (--skip-http)")
            return
        ws = workspace.replace("'", "'\"'\"'")
        script = f"""
set -e
PORT=$(grep -E '^PORT=' {ws}/.env.local | tail -n1 | sed 's/^PORT=//' | tr -d '\\r')
export PORT="${{PORT:-3000}}"
cd {ws}
CH_ENABLE_DEPLOY_API=true NODE_OPTIONS= node node_modules/next/dist/bin/next start -p "$PORT" -H 127.0.0.1 >> /tmp/ch-http-smoke.log 2>&1 &
PID=$!
for i in $(seq 1 45); do
  if curl -sf -o /dev/null "http://127.0.0.1:${{PORT}}/"; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
    exit 0
  fi
  sleep 1
done
kill "$PID" 2>/dev/null || true
echo "HTTP smoke timeout" >&2
exit 1
"""
        self.docker_exec(container, script, workdir="/")

    # ── Git offline update ─────────────────────────────────────

    def configure_file_origin_and_push_dev(self, container: str) -> None:
        script = r"""
set -e
cd /workspace
git config user.email "harness@local"
git config user.name "harness"
if ! git rev-parse HEAD >/dev/null 2>&1; then
  git add -A
  git commit -m "harness initial" --allow-empty
fi
git add -A
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "harness workspace snapshot"
fi
git checkout -B dev
rm -rf /tmp/ch-origin.git /tmp/ch-origin-wt
git clone --bare . /tmp/ch-origin.git
git remote remove origin 2>/dev/null || true
git remote add origin file:///tmp/ch-origin.git
git push -u origin dev --force
"""
        self.docker_exec(container, script)

    def bump_upstream_dev(self, container: str) -> None:
        script = r"""
set -e
rm -rf /tmp/ch-origin-wt
git clone file:///tmp/ch-origin.git /tmp/ch-origin-wt
cd /tmp/ch-origin-wt
git checkout dev
git config user.email "harness@local"
git config user.name "harness"
mkdir -p scripts
touch scripts/.harness-marker
git add scripts/.harness-marker
git commit -m "harness upstream bump"
git push origin dev
"""
        self.docker_exec(container, script)

    def append_env_local(self, container: str, lines: str) -> None:
        for line in lines.strip().split("\n"):
            if not line.strip():
                continue
            escaped = line.replace("'", "'\"'\"'")
            self.docker_exec(container, f"echo '{escaped}' >> /workspace/.env.local")

    def run_update(
        self,
        container: str,
        *,
        sync_profiles: bool,
    ) -> None:
        sync_val = "yes" if sync_profiles else "no"
        self.append_env_local(
            container,
            f"\nCH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES={sync_val}\nCH_UPDATE_GIT_BRANCH=dev\n",
        )
        self.docker_exec(
            container,
            "cd /workspace && bash scripts/update.sh",
            env={
                "CI": "1",
                "CH_INSTALL_NONINTERACTIVE": "1",
                "CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES": sync_val,
                "CH_UPDATE_GIT_BRANCH": "dev",
            },
        )

    def assert_updated_to_origin_dev(self, container: str) -> None:
        script = r"""
set -e
cd /workspace
git fetch origin dev
H=$(git rev-parse HEAD)
R=$(git rev-parse origin/dev)
test "$H" = "$R"
test -f scripts/.harness-marker
"""
        self.docker_exec(container, script)

    # ── scenario runners ──────────────────────────────────────

    def scenario_fresh(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("fresh")
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.run_setup(c)
            self.assert_paths(c)
            self.http_smoke(c)
        finally:
            self._rm_container(c)

    def scenario_hermes(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("hermes")
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.seed_hermes_existing(c)
            self.run_setup(c)
            self.assert_paths(c)
            self.assert_hermes_qa_marker(c)
            self.http_smoke(c)
        finally:
            self._rm_container(c)

    def scenario_dashboard(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("dashboard")
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.seed_ch_data_rich(c, "/root/chdata-pre")
            self.precreate_env_local_ch_data_dir(c, "/root/chdata-pre")
            self.run_setup(c, extra_env={"CH_DATA_DIR": "/root/chdata-pre"})
            self.assert_paths(c)
            self.assert_dashboard_db(c, "/root/chdata-pre")
            self.assert_sentinel_ch_files(c, "/root/chdata-pre")
            self.http_smoke(c)
        finally:
            self._rm_container(c)

    def scenario_both(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("both")
        rich = self.profile == "release"
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.seed_both(c, rich_hermes=rich)
            self.precreate_env_local_ch_data_dir(c, "/root/chdata-pre")
            self.run_setup(c, extra_env={"CH_DATA_DIR": "/root/chdata-pre"})
            self.assert_paths(c)
            self.assert_hermes_qa_marker(c)
            self.assert_dashboard_db(c, "/root/chdata-pre")
            self.assert_sentinel_ch_files(c, "/root/chdata-pre")
            if rich:
                self.assert_custom_profile_unchanged(c)
            self.http_smoke(c)
        finally:
            self._rm_container(c)

    def scenario_update(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("update")
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.run_setup(c)
            self.assert_paths(c)
            self.configure_file_origin_and_push_dev(c)
            self.bump_upstream_dev(c)
            self.run_update(c, sync_profiles=False)
            self.assert_updated_to_origin_dev(c)
        finally:
            self._rm_container(c)

    def scenario_install_bootstrap(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("install-bootstrap")
        inst = "/tmp/ch-install-harness"
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.run_install_bootstrap(c, inst)
            self.assert_paths_at(c, inst)
            self.http_smoke(c, workspace=inst)
        finally:
            self._rm_container(c)

    def scenario_install_in_repo(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("install-in-repo")
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.run_install_in_repo(c)
            self.assert_paths(c)
            self.http_smoke(c)
        finally:
            self._rm_container(c)

    def scenario_update_preserves_sync_off(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("update-preserves")
        data_root = "/root/chdata-pre"
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.seed_ch_data_rich(c, data_root)
            self.seed_hermes_rich(c)
            self.precreate_env_local_ch_data_dir(c, data_root)
            self.run_setup(c, extra_env={"CH_DATA_DIR": data_root})
            self.assert_paths(c)

            manifest_before = self.manifest_data_dir(c, data_root)
            db_sha_before = self.sha256_file(c, f"{data_root}/control-hub.db")
            schema_before = self.sqlite_schema_version(c, f"{data_root}/control-hub.db")

            self.configure_file_origin_and_push_dev(c)
            self.bump_upstream_dev(c)
            self.run_update(c, sync_profiles=False)
            self.assert_updated_to_origin_dev(c)

            manifest_after = self.manifest_data_dir(c, data_root)
            db_sha_after = self.sha256_file(c, f"{data_root}/control-hub.db")
            schema_after = self.sqlite_schema_version(c, f"{data_root}/control-hub.db")

            if manifest_before != manifest_after:
                raise AssertionError(
                    "CH_DATA_DIR manifest changed after update (sync off); possible data loss",
                )
            if db_sha_before != db_sha_after:
                raise AssertionError("control-hub.db changed after update (unexpected)")
            if schema_after < schema_before:
                raise AssertionError("schema_version regressed")
            self.assert_hermes_qa_marker(c)
            self.assert_custom_profile_unchanged(c)
        finally:
            self._rm_container(c)

    def scenario_update_sync_on(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("update-sync-on")
        data_root = "/root/chdata-pre"
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.seed_ch_data_rich(c, data_root)
            self.seed_hermes_rich(c)
            self.precreate_env_local_ch_data_dir(c, data_root)
            self.run_setup(c, extra_env={"CH_DATA_DIR": data_root})
            self.assert_paths(c)

            manifest_before = self.manifest_data_dir(c, data_root)

            self.configure_file_origin_and_push_dev(c)
            self.bump_upstream_dev(c)
            self.run_update(c, sync_profiles=True)
            self.assert_updated_to_origin_dev(c)

            manifest_after = self.manifest_data_dir(c, data_root)
            if manifest_before != manifest_after:
                raise AssertionError("CH_DATA_DIR user files changed after update (sync on)")
            self.assert_bundled_qa_matches_template(c)
            self.assert_custom_profile_unchanged(c)
        finally:
            self._rm_container(c)

    def scenario_hermes_upstream(self) -> None:
        ws = self.temp_workspace()
        c = self.start_container("hermes-upstream")
        try:
            self.docker_cp_workspace(c, ws)
            self.seed_fresh(c)
            self.run_hermes_upstream_install(c)
            self.ensure_hermes_config_after_install(c)
            self.run_setup(c, install_profile_templates=True)
            self.assert_hermes_cli(c)
            self.assert_paths(c)
            self.assert_bundled_hermes_profiles_installed(c)
            self.http_smoke(c)
        finally:
            self._rm_container(c)

    def _rm_container(self, c: str) -> None:
        if not self.keep_artifacts:
            subprocess.run(
                ["docker", "rm", "-f", c],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if c in self.containers:
                self.containers.remove(c)

    def scenario_fn_map(self) -> dict[str, Callable[[], None]]:
        return {
            "fresh": self.scenario_fresh,
            "hermes": self.scenario_hermes,
            "dashboard": self.scenario_dashboard,
            "both": self.scenario_both,
            "update": self.scenario_update,
            "install_bootstrap": self.scenario_install_bootstrap,
            "install_in_repo": self.scenario_install_in_repo,
            "update_preserves_sync_off": self.scenario_update_preserves_sync_off,
            "update_sync_on": self.scenario_update_sync_on,
            "hermes-upstream": self.scenario_hermes_upstream,
        }

    def run_scenarios(self, names: list[str]) -> bool:
        mapping = self.scenario_fn_map()
        fail_fast = self.fail_fast and not self.continue_on_failure
        all_ok = True
        for n in names:
            print(f"\n[harness] ========== scenario: {n} ==========")
            t0 = time.perf_counter()
            err: str | None = None
            ok = True
            try:
                mapping[n]()
            except (subprocess.CalledProcessError, AssertionError) as e:
                ok = False
                err = repr(e)
                print(f"[harness] scenario FAIL: {n}: {err}", file=sys.stderr)
                all_ok = False
                dur = time.perf_counter() - t0
                self.scenario_results.append((n, dur, False, err))
                if fail_fast:
                    break
                continue
            dur = time.perf_counter() - t0
            self.scenario_results.append((n, dur, True, None))
            print(f"[harness] scenario OK: {n} ({dur:.1f}s)")
        return all_ok

    def print_summary(self) -> None:
        total = time.perf_counter() - self._started_at
        line = "=" * 58
        print(f"\n{line}")
        print("HARNESS SUMMARY (local release-confidence)")
        print(line)
        for name, dur, ok, err in self.scenario_results:
            status = "PASS" if ok else "FAIL"
            print(f"  [{status}] {name:<32} {dur:8.1f}s")
            if err and not ok:
                print(f"         {err}")
        passed = sum(1 for _, _, ok, _ in self.scenario_results if ok)
        ran = len(self.scenario_results)
        print(line)
        print(f"  Total wall time: {total:.1f}s  |  Passed {passed}/{ran}")
        print(line)


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Local Docker harness: install.sh, setup.sh, update.sh release confidence",
    )
    p.add_argument(
        "--repo-root",
        type=Path,
        default=_repo_root_default(),
        help="Repository root (default: parent of scripts/)",
    )
    p.add_argument(
        "--profile",
        choices=("release", "smoke"),
        default="smoke",
        help=(
            "smoke (default): core personas + basic update; "
            "release: + install bootstrap/in-repo + update preserve/sync matrix"
        ),
    )
    p.add_argument(
        "--scenarios",
        type=str,
        default="all",
        help="Comma-separated scenario ids, or 'all' (default). See script docstring.",
    )
    p.add_argument(
        "--skip-http",
        action="store_true",
        help="Skip Next.js start + curl smoke",
    )
    p.add_argument(
        "--keep-artifacts",
        action="store_true",
        help="Do not remove Docker containers / temp dirs",
    )
    p.add_argument(
        "--with-real-hermes-install",
        action="store_true",
        help="Append hermes-upstream (NousResearch installer; network, slow)",
    )
    p.add_argument(
        "--offline",
        action="store_true",
        help="Skip hermes-upstream even if --with-real-hermes-install (hub clone still uses npm)",
    )
    p.add_argument(
        "--continue-on-failure",
        action="store_true",
        help="Run all scenarios even after a failure (exit code still nonzero if any failed)",
    )
    p.add_argument(
        "--no-fail-fast",
        action="store_true",
        help="Alias for --continue-on-failure",
    )
    return p.parse_args(argv)


def _valid_scenario_ids() -> frozenset[str]:
    return frozenset(
        {
            "fresh",
            "hermes",
            "hermes-upstream",
            "dashboard",
            "both",
            "update",
            "install_bootstrap",
            "install_in_repo",
            "update_preserves_sync_off",
            "update_sync_on",
            "all",
            "update-all",
        }
    )


def expand_scenarios(
    spec: str,
    *,
    profile: str,
    include_hermes_upstream: bool,
) -> list[str]:
    spec_l = spec.strip().lower()
    if spec_l in ("all", "update-all"):
        if profile == "smoke":
            return _smoke_scenarios(include_hermes_upstream=include_hermes_upstream)
        return _release_scenarios(include_hermes_upstream=include_hermes_upstream)

    parts = [x.strip() for x in spec.split(",") if x.strip()]
    valid = _valid_scenario_ids()
    for x in parts:
        if x not in valid:
            raise SystemExit(f"unknown scenario: {x}")
    if "all" in parts or "update-all" in parts:
        if profile == "smoke":
            return _smoke_scenarios(include_hermes_upstream=include_hermes_upstream)
        return _release_scenarios(include_hermes_upstream=include_hermes_upstream)
    return parts


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    hermes_url = os.environ.get("HERMES_INSTALL_URL", DEFAULT_HERMES_INSTALL_URL).strip()
    if not hermes_url:
        print("ERROR: HERMES_INSTALL_URL is empty", file=sys.stderr)
        return 2

    include_upstream = args.with_real_hermes_install and not args.offline
    names = expand_scenarios(
        args.scenarios,
        profile=args.profile,
        include_hermes_upstream=include_upstream,
    )

    continue_on = args.continue_on_failure or args.no_fail_fast
    h = Harness(
        repo_root=args.repo_root,
        skip_http=args.skip_http,
        keep_artifacts=args.keep_artifacts,
        with_real_hermes_install=include_upstream,
        hermes_install_url=hermes_url,
        profile=args.profile,
        fail_fast=True,
        continue_on_failure=continue_on,
    )
    h.register_cleanup()
    exit_ok = False
    try:
        print(
            f"[harness] profile={args.profile} scenarios={','.join(names)} "
            f"skip_http={args.skip_http}",
        )
        h.check_docker()
        h.build_image()
        exit_ok = h.run_scenarios(names)
        if exit_ok:
            print("\n[harness] ALL SCENARIOS PASSED")
    except subprocess.CalledProcessError as e:
        print(f"\n[harness] FAILED: {e}", file=sys.stderr)
        exit_ok = False
    except AssertionError as e:
        print(f"\n[harness] ASSERTION FAILED: {e}", file=sys.stderr)
        exit_ok = False
    finally:
        h.print_summary()
        h.cleanup()

    return 0 if exit_ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
