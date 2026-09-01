"""The one geography module. Everything geo-scoped resolves against it."""

from app.core.nepal import (
    CITIES,
    NEPAL_BBOX,
    PROVINCES,
    SEISMIC_BBOX,
    in_nepal,
    mentions_nepal,
    province_of,
)


class TestInNepal:
    def test_kathmandu_is_in_nepal(self):
        assert in_nepal(27.7172, 85.3240) is True

    def test_delhi_is_not(self):
        assert in_nepal(28.6139, 77.2090) is False

    def test_missing_coordinates_are_not_in_nepal(self):
        assert in_nepal(None, None) is False
        assert in_nepal(27.7, None) is False

    def test_a_boolean_is_not_a_coordinate(self):
        """True == 1 in Python, so an unguarded numeric check would accept it."""
        assert in_nepal(True, True) is False


class TestProvinceOf:
    def test_kathmandu_is_bagmati(self):
        assert province_of(27.7172, 85.3240) == "bagmati"

    def test_pokhara_is_gandaki(self):
        assert province_of(28.2096, 83.9856) == "gandaki"

    def test_outside_nepal_is_none(self):
        assert province_of(28.6139, 77.2090) is None


def test_every_city_sits_inside_the_province_it_claims():
    """A city tagged to the wrong province mislabels every panel that groups by it."""
    for key, city in CITIES.items():
        assert city.province in PROVINCES, f"{key} names an unknown province"
        assert province_of(city.lat, city.lon) is not None, f"{key} falls outside Nepal"


def test_the_seismic_box_is_wider_than_the_national_one():
    """Nepal sits on the Main Himalayan Thrust; cross-border ruptures shake it."""
    assert SEISMIC_BBOX.lamin < NEPAL_BBOX.lamin
    assert SEISMIC_BBOX.lamax > NEPAL_BBOX.lamax
    assert SEISMIC_BBOX.lomin < NEPAL_BBOX.lomin
    assert SEISMIC_BBOX.lomax > NEPAL_BBOX.lomax


class TestMentionsNepal:
    def test_a_nepal_token_matches(self):
        assert mentions_nepal("Flooding in Rasuwa district") is True

    def test_unrelated_text_does_not(self):
        assert mentions_nepal("Flooding in Bavaria") is False

    def test_empty_text_does_not(self):
        assert mentions_nepal("") is False
        assert mentions_nepal(None) is False
