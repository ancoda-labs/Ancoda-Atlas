"""The media proxy. Its whole job is to not be an open proxy."""

from app.domains.media.proxy import (
    is_private_host,
    is_signable_image_url,
    proxy_url_for,
    resolve_signed_url,
)


class TestPrivateHosts:
    """SSRF targets. Each of these has to be refused before signing."""

    def test_loopback(self):
        assert is_private_host("127.0.0.1") is True
        assert is_private_host("localhost") is True
        assert is_private_host("::1") is True

    def test_rfc1918_ranges(self):
        assert is_private_host("10.0.0.1") is True
        assert is_private_host("172.16.0.1") is True
        assert is_private_host("172.31.255.255") is True
        assert is_private_host("192.168.1.1") is True

    def test_the_cloud_metadata_endpoint(self):
        """169.254.169.254 is the single most valuable SSRF target on a host."""
        assert is_private_host("169.254.169.254") is True

    def test_internal_suffixes(self):
        assert is_private_host("db.internal") is True
        assert is_private_host("printer.local") is True

    def test_ipv6_unique_local(self):
        assert is_private_host("fd00::1") is True

    def test_a_public_host_is_allowed(self):
        assert is_private_host("kathmandupost.com") is False
        assert is_private_host("172.32.0.1") is False  # just outside 172.16/12


class TestSignable:
    def test_https_is_signable(self):
        assert is_signable_image_url("https://kathmandupost.com/x.jpg") is True

    def test_plain_http_is_signable(self):
        """Several Nepali outlets still serve over HTTP. That is the reason the
        proxy exists — a browser blocks it as mixed content."""
        assert is_signable_image_url("http://setopati.com/x.jpg") is True

    def test_file_and_data_urls_are_refused(self):
        assert is_signable_image_url("file:///etc/passwd") is False
        assert is_signable_image_url("data:image/png;base64,AAAA") is False

    def test_a_private_host_is_refused(self):
        assert is_signable_image_url("http://169.254.169.254/latest/meta-data/") is False

    def test_nonsense_is_refused(self):
        assert is_signable_image_url("not a url") is False


class TestRoundTrip:
    def test_a_signed_url_resolves_back(self):
        original = "https://kathmandupost.com/photo.jpg"
        path = proxy_url_for(original)
        assert path is not None
        from urllib.parse import parse_qs, urlparse

        query = parse_qs(urlparse(path).query)
        assert resolve_signed_url(query["u"][0], query["s"][0]) == original

    def test_an_unsignable_url_yields_no_path(self):
        assert proxy_url_for("http://127.0.0.1/x.jpg") is None
        assert proxy_url_for(None) is None

    def test_a_forged_signature_is_refused(self):
        """This is the whole security property."""
        import base64

        target = "http://169.254.169.254/latest/meta-data/"
        encoded = base64.urlsafe_b64encode(target.encode()).rstrip(b"=").decode()
        assert resolve_signed_url(encoded, "not-the-signature") is None

    def test_a_signature_for_one_url_does_not_work_for_another(self):
        import base64
        from urllib.parse import parse_qs, urlparse

        path = proxy_url_for("https://kathmandupost.com/a.jpg")
        stolen = parse_qs(urlparse(path).query)["s"][0]
        other = base64.urlsafe_b64encode(b"https://evil.test/b.jpg").rstrip(b"=").decode()
        assert resolve_signed_url(other, stolen) is None

    def test_missing_parameters_are_refused(self):
        assert resolve_signed_url(None, "sig") is None
        assert resolve_signed_url("dXJs", None) is None

    def test_malformed_base64_is_refused(self):
        assert resolve_signed_url("!!!not base64!!!", "sig") is None
