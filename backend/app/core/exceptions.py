"""The error shape every route answers with.

One envelope — `{"error": {"code", "message", "details"}}` — so the frontend
has a single thing to read rather than a different shape per route.
"""

from typing import Any


class AppError(Exception):
    """A failure the caller should be told about in the response body."""

    status_code: int = 400
    code: str = "BAD_REQUEST"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.details = details or {}


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ValidationError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"


class ServiceUnavailableError(AppError):
    """A dependency Atlas can run without is not configured or not reachable.

    Deliberately distinct from a 500: the ground-report and digest features
    answer this when Supabase or MinIO are absent, and the desk around them
    keeps working.
    """

    status_code = 503
    code = "SERVICE_UNAVAILABLE"


class UpstreamError(AppError):
    """A government portal or hazard feed failed.

    Atlas reports this rather than substituting a figure. An empty or stale
    reading with an honest timestamp is correct; an invented one is not.
    """

    status_code = 502
    code = "UPSTREAM_ERROR"
