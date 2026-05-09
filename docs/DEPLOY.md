# Deploying Control Hub

## Host and port

Next.js reads **`PORT`**. After **`bash scripts/setup.sh`**, `.env.local` contains **`PORT`** (first free in **42069–42100** by default, or your chosen port) and **`CH_ALLOWED_DEV_ORIGINS`** for LAN development.

For **production / household LAN**, prefer **`npm run start:network`** (`next start -H 0.0.0.0`), which avoids Next.js dev-only cross-origin checks on `/_next/webpack-hmr`.

For **`next dev` on another machine** using a URL with a **literal IP** (e.g. `http://192.168.1.10:42069`), the browser `Origin` must be listed in **`CH_ALLOWED_DEV_ORIGINS`** (setup generates common cases). Opening the site via a **`.local` hostname** matches the `*.local` pattern in `next.config.ts` without extra entries.

Override the host port in Docker Compose with **`PORT`** (see `docker-compose.yml`).

## Required environment

| Variable | Purpose |
|----------|---------|
| `HERMES_HOME` / `AGENT_HOME` | Hermes install root; seeds `agents-registry.json` if missing. Optional for standalone Control Hub. |
| `CH_DATA_DIR` | Control Hub JSON root (default `~/control-hub/data`). Holds `agents-registry.json` and optional `agents.discovery.json`. |
| `CH_SCRIPTS_DIR` / `CH_HARDWARE_LOG_DIR` | Hardware cron script prefix and logs (default `CH_DATA_DIR/scripts` and `CH_DATA_DIR/logs`). |
| `CH_READ_ONLY` | Set to `1` for read-only UI/API. |

Run Control Hub where you trust the network, or place it behind your own reverse proxy and access controls. **`CH_REQUEST_SIGNING_SECRET`** can optionally protect specific flows (see `src/lib/api-auth.ts`).

## Docker

```bash
docker compose build
docker compose up -d
```

The image defaults to **`PORT=42069`** (override with `-e PORT=...` or Compose `environment`). Map the same value on the host, e.g. `PORT=42069 docker compose up -d`.

Mount `CH_DATA_DIR` (and optionally `CH_SCRIPTS_DIR` / `CH_HARDWARE_LOG_DIR` if you keep hardware cron scripts outside the data tree) so the active Hermes install and Control Hub state match the host.

## TLS

Use a reverse proxy with automatic certificates (Let’s Encrypt). Do not commit TLS material into the repo.
