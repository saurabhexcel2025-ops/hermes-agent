# Contributing

Participation in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Workflow

1. Branch from `dev`.
2. Implement change with tests.
3. Run:
   - `npm run lint`
   - `npx tsc --noEmit -p tsconfig.json`
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
4. Open PR to `dev`.
5. Merge to `main` only through reviewed PR flow.

## Standards

- TypeScript strict mode only.
- API routes return `{ data?, error? }`.
- Mutating routes respect **read-only** (`CH_READ_ONLY`), **deploy API** (`CH_ENABLE_DEPLOY_API`), and optional **request signing** where implemented (`src/lib/api-auth.ts`). There is no `CH_API_KEY` route gate—run the app on a trusted network or behind your own controls.
- Filesystem writes must use validated paths under allowed roots.
- Do not commit runtime artifacts (`.next`, `coverage`, `test-results`, databases, logs).

## Local server and E2E

- `scripts/setup.sh` writes **`.env.local`** with **`PORT`** (default: first free **42069–42100**) and **`CH_ALLOWED_DEV_ORIGINS`** for LAN `next dev` (HMR).
- **`npm run start`** / **`npm run start:network`** read **`PORT`** from the environment; Next.js also loads **`.env.local`** from the repo root when you start via npm.
- Playwright uses **`process.env.PORT`** (see `playwright.config.ts`). **CI sets `PORT=3000`** so the dev server URL stays fixed in automation. Locally, omit `PORT` to follow `.env.local`, or export `PORT` to match your setup.

The web UI uses **same-origin** `fetch("/api/...")` and path-only navigation, so it does not hardcode a TCP port.

Full Playwright and Jest notes (including **`npm run prebuild`** before E2E on a fresh DB, **`PLAYWRIGHT_SMOKE`**, and keeping **`tests/e2e/app-routes.ts`** aligned with the sidebar) live in **[TESTING.md](TESTING.md)**.

## Git hooks and branch protection

- This repo ships [`scripts/git-hooks/pre-push`](../scripts/git-hooks/pre-push): when installed as your Git hooks path (`git config core.hooksPath scripts/git-hooks` from the repo root, or by copying the script into `.git/hooks/pre-push`), it **blocks non-merge pushes directly to `main`** so day-to-day work stays on `dev` or feature branches.
- **Enforcement** is primarily **repository branch protection** on `main` (require PR, reviews, checks). The local hook is optional convenience.
- **Automation:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pushes and PRs to `main` and `dev`. [`.github/workflows/gitleaks.yml`](../.github/workflows/gitleaks.yml) runs secret scanning.

## Testing

See **[TESTING.md](TESTING.md)** for layout, commands, and CI. In short: add or update tests for every change; unit tests live in `tests/unit/`; E2E lives in `tests/e2e/`. CI is **[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)** (lint, typecheck, Jest with coverage, build, Playwright smoke on Ubuntu; build+test on macOS). **Gitleaks** runs via a separate workflow.

## Documentation

- Update docs in the same PR when behavior or configuration changes.
- Keep naming aligned with the shipped product (no legacy “edition” terminology).
- Keep docs implementation-accurate and remove stale references.
