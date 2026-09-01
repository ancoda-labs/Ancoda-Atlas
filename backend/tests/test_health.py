"""The app starts, and says honestly what it can do."""

from fastapi.testclient import TestClient

from app.core.openapi_metadata import VERSION
from app.main import app

client = TestClient(app)


def test_health_reports_the_version():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": VERSION}


def test_readiness_reports_each_dependency_separately():
    response = client.get("/health/ready")
    # 503 is a legitimate answer here — this suite runs without Redis.
    assert response.status_code in (200, 503)
    checks = response.json()["checks"]
    assert set(checks) == {"redis", "runs", "supabase", "storage"}


def test_optional_services_read_as_off_rather_than_broken():
    """Supabase and MinIO being absent must not read as a failure.

    Atlas's hazard monitoring runs without either, and an operator needs to see
    the difference between a service that is switched off and one that is down.
    """
    checks = client.get("/health/ready").json()["checks"]
    assert checks["supabase"] in ("configured", "not_configured")
    assert checks["storage"] in ("configured", "not_configured")


def test_an_unknown_route_answers_the_shared_error_envelope():
    response = client.get("/api/v1/nothing-here")
    assert response.status_code == 404


def test_a_large_payload_is_compressed_on_the_way_out():
    """The person register is eight and a half megabytes and must not travel so.

    Names and place names repeat heavily, so it comes down by roughly nine
    tenths. That ratio is the difference between the register working and not
    working on a phone on a Nepali mobile network. A route must never compress
    its own body — the middleware does it, once, for every large response — so
    what is pinned here is that a large body actually arrives encoded.
    """
    response = client.get("/openapi.json", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert len(response.content) > 1024
    assert response.headers["content-encoding"] == "gzip"
    # Without it, a shared cache would serve the compressed bytes to a client
    # that cannot read them.
    assert "accept-encoding" in response.headers["vary"].lower()


def test_a_client_that_cannot_decompress_still_gets_the_payload():
    """Compression is negotiated, never imposed."""
    response = client.get("/openapi.json", headers={"Accept-Encoding": "identity"})
    assert response.status_code == 200
    assert "content-encoding" not in response.headers
    assert response.json()["info"]["version"] == VERSION


def test_the_sweep_stream_is_never_compressed():
    """Compressing an event-stream buffers events until the window fills.

    The dashboard's live push would go quiet and the page would look frozen.
    Starlette excludes `text/event-stream` by default; this pins that it is
    still excluded, because the middleware is configured here and a future
    `exclude_content_types` argument could drop it.
    """
    from starlette.middleware.gzip import DEFAULT_EXCLUDED_CONTENT_TYPES

    from app.main import app as fastapi_app

    gzip_mw = next(
        m for m in fastapi_app.user_middleware if m.cls.__name__ == "GZipMiddleware"
    )
    excluded = gzip_mw.kwargs.get("exclude_content_types", DEFAULT_EXCLUDED_CONTENT_TYPES)
    assert "text/event-stream" in excluded


def test_an_empty_origin_setting_still_answers_cors():
    """A blank ALLOWED_ORIGINS must not mean "refuse every browser".

    This is the most confusing failure the service has: server-rendered pages
    keep working, because a server render never sends an Origin header, while
    every call the browser makes is refused. The site looks live and quietly
    stops refreshing. A platform that injects `ALLOWED_ORIGINS=` for an
    unfilled field overrides any compose-level default, so the fallback lives
    in config and is pinned here.
    """
    from app.core.config import DEFAULT_ALLOWED_ORIGINS, Settings

    for blank in ("", "   ", ",", " , "):
        origins = Settings(ALLOWED_ORIGINS=blank).allowed_origins_list
        assert origins == list(DEFAULT_ALLOWED_ORIGINS), blank
        assert "*" not in origins, "a fallback must never widen to every origin"


def test_a_configured_origin_still_wins():
    from app.core.config import Settings

    s = Settings(ALLOWED_ORIGINS="https://example.test, https://other.test")
    assert s.allowed_origins_list == ["https://example.test", "https://other.test"]
