"""The files the worker writes and the API reads.

Atlas keeps its sweep snapshot, the flood desk store and the delta memory as
JSON under runs/, shared between the API container and the worker through a
bind mount. That is a deliberate choice with a cost, and this module is where
the cost is contained.

**The worker is the only writer.** The API opens these files read-only. Two
processes doing read-modify-write on the same file is a race; one writer and
many readers is not.

**Every write is atomic.** The bytes go to a `.tmp` alongside the target and
are then renamed over it. Rename is atomic within a filesystem, so a reader
sees either the previous complete file or the next one — never the half-written
state that a plain write produces, which under a page polling every few seconds
is not a rare event but a routine one.

**A `.bak` is kept.** The previous version is preserved before each write, so a
process killed between truncate and rename still has a good file to fall back
to. read_json tries the backup when the primary will not parse.

**Reads never raise.** A missing or corrupt file answers None, and the caller
renders its empty state. During a live response a page that shows nothing with
an honest timestamp is correct; one that 500s is not.
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

# Filenames, in one place so the API and the worker cannot drift.
LATEST = "latest.json"
DASHBOARD = "dashboard.json"
FLOOD_DESK = "flood-desk.json"
FLOOD_PERSONS = "flood-desk-persons.json"
FLOOD_RESCUE = "flood-desk-rescue.json"
CLIMATE = "climate-context.json"
CLIMATE_ARRIVED = "climate-arrived.json"
MEMORY_DIR = "memory"
MEMORY_HOT = "hot.json"
MEMORY_COLD_DIR = "cold"


def runs_dir() -> Path:
    return settings.runs_dir


def path_for(name: str) -> Path:
    return runs_dir() / name


def ensure_dirs() -> bool:
    """Create runs/ and its memory subdirectories.

    Answers False rather than raising on a read-only filesystem: the API mounts
    runs/ read-only in production and calls this on start, and that is a normal
    state for it rather than a failure.
    """
    try:
        for directory in (
            runs_dir(),
            runs_dir() / MEMORY_DIR,
            runs_dir() / MEMORY_DIR / MEMORY_COLD_DIR,
        ):
            directory.mkdir(parents=True, exist_ok=True)
        return True
    except OSError as exc:
        log.warning("runs_dir_not_writable", dir=str(runs_dir()), error=str(exc))
        return False


def read_json(name: str) -> Any | None:
    """The parsed contents of one runs/ file, or None.

    Falls back to the `.bak` when the primary is missing or unparseable, which
    is what makes a write interrupted mid-rename survivable.
    """
    primary = path_for(name)
    for candidate in (primary, primary.with_suffix(primary.suffix + ".bak")):
        try:
            with candidate.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError:
            continue
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("runs_read_failed", file=str(candidate), error=str(exc))
            continue
    return None


def write_json(name: str, payload: Any) -> bool:
    """Write one runs/ file atomically. Worker only.

    Answers False rather than raising: a sweep that produced good data must not
    be lost because the disk is full or read-only. The data is still in memory
    and still goes out over SSE.
    """
    if not ensure_dirs():
        return False

    target = path_for(name)
    backup = target.with_suffix(target.suffix + ".bak")

    try:
        serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    except (TypeError, ValueError) as exc:
        log.error("runs_serialize_failed", file=name, error=str(exc))
        return False

    try:
        # Keep the previous version before touching the target, so a crash
        # during the write below still leaves something readable.
        if target.exists():
            try:
                backup.write_bytes(target.read_bytes())
            except OSError as exc:
                log.warning("runs_backup_failed", file=name, error=str(exc))

        # The temp file must share a directory with the target: rename is only
        # atomic within a filesystem, and /tmp is frequently a different one.
        handle = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=target.parent,
            prefix=f".{target.name}.",
            suffix=".tmp",
            delete=False,
        )
        try:
            with handle:
                handle.write(serialized)
                handle.flush()
                # Without this the rename can land before the bytes do, and a
                # power loss leaves a correctly named empty file.
                os.fsync(handle.fileno())
            os.replace(handle.name, target)
        except BaseException:
            Path(handle.name).unlink(missing_ok=True)
            raise
        return True
    except OSError as exc:
        log.warning("runs_write_failed", file=name, error=str(exc))
        return False


def remove(name: str) -> bool:
    """Delete one runs/ file and its backup."""
    removed = False
    target = path_for(name)
    for candidate in (target, target.with_suffix(target.suffix + ".bak")):
        try:
            candidate.unlink()
            removed = True
        except FileNotFoundError:
            continue
        except OSError as exc:
            log.warning("runs_remove_failed", file=str(candidate), error=str(exc))
    return removed


def exists(name: str) -> bool:
    return path_for(name).exists()
