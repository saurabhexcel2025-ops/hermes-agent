# Shell integration tests (Hermes profile helpers)

Runs in **bash** with a fake `HERMES_HOME` under `/tmp` — does **not** touch `~/.hermes` or run `git pull`.

```bash
# From repo root (Linux / macOS / WSL / Git Bash), or:
docker run --rm -v "$(pwd)":/work -w /work bash:5 bash tests/scripts/run-shell-custom-tests.sh
```

Exit code **0** = all checks passed.

The update-profile gate assertions **must stay aligned** with the `case` / TTY block in `scripts/lib/ch-deploy-impl.sh` (search for `CH_UPDATE_SYNC_HERMES_PROFILE_TEMPLATES`).

## Docker — dashboard restart smoke

From repo root on a machine with Docker (Linux CI, Docker Desktop, WSL):

```bash
docker build -f Dockerfile -t control-hub:ci .
CH_DOCKER_TEST_IMAGE=control-hub:ci bash tests/scripts/docker-deploy-api-smoke.sh
```

Builds the image if missing, runs a container, hits **`GET /api/update?branch=dev`** and **`POST /api/update` `{ action: restart }`**, then verifies **`/`** still responds. Does **not** run `git pull` / rebuild (no `.git` in the default image).
