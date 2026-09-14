"""PM fund cash vs RDNA recovery — unit crore conversion and gap chart."""

from app.domains.flood.funding_gap import (
    compute_funding_gap,
    funding_gap_chart_view,
    npr_to_crore,
)


class TestFundingGap:
    def test_npr_to_crore(self):
        assert npr_to_crore(9_995_024_994) == 999.5

    def test_gap_is_recovery_minus_received(self):
        gap = compute_funding_gap(
            relief_received={
                "as_of_label_en": "28 Bhadra",
                "headline": [{"id": "pm-fund", "value": 9_995_024_994}],
            },
            damage={
                "rdna": {
                    "headline": [
                        {"id": "effects", "value_cr": 40828.91},
                        {"id": "recovery", "value_cr": 72331.52},
                    ]
                }
            },
        )
        assert gap is not None
        assert gap["received_cr"] == 999.5
        assert gap["recovery_cr"] == 72331.52
        assert gap["gap_cr"] == 71332.02
        assert [b["id"] for b in gap["bars"]] == ["received", "recovery", "gap"]

    def test_missing_either_side_returns_none(self):
        assert (
            compute_funding_gap(
                relief_received={"headline": [{"id": "pm-fund", "value": 1}]},
                damage={"rdna": {"headline": []}},
            )
            is None
        )

    def test_chart_view_is_closed_shape(self):
        snap = {
            "reliefReceived": {
                "headline": [{"id": "pm-fund", "value": 10_000_000}],
            },
            "damage": {
                "rdna": {"headline": [{"id": "recovery", "value_cr": 100.0}]},
            },
        }
        view = funding_gap_chart_view(snap)
        assert view is not None
        assert view["chart"] == "funding_gap"
        assert view["unit"] == "npr_cr"
        assert view["bars"][0]["value_cr"] == 1.0
        assert view["bars"][2]["value_cr"] == 99.0
