"""The store's job is to survive interruption, not just to write."""

import json

import pytest

from app.core import runs_store


@pytest.fixture(autouse=True)
def isolated_runs(tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.runs_store.settings.ATLAS_RUNS_DIR", str(tmp_path))
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    return tmp_path


def test_a_missing_file_reads_as_none_not_an_error():
    """Before the first sweep there is nothing to read, and that is normal."""
    assert runs_store.read_json(runs_store.DASHBOARD) is None


def test_write_then_read_round_trips():
    assert runs_store.write_json(runs_store.DASHBOARD, {"meta": {"sourcesOk": 5}}) is True
    assert runs_store.read_json(runs_store.DASHBOARD) == {"meta": {"sourcesOk": 5}}


def test_no_temp_files_are_left_behind(isolated_runs):
    """A leftover .tmp would accumulate one file per sweep, forever."""
    runs_store.write_json(runs_store.DASHBOARD, {"a": 1})
    runs_store.write_json(runs_store.DASHBOARD, {"a": 2})
    leftovers = [p.name for p in isolated_runs.iterdir() if p.name.endswith(".tmp")]
    assert leftovers == []


def test_a_corrupt_primary_falls_back_to_the_backup(isolated_runs):
    """This is the crash-recovery path, and the reason a .bak is kept.

    A process killed between truncate and rename leaves an unparseable primary.
    The previous sweep's figures are older but true, and serving them beats
    serving nothing.
    """
    runs_store.write_json(runs_store.DASHBOARD, {"generation": 1})
    runs_store.write_json(runs_store.DASHBOARD, {"generation": 2})

    # Generation 1 is now the backup; corrupt the primary as a torn write would.
    (isolated_runs / runs_store.DASHBOARD).write_text("{ this is not json")

    assert runs_store.read_json(runs_store.DASHBOARD) == {"generation": 1}


def test_a_corrupt_primary_with_no_backup_reads_as_none(isolated_runs):
    (isolated_runs / runs_store.DASHBOARD).write_text("{ truncated")
    assert runs_store.read_json(runs_store.DASHBOARD) is None


def test_unserializable_payload_fails_without_destroying_the_good_file(isolated_runs):
    """A bug in a synthesizer must not take out the last good sweep."""
    runs_store.write_json(runs_store.DASHBOARD, {"good": True})

    class NotSerializable:
        pass

    assert runs_store.write_json(runs_store.DASHBOARD, {"bad": NotSerializable()}) is False
    assert runs_store.read_json(runs_store.DASHBOARD) == {"good": True}


def test_nepali_text_survives_the_round_trip():
    """The desk is bilingual; ensure_ascii would mangle every Devanagari string."""
    runs_store.write_json(runs_store.FLOOD_DESK, {"place": "स्याफ्रुबेंसी"})
    assert runs_store.read_json(runs_store.FLOOD_DESK) == {"place": "स्याफ्रुबेंसी"}


def test_written_json_is_valid_on_disk(isolated_runs):
    runs_store.write_json(runs_store.LATEST, {"sources": {"Seismic": {"events": []}}})
    on_disk = json.loads((isolated_runs / runs_store.LATEST).read_text(encoding="utf-8"))
    assert on_disk["sources"]["Seismic"] == {"events": []}


def test_remove_clears_the_backup_too(isolated_runs):
    """A clean that leaves the .bak brings the stale figures straight back."""
    runs_store.write_json(runs_store.DASHBOARD, {"n": 1})
    runs_store.write_json(runs_store.DASHBOARD, {"n": 2})
    assert runs_store.remove(runs_store.DASHBOARD) is True
    assert runs_store.read_json(runs_store.DASHBOARD) is None
