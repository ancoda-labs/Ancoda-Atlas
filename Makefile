COMPOSE := docker compose -f infra/dev/docker-compose.yml --env-file .env
BE      := docker compose -f infra/split/docker-compose.be.yml --env-file .env
FE      := docker compose -f infra/split/docker-compose.fe.yml --env-file .env

.DEFAULT_GOAL := help
.PHONY: help up down restart build logs ps shell sweep flood diag migrate \
        test lint typecheck hooks fe-install fe-dev fe-build clean storage \
        be fe

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ── Stack ─────────────────────────────────────────────────────────────────────
up: ## Start the dev stack
	$(COMPOSE) up -d
	@echo ""
	@echo "Dashboard   http://localhost:$${PORT:-3117}"
	@echo "Flood desk  http://localhost:$${PORT:-3117}/bhotekoshi-flood"
	@echo "API         http://localhost:$${API_HOST_PORT:-8000}"
	@echo "API docs    http://localhost:$${API_HOST_PORT:-8000}/docs"
	@echo ""
	@echo "The first hazard sweep and flood refresh run on worker start —"
	@echo "'make logs' to watch them land. Until they do, the dashboard"
	@echo "renders its empty skeleton rather than stale figures."

down: ## Stop the dev stack
	$(COMPOSE) down

restart: ## Restart the API, worker and scheduler
	$(COMPOSE) restart api worker beat

build: ## Rebuild images
	$(COMPOSE) build

logs: ## Tail all logs
	$(COMPOSE) logs -f

ps: ## Show container status
	$(COMPOSE) ps

shell: ## Open a shell in the API container
	$(COMPOSE) exec api bash

storage: ## Start the optional local MinIO sidecar
	$(COMPOSE) --profile storage up -d minio
	@echo "MinIO console http://localhost:$${MINIO_CONSOLE_PORT:-9001}"

# ── Data ──────────────────────────────────────────────────────────────────────
sweep: ## Run one national hazard sweep by hand
	$(COMPOSE) exec api python -m scripts.sweep

flood: ## Run one flood desk refresh by hand
	$(COMPOSE) exec api python -m scripts.flood_refresh

diag: ## Check Python, imports, ports and which keys are set
	$(COMPOSE) exec api python -m scripts.diag

migrate: ## Check the Supabase schema is reachable (PostgREST cannot run DDL)
	$(COMPOSE) exec api python -m scripts.migrate_check

clean: ## Delete the runtime sweep and desk files in runs/
	$(COMPOSE) exec api python -m scripts.clean

# ── Quality ───────────────────────────────────────────────────────────────────
hooks: ## Enable the versioned git hooks in .githooks
	git config core.hooksPath .githooks
	@echo "Hooks on. Commits are now checked for message shape, types and build."

test: ## Run the backend test suite
	$(COMPOSE) exec api python -m pytest

lint: ## Lint the backend
	$(COMPOSE) exec api python -m ruff check app scripts tests

typecheck: ## Type-check the backend
	$(COMPOSE) exec api python -m mypy

# ── Frontend ──────────────────────────────────────────────────────────────────
fe-install: ## Install frontend dependencies
	cd frontend && npm install

fe-dev: ## Run the frontend dev server on the host
	cd frontend && npm run dev

fe-build: ## Type-check and build the frontend
	cd frontend && npm run build

# ── Split deployment ──────────────────────────────────────────────────────────
#
# Two halves on two machines. The backend keeps the worker, the disk and the
# clock; the frontend only renders and calls the API. `make up` above is still
# the way to run both together on one box.
#
# Set ALLOWED_ORIGINS on the backend to the frontend's origin before either is
# useful — cross-origin is the whole point of this split, and without it every
# browser call fails preflight.

be: ## Start the backend alone (API, worker, beat, Redis) on this machine
	$(BE) up -d --build
	@echo ""
	@echo "API        https://$${DOMAIN_API:-atlas-api.ancodalabs.com}"
	@echo "Answering  $${ALLOWED_ORIGINS:-https://$${DOMAIN_FRONTEND:-atlas.ancodalabs.com}}"
	@echo ""
	@echo "'docker compose -f infra/split/docker-compose.be.yml logs -f worker'"
	@echo "to watch the first sweep land. Until it does the desk reports"
	@echo "'awaiting first cycle', which is honest rather than broken."

fe: ## Start the frontend alone, pointed at a remote API
	$(FE) up -d --build
	@echo ""
	@echo "Frontend   https://$${DOMAIN_FRONTEND:-atlas.ancodalabs.com}"
	@echo "Calling    $${NEXT_PUBLIC_API_BASE_URL:-https://$${DOMAIN_API:-atlas-api.ancodalabs.com}}"
	@echo ""
	@echo "On Cloudflare this stack is not used — set NEXT_PUBLIC_API_BASE_URL"
	@echo "and ATLAS_API_BASE_URL in its build settings instead."
