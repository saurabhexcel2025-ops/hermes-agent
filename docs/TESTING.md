# Testing

## Layout

| Path | Runner | Role |
|------|--------|------|
| `tests/unit/` | Jest | API contracts, parsers, security, repositories (heavy use of `jest.mock` for `fs`, `@/lib/hermes-agent-runtime`, DB). |
| `tests/e2e/` | Playwright | Browser flows against a real `next start` server (see `playwright.config.ts`). |
| `tests/jest.setup.ts` | Jest | Global setup and shared mocks (`jest.config.js` → `setupFilesAfterEnv`). |
| `tests/__mocks__/better-sqlite3.cjs` | Jest | CJS shim so the native `better-sqlite3` addon is never loaded in unit tests. |

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

## Continuous integration

Primary pipeline: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — Ubuntu (install, `prebuild`, lint, Hermes-path grep gate, `tsc`, Jest coverage, build, Playwright smoke with `PLAYWRIGHT_SMOKE=1`) plus macOS build/test, and a separate Ubuntu job for E2E smoke.

Other workflows: **gitleaks** (secret scan), **branch-guard** (informational notice on push to `main`).

## Auth in route tests

Many Jest suites mock **`@/lib/api-auth`** (`requireMcApiKey`, `requireNotReadOnly`). Mirror that pattern when adding new API route tests.
