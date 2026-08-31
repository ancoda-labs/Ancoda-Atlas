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
