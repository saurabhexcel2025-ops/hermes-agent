# Testing

## Layout

| Path | Runner | Role |
|------|--------|------|
| `tests/unit/` | Jest | API contracts, parsers, security, repositories (heavy use of `jest.mock` for `fs`, `@/lib/hermes-agent-runtime`, DB). |
| `tests/e2e/` | Playwright | Browser flows against a real `next start` server (see `playwright.config.ts`). |
| `tests/jest.setup.ts` | Jest | Global setup and shared mocks (`jest.config.js` → `setupFilesAfterEnv`). |
| `tests/__mocks__/better-sqlite3.cjs` | Jest | CJS shim so the native `better-sqlite3` addon is never loaded in unit tests. |
| [`tests/scripts/run-shell-custom-tests.sh`](../tests/scripts/run-shell-custom-tests.sh) | Bash | Validates [`scripts/lib/ch-dotenv-local.sh`](../scripts/lib/ch-dotenv-local.sh), [`scripts/lib/ch-hermes-profile-templates.sh`](../scripts/lib/ch-hermes-profile-templates.sh), and the update-profile sync gate (mirror of `ch-deploy update`). Uses a fake `HERMES_HOME` under `/tmp` only. CI: **`shell-custom-scripts`** job. |

## Shell helper tests (bash)

```bash
bash tests/scripts/run-shell-custom-tests.sh
```

Docker (optional): `docker run --rm -v "$(pwd)":/work -w /work bash:5 bash tests/scripts/run-shell-custom-tests.sh`

## Unit tests (Jest)

```bash
npm test
npm run test:coverage
```

Config: [`jest.config.js`](../jest.config.js) at repo root.

## End-to-end tests (Playwright)

Playwright starts the app with **`npm run start`** (production server), not `next dev`, so behaviour matches deployable builds.

```bash
# Recommended on a fresh clone or after schema changes (SQLite migrations):
npm run prebuild
npm run build
npm run test:e2e
```

- **`PORT`:** `playwright.config.ts` uses `process.env.PORT` (default `3000`). CI sets `PORT=3000`.
- **`PLAYWRIGHT_SMOKE=1`:** When set, only [`tests/e2e/smoke.spec.ts`](../tests/e2e/smoke.spec.ts) runs (used in CI for speed). Omit it for the **full** E2E suite (navigation matrix, config sections, Story Weaver, etc.).

### Navigation matrix and sidebar

[`tests/e2e/app-routes.ts`](../tests/e2e/app-routes.ts) lists every path exercised by the navigation matrix. **`src/components/layout/sidebar-config.ts`** includes a comment: when you add or change sidebar `href` values, update `app-routes.ts` so E2E stays aligned.

## Local release-confidence harness (Docker)

**Local-only** heavy integration: [`tests/integration/test_full_install_update_process.py`](../tests/integration/test_full_install_update_process.py) builds an ephemeral image, runs scenarios in throwaway containers, and deletes them afterward. It exercises [`scripts/bootstrap/install.sh`](../scripts/bootstrap/install.sh) (bootstrap clone via `file://` bare repo + [`scripts/bootstrap/setup.sh`](../scripts/bootstrap/setup.sh)), [`scripts/bootstrap/install.sh --in-repo`](../scripts/bootstrap/install.sh), [`scripts/bootstrap/setup.sh`](../scripts/bootstrap/setup.sh), and [`scripts/application/ch-deploy.sh update`](../scripts/application/ch-deploy.sh), with runtime-generated markers under `CH_DATA_DIR` and `HERMES_HOME`. This is **not** part of CI—run it manually before releases. Complements [`tests/scripts/run-shell-custom-tests.sh`](tests/scripts/run-shell-custom-tests.sh).

**Prerequisites:** Docker daemon running; Python 3 (stdlib only).

Default **`--profile smoke`** (core personas + basic update). Use **`--profile release`** for the full matrix (install bootstrap / `bootstrap/install.sh --in-repo`, update with sync off/on).

```bash
python tests/integration/test_full_install_update_process.py --skip-http

python tests/integration/test_full_install_update_process.py --profile release --skip-http
```

npm: `npm run test:full-install` (smoke + `--skip-http`), `npm run test:full-install-release` (release profile).

**Flags:** `--with-real-hermes-install` appends **`hermes-upstream`** (network). **`--with-interactive`** appends a slow **TTY / expect** pack after **`--scenarios all`** (same ordering as non-interactive scenarios, then interactive ones). Rebuild the harness image after pulling changes so **`expect`** is present (`docker/TestHarness.dockerfile`). Use `--continue-on-failure` for a full matrix run; interactive scenarios complement non-interactive env-driven paths—they do not replace them.

**Interactive pack:** Runs only inside the container (`expect -f` via `docker exec -t`); the host stays cross-platform (no Windows `pty`). Longer wall time (`npm install` / `npm run build`). You can also run a single id explicitly, e.g. `--scenarios setup_interactive`.

**Non-interactive default:** Plain `docker exec` still uses env vars (`INSTALL_HINDSIGHT=no`, `CH_INSTALL_NONINTERACTIVE=1`, etc.). Base image: [`docker/TestHarness.dockerfile`](../docker/TestHarness.dockerfile). CRLF in `*.sh` is normalized on the copied workspace for Linux bash.

## Continuous integration

Primary pipeline: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — Ubuntu (`shell-custom-scripts`, install, `prebuild`, lint, Hermes-path grep gate, `tsc`, Jest coverage, build, Playwright smoke with `PLAYWRIGHT_SMOKE=1`) plus macOS build/test, and E2E smoke on Ubuntu.

Other workflows: **gitleaks** (secret scan).

## Auth in route tests

Many Jest suites mock **`@/lib/api-auth`** (`requireMcApiKey`, `requireNotReadOnly`). Mirror that pattern when adding new API route tests.
