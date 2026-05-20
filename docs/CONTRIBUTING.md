# Contributing

If you've got this far thank you for considering to pitch in.

## Quick path to a merged PR

1. **Branch from `dev`** (not `main`).
2. **Build the thing** — fix, feature, or doc; match existing patterns in the tree you touched.
3. **Prove it** before you open the PR:

   ```bash
   npm run lint
   npx tsc --noEmit -p tsconfig.json
   npm test
   npm run test:coverage
   npm run build
   ```

4. **Open a PR into `dev`** with a clear title and what/why in the description.
5. **`main` only moves through reviewed PRs** — I merge `dev` → `main` when it is release-ready.

That is it. No secret handshake.

## Code standards (the boring but important bit)

- **TypeScript strict** — no `any`, no `@ts-ignore` without a fight.
- **API shape** — routes return `{ data?, error? }`.
- **Mutating routes** — respect `CH_READ_ONLY`, deploy gates (`CH_ENABLE_DEPLOY_API`), and signing where implemented (`src/lib/api-auth.ts`). There is no global API-key wall; run Control Hub on a network you trust or put your own proxy in front.
- **Paths** — validate filesystem writes under allowed roots; do not bypass the API to poke Hermes disk by hand from new code.
- **Do not commit junk** — `.next`, `coverage`, `test-results`, SQLite DBs, logs, `.env` with real keys.

If your change touches behaviour or config, **update docs in the same PR**. Stale docs are bugs.

## Local dev and tests

- First-time setup: `bash scripts/bootstrap/setup.sh` (writes `.env.local`, picks a free **PORT** in **42069–42100**, sets LAN dev origins).
- `npm run dev` / `npm run start` read `PORT` from the environment; the UI uses same-origin `/api/...` so it does not hardcode a port.
- **Playwright:** CI pins `PORT=3000`; locally follow `.env.local` unless you export `PORT` yourself.
- Fresh DB before E2E: `npm run prebuild`. Full detail: **[TESTING.md](TESTING.md)** (Jest layout, smoke flag, keeping `tests/e2e/app-routes.ts` in sync with the sidebar).

## Git hooks and CI

- Optional **pre-push hook** ([`scripts/git-hooks/pre-push`](../scripts/git-hooks/pre-push)): blocks direct pushes to `main`. Install with `git config core.hooksPath scripts/git-hooks` from the repo root.
- **Branch protection on `main`** is the real gate (PR + checks).
- **[`ci.yml`](../.github/workflows/ci.yml)** — lint, types, tests + coverage, build, E2E smoke (Ubuntu), build+test (macOS), shell script tests, Docker deploy smoke.
- **[`gitleaks.yml`](../.github/workflows/gitleaks.yml)** — please do not commit API keys. I will be grumpy.

## Where to look

| Topic | Doc |
|-------|-----|
| Operator install | [README.md](../README.md) |
| UI walkthrough | [USER_WALKTHROUGH_GUIDE.md](USER_WALKTHROUGH_GUIDE.md) |
| Deploy / `ch-deploy` | [DEPLOY.md](DEPLOY.md) |
| API reference | [API.md](API.md) |
| Doc index | [README.md](README.md) |

Questions? Open an issue or ask in the PR. Concrete repro steps beat "it broke."
