"""Structured logging.

Atlas logs are read two ways: by a person watching `make logs` during a live
response, and by whatever collects them in production. Development gets the
console renderer; production gets JSON.
"""

import logging
import sys

import structlog

from app.core.config import settings


def configure_logging() -> None:
    # stderr, not stdout. Every source module is documented as runnable alone
    # and its JSON piped somewhere — `python -m app.domains.hazards.sources.seismic
    # | jq`. A log line on stdout corrupts that stream, which is exactly what
    # happened the first time this was run standalone.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stderr,
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    )

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    processors.append(
        structlog.processors.JSONRenderer()
        if settings.is_production
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
