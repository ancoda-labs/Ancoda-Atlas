# Production stack

A single host running Docker Compose behind Traefik v3, which terminates
TLS and renews Let's Encrypt certificates on its own.

| Service | Public at | Notes |
|---|---|---|
| `frontend` | `atlas.ancodalabs.com` | Next.js server, not a static export |
| `api` | `atlas-api.ancodalabs.com` | FastAPI, `runs/` mounted read-only |
| `worker` | — | Runs the sweeps. One replica, always. |
| `beat` | — | The schedule |
| `redis` | — | Celery broker and the SSE signal channel |
| `traefik` | `:80`, `:443` | HTTP redirects to HTTPS |

## Why one host

Atlas keeps its sweep snapshot, flood desk store and delta memory as JSON
files under `runs/`, shared between the API and the worker through a bind
mount. Bind mounts are host-local, so every service that touches `runs/`
has to live on the same machine — which rules out spreading replicas
across Swarm nodes the way Parichaya does.

The worker is additionally pinned to one replica because it is the sole
writer of those files; a second one would interleave its writes into the
same sweep.

This is a deliberate trade, not an oversight. Moving that state into
Postgres or Redis is the prerequisite for scaling out, and it should
happen before this file becomes a Swarm stack, not after.

## Deploy

```bash
cp .env.example .env          # at the repository root, then fill it in
docker compose -f infra/prod/docker-compose.yml --env-file .env up -d --build
```

Required in `.env` beyond the development set:

| Var | Why |
|---|---|
| `DOMAIN_FRONTEND` | Traefik host rule for the site |
| `DOMAIN_API` | Traefik host rule for the API, and the URL baked into the browser bundle |
| `ACME_EMAIL` | Let's Encrypt registration |
| `ATLAS_RUNS_PATH` | Absolute host path for `runs/`, on a disk that survives a redeploy |
| `ATLAS_MEDIA_SECRET` | Signs every media-proxy URL. Must be set and stable. |
| `ATLAS_IP_SALT` | Salts the upload rate-limit hashes |
| `FLOOD_ADMIN_TOKEN` | Without it, photo takedown returns 404 |

The first three of those foot-guns are the ones that fail quietly rather
than loudly: an unset `ATLAS_MEDIA_SECRET` mints a random key per process,
so every image link breaks on restart.

## The API base URL is two different values

`NEXT_PUBLIC_API_BASE_URL` is baked into the browser bundle at **build**
time and must be the public hostname a reader's browser can reach.
`ATLAS_API_BASE_URL` is read at **runtime** by the server-rendered
dashboard and points at `http://api:8000` on the internal network, so the
first paint does not go back out through Traefik to reach a container
sitting beside it.
