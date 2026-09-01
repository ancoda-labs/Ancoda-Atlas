"""The desk store's versioning, and the cycle's failure isolation."""

import pytest

from app.core import runs_store
from app.domains.flood import store as desk_store
from app.domains.flood.tasks import _refresh


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    return tmp_path


class TestStoreShape:
    def test_an_empty_store_has_every_key_present(self):
        """A reader destructuring a missing key crashes as hard as a wrong value."""
        store = desk_store.empty_store()
        for key in desk_store._FEED_KEYS:
            assert key in store, f"{key} missing from the empty store"
        assert store["health"] == []
        assert store["lastRunAt"] is None

    def test_nothing_on_disk_is_an_empty_store_not_a_crash(self):
        assert desk_store.load()["lastRunAt"] is None

    def test_a_store_written_for_an_older_shape_is_discarded(self):
        """This is the bug the version exists for.

        The previous build's {lost, found} restored cleanly over a shape that
        now also expects `other`, and the rescue page threw for a reader.
        """
        runs_store.write_json(
            runs_store.FLOOD_DESK,
            {"version": 2, "opmcmPersons": {"lost": [], "found": []}, "lastRunAt": "old"},
        )
        assert desk_store.load()["lastRunAt"] is None

    def test_the_current_version_restores(self):
        runs_store.write_json(
            runs_store.FLOOD_DESK,
            {"version": desk_store.STORE_VERSION, "lastRunAt": "2026-08-31T00:00:00.000Z"},
        )
        assert desk_store.load()["lastRunAt"] == "2026-08-31T00:00:00.000Z"

    def test_v3_is_still_accepted(self):
        """A deliberately allowed predecessor, so one deploy is not a cold start."""
        runs_store.write_json(runs_store.FLOOD_DESK, {"version": 3, "lastRunAt": "x"})
        assert desk_store.load()["lastRunAt"] == "x"


class TestSidecarFiles:
    def test_the_heavy_registers_are_written_separately(self, isolated):
        """Nine megabytes of JSON inline was stalling the desk route."""
        store = desk_store.empty_store()
        store["opmcmPersons"] = {"lost": [{"id": "1"}], "found": [], "other": []}
        store["rescue"] = {"persons": [{"id": "a"}], "summary": {"total": 1}}
        desk_store.persist(store)

        main = runs_store.read_json(runs_store.FLOOD_DESK)
        assert main["opmcmPersons"] is None
        assert main["rescue"]["persons"] == []

        assert runs_store.read_json(runs_store.FLOOD_PERSONS)["lost"] == [{"id": "1"}]
        assert runs_store.read_json(runs_store.FLOOD_RESCUE)["persons"] == [{"id": "a"}]

    def test_the_registers_are_rejoined_on_load(self):
        store = desk_store.empty_store()
        store["opmcmPersons"] = {"lost": [{"id": "1"}], "found": [], "other": []}
        store["rescue"] = {"persons": [{"id": "a"}]}
        desk_store.persist(store)

        restored = desk_store.load()
        assert restored["opmcmPersons"]["lost"] == [{"id": "1"}]
        assert restored["rescue"]["persons"] == [{"id": "a"}]


class TestRefreshResilience:
    """The whole resilience story lives in one function."""

    async def test_a_successful_source_is_applied(self):
        store = desk_store.empty_store()
        health = await _refresh(
            "river", store, _returns({"gauges": [1]}), _sets(store, "river")
        )
        assert health["ok"] is True
        assert store["river"] == {"gauges": [1]}

    async def test_a_failed_source_leaves_the_previous_value_standing(self):
        """A portal that fell over must not blank the section."""
        store = desk_store.empty_store()
        store["river"] = {"gauges": ["yesterday"]}
        health = await _refresh("river", store, _raises("BIPAD down"), _sets(store, "river"))

        assert health["ok"] is False
        assert health["error"] == "BIPAD down"
        assert store["river"] == {"gauges": ["yesterday"]}

    async def test_a_failure_preserves_the_last_success_time(self):
        """So the page can say how old the figures it IS showing are."""
        store = desk_store.empty_store()
        store["health"] = [
            {"key": "river", "ok": True, "lastSuccess": "2026-08-31T10:00:00.000Z"}
        ]
        health = await _refresh("river", store, _raises("down"), _sets(store, "river"))
        assert health["lastSuccess"] == "2026-08-31T10:00:00.000Z"

    async def test_a_first_ever_failure_reports_no_last_success(self):
        store = desk_store.empty_store()
        health = await _refresh("river", store, _raises("down"), _sets(store, "river"))
        assert health["lastSuccess"] is None

    async def test_one_source_failing_does_not_affect_another(self):
        store = desk_store.empty_store()
        await _refresh("river", store, _raises("down"), _sets(store, "river"))
        await _refresh("alerts", store, _returns([1, 2]), _sets(store, "alerts"))
        assert store["alerts"] == [1, 2]


def test_the_refresh_interval_can_never_go_below_two_minutes(monkeypatch):
    """Below that this hammers government portals during the exact event that
    already has everyone else hammering them."""
    monkeypatch.setattr(desk_store.settings, "FLOOD_REFRESH_INTERVAL_MINUTES", 1)
    assert desk_store.interval_minutes() == 2


def _returns(value):
    async def load():
        return value

    return load


def _raises(message):
    async def load():
        raise RuntimeError(message)

    return load


def _sets(store, key):
    def apply(value):
        store[key] = value

    return apply
