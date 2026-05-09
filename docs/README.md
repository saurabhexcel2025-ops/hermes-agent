# Documentation index

| Document | Description |
|----------|-------------|
| [CONTROL_HUB.md](CONTROL_HUB.md) | What this repo is and where to read next |
| [API.md](API.md) | REST endpoints |
| [DEPLOY.md](DEPLOY.md) | Deploy, TLS, Docker, ports |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development workflow and standards |
| [TESTING.md](TESTING.md) | Jest, Playwright, CI, and navigation-matrix upkeep |
| [SUPPORT.md](SUPPORT.md) | Where to get help; upstream vs this repo |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards |
| [MIGRATION.md](MIGRATION.md) | Data directory and migrations |
| [HERMES_CONFIG_INTEGRATION.md](HERMES_CONFIG_INTEGRATION.md) | Hermes `config.yaml` integration |
| [PLATFORM_VISION.md](PLATFORM_VISION.md) | Architecture and product direction |
| [Pull request template](../.github/pull_request_template.md) | PR checklist (GitHub prefill) |
| [internal/README.md](internal/README.md) | Internal / scratch notes |

## Mission and template schemas

Versioned Zod schemas live under [`src/lib/schema/`](../src/lib/schema/). JSON Schema mirrors live in `src/lib/schema/json/`. Maintainer notes:

- [SCHEMA_VERSIONING.md](schema/SCHEMA_VERSIONING.md) — versioning and bump policy
- [CHANGELOG.md](schema/CHANGELOG.md) — schema contract history

After changing Zod definitions, regenerate JSON from the repo root:

```bash
npm run generate:schema-json
```
