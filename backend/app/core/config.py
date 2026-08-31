"""Every setting Atlas reads, in one place.

Ported from atlas.config.mjs, and deliberately keeping the same environment
variable names — the .env that ran the Node build runs this one unchanged.

Almost everything here is optional. That is not laziness: Atlas's hazard
monitoring is file- and API-backed and must keep working on a box with no
database, no object storage, no LLM key and no alerting. Each feature that
needs a service hides itself when the service is absent, rather than failing
the page around it.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repository root, from backend/app/core/config.py.
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # In Docker the values arrive as real environment variables through
        # compose's env_file, and none of these paths exist. On the host, the
        # single .env lives at the repository root, one level above backend/.
        env_file=(REPO_ROOT / ".env", Path(".env"), Path("../.env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    APP_ENV: Literal["development", "production"] = "development"
    API_PREFIX: str = "/api/v1"
    LOG_LEVEL: str = "INFO"
    # The frontend's origin. It proxies /api through itself in development, so
    # this matters mainly for a deployment that serves the two from different
    # hosts.
    ALLOWED_ORIGINS: str = "http://localhost:3117"

    # ── Geographic focus ──────────────────────────────────────────────────────
    # The bounding box, provinces and cities live in app/core/nepal.py. Do not
    # scatter coordinates; that file is the one source.
    TIMEZONE: str = "Asia/Kathmandu"

    # ── Sweep cadence ─────────────────────────────────────────────────────────
    REFRESH_INTERVAL_MINUTES: int = 15
    # Below a couple of minutes this would hammer government portals during the
    # exact event that already has everyone else hammering them. Clamped in
    # flood_refresh_minutes below rather than trusted from the environment.
    FLOOD_REFRESH_INTERVAL_MINUTES: int = 10

    # Where the sweep snapshot, the flood desk store and the delta memory live.
    # The worker writes this directory and the API reads it.
    ATLAS_RUNS_DIR: str = "./runs"

    # ── Redis ─────────────────────────────────────────────────────────────────
    # Celery's broker, and the channel the worker uses to tell the API that a
    # sweep landed. It carries the signal, never the state.
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    # ── Hazard source keys ────────────────────────────────────────────────────
    # Most sources need none. USGS and the Open-Meteo feeds are open; only
    # these two ask for anything.
    FIRMS_MAP_KEY: str = ""
    RELIEFWEB_APPNAME: str = ""
    YOUTUBE_API_KEY: str = ""

    # ── Media proxy ───────────────────────────────────────────────────────────
    # Signs the URLs every photograph on the flood desk is served through. The
    # proxy only fetches a URL Atlas signed itself, which is what stops it being
    # an open proxy.
    #
    # Left empty a random key is generated per process, and then a restart
    # invalidates every link already on a reader's page. Required in production.
    ATLAS_MEDIA_SECRET: str = ""

    # ── Flood desk admin ──────────────────────────────────────────────────────
    # Empty means the refresh POST and the photo DELETE answer 404 rather than
    # standing open.
    FLOOD_REFRESH_TOKEN: str = ""
    FLOOD_ADMIN_TOKEN: str = ""
    # Salts the hashes behind the upload rate limit. Random per process when
    # unset, which resets everyone's allowance on restart.
    ATLAS_IP_SALT: str = ""

    # ── Supabase (optional) ───────────────────────────────────────────────────
    # Over PostgREST, not a Postgres socket. Backs only the features that must
    # remember something between requests.
    NEXT_PUBLIC_SUPABASE_URL: str = ""
    SUPABASE_URL: str = ""
    # The secret key, never the publishable one: these tables have row-level
    # security on with no policies, so the browser-facing key reads nothing.
    SUPABASE_SECRET_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # ── MinIO (optional) ──────────────────────────────────────────────────────
    MINIO_ENDPOINT: str = ""
    MINIO_PUBLIC_ENDPOINT: str = ""
    MINIO_ROOT_USER: str = ""
    MINIO_ROOT_PASSWORD: str = ""
    MINIO_SECURE: bool = True
    MINIO_BUCKET: str = "atlas"
    MINIO_REGION: str = "us-east-1"
    MINIO_PRESIGNED_EXPIRY_SECONDS: int = 3600

    # ── LLM (optional) ────────────────────────────────────────────────────────
    # grok is xAI; groq is api.groq.com. One letter apart, different services.
    LLM_PROVIDER: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""
    LLM_BASE_URL: str = ""
    OLLAMA_BASE_URL: str = ""
    LLM_REASONING_EFFORT: str = ""

    # ── Alerts (optional) ─────────────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    TELEGRAM_CHANNELS: str = ""
    DISCORD_BOT_TOKEN: str = ""
    DISCORD_CHANNEL_ID: str = ""
    DISCORD_GUILD_ID: str = ""
    DISCORD_WEBHOOK_URL: str = ""

    # ── Derived ───────────────────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def runs_dir(self) -> Path:
        path = Path(self.ATLAS_RUNS_DIR)
        return path if path.is_absolute() else (REPO_ROOT / path).resolve()

    @property
    def broker_url(self) -> str:
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def result_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL

    @property
    def flood_refresh_minutes(self) -> int:
        """Never faster than two minutes, whatever the environment says."""
        return max(self.FLOOD_REFRESH_INTERVAL_MINUTES, 2)

    @property
    def supabase_url(self) -> str:
        return self.NEXT_PUBLIC_SUPABASE_URL or self.SUPABASE_URL

    @property
    def supabase_key(self) -> str:
        """SUPABASE_SERVICE_ROLE_KEY is still read so a project on the older
        key naming keeps working."""
        return self.SUPABASE_SECRET_KEY or self.SUPABASE_SERVICE_ROLE_KEY

    @property
    def is_db_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)

    @property
    def is_storage_configured(self) -> bool:
        return bool(self.MINIO_ENDPOINT and self.MINIO_ROOT_USER and self.MINIO_ROOT_PASSWORD)

    @property
    def is_llm_configured(self) -> bool:
        return bool(self.LLM_PROVIDER and self.LLM_API_KEY)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
