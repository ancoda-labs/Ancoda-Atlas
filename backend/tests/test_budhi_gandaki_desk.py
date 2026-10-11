"""The Budhi Gandaki desk: its own scope, its own content, and no Bhotekoshi figures."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core import runs_store
from app.domains.flood import store as desk_store
from app.domains.flood.content import load_flood_content
from app.domains.flood.scope import (
    BUDHI_GANDAKI_START,
    in_budhi_gandaki_scope,
    in_rasuwa_scope,
)
from app.domains.flood.sources.bipad import get_corridor_incidents
from app.main import app

client = TestClient(app)

DESK = "budhi-gandaki-flood"
JAGAT = (28.3514, 84.8959)
BETRAWATI = (27.97, 85.18)
BENIGHAT_BAZAAR = (27.7835, 84.7951)


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    return tmp_path


class TestScope:
    """The valley sits inside the Rasuwa corridor box, so the two desks are told
    apart by place and date. Getting this wrong counts one flood's incidents on
    the other flood's page."""

    def test_the_valley_after_the_flood_is_budhi_gandaki_not_rasuwa(self):
        on = f"{BUDHI_GANDAKI_START}T04:00:00"
        assert in_budhi_gandaki_scope(*JAGAT, on) is True
        assert in_rasuwa_scope(*JAGAT, on) is False

    def test_the_valley_before_the_flood_stays_with_rasuwa(self):
        assert in_rasuwa_scope(*JAGAT, "2026-08-30") is True
        assert in_budhi_gandaki_scope(*JAGAT, "2026-08-30") is False

    def test_the_trishuli_is_never_taken_for_the_budhi_gandaki(self):
        assert in_rasuwa_scope(*BETRAWATI, BUDHI_GANDAKI_START) is True
        assert in_budhi_gandaki_scope(*BETRAWATI, BUDHI_GANDAKI_START) is False

    def test_benighat_bazaar_on_the_trishuli_stays_with_rasuwa(self):
        assert in_rasuwa_scope(*BENIGHAT_BAZAAR, BUDHI_GANDAKI_START) is True
        assert in_budhi_gandaki_scope(*BENIGHAT_BAZAAR, BUDHI_GANDAKI_START) is False

    def test_an_undated_valley_incident_is_on_neither_desk(self):
        assert in_rasuwa_scope(*JAGAT, None) is False
        assert in_budhi_gandaki_scope(*JAGAT, None) is False


@respx.mock
async def test_bipad_incidents_split_between_the_desks():
    respx.get(url__startswith="https://bipadportal.gov.np").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 1,
                        "incidentOn": "2026-10-11T05:00:00",
                        "point": {"coordinates": [JAGAT[1], JAGAT[0]]},
                    },
                    {
                        "id": 2,
                        "incidentOn": "2026-10-11T06:00:00",
                        "point": {"coordinates": [BETRAWATI[1], BETRAWATI[0]]},
                    },
                ],
                "next": None,
            },
        )
    )
    bg = await get_corridor_incidents(since="2026-10-10", scope=DESK)
    rasuwa = await get_corridor_incidents(since="2026-10-10")
    assert {i["id"] for i in bg["incidents"]} == {1}
    assert {i["id"] for i in rasuwa["incidents"]} == {2}


class TestContent:
    def test_every_breakdown_reconciles(self):
        assert load_flood_content(DESK)["sitrep"]["discrepancies"] == []

    def test_there_is_no_deaths_figure_until_one_is_published(self):
        """'No casualties reported so far' is not a count of zero dead."""
        sitrep = load_flood_content(DESK)["sitrep"]
        assert all(h["id"] != "deaths" for h in sitrep["headline"])
        assert all(b["id"] != "deaths" for b in sitrep["breakdowns"])

    def test_every_figure_and_alert_names_a_source(self):
        content = load_flood_content(DESK)
        assert content["sitrep"]["sources"]
        assert all(h["source"] for h in content["sitrep"]["headline"])
        assert all(a["source_url"].startswith("https://") for a in content["alerts"]["alerts"])

    def test_no_unverified_fund_or_account_is_published(self):
        content = load_flood_content(DESK)
        assert content["funds"] == []
        assert content["bankAccounts"]["funds"] == []

    def test_unpublished_sections_are_none_not_invented(self):
        content = load_flood_content(DESK)
        assert content["reliefReceived"] is None
        assert content["reliefNeeded"] is None
        assert content["damage"] is None

    def test_no_district_contact_is_shown_unverified(self):
        districts = load_flood_content(DESK)["districtContacts"]["districts"]
        assert all(not d["verified"] and not d["contacts"] for d in districts)


class TestRoute:
    def test_the_desk_serves_its_own_content(self):
        body = client.get(f"/api/v1/flood/desks/{DESK}").json()
        assert body["site"]["brand_en"].startswith("Budhi Gandaki")
        assert body["since"] == BUDHI_GANDAKI_START

    def test_no_bhotekoshi_register_rides_along(self):
        store = desk_store.empty_store()
        store["lastRunAt"] = "2026-10-11T06:00:00.000Z"
        store["rescue"] = {"summary": {"total": 13795}, "persons": []}
        store["portal"] = {"requests": {"total": 9}}
        desk_store.persist(store)
        body = client.get(f"/api/v1/flood/desks/{DESK}").json()
        assert body["rescueSummary"] is None
        assert body["portal"] is None
        assert body["govUpdates"] is None

    def test_river_gauges_are_the_budhi_gandaki_and_narayani_only(self):
        store = desk_store.empty_store()
        store["lastRunAt"] = "2026-10-11T06:00:00.000Z"
        store["river"] = {
            "gauges": [
                {"label": "Budhi Gandaki at Arughat"},
                {"label": "Narayani at Devghat"},
                {"label": "Bhotekoshi at Rasuwagadhi"},
            ],
            "error": None,
            "fetchedAt": "2026-10-11T06:00:00.000Z",
        }
        desk_store.persist(store)
        gauges = client.get(f"/api/v1/flood/desks/{DESK}").json()["river"]["gauges"]
        assert [g["label"] for g in gauges] == ["Budhi Gandaki at Arughat", "Narayani at Devghat"]

    def test_an_unknown_desk_is_404_not_an_empty_page(self):
        assert client.get("/api/v1/flood/desks/nope").status_code == 404

    def test_the_bhotekoshi_desk_stays_at_flood(self):
        assert client.get("/api/v1/flood/desks/bhotekoshi-flood").status_code == 404
        body = client.get("/api/v1/flood").json()
        assert body["site"]["brand_en"].startswith("Rasuwa")
