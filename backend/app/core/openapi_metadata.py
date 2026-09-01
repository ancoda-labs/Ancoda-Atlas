"""What /docs says Atlas is.

The scope paragraph is not decoration. Atlas is a monitoring aid, not a
warning system, and anyone reading these endpoints needs to know that before
they act on a number.
"""

VERSION = "4.0.0"
TITLE = "Ancoda Atlas API"

SUMMARY = "Nepal natural-hazard and disaster intelligence."

DESCRIPTION = """
Aggregates Nepal-scoped natural-hazard feeds — earthquakes, monsoon flood and
landslide, GLOF, wildfire, hazardous air — and the humanitarian response that
follows them, and serves the public flood-response desk at
`/bhotekoshi-flood`.

**This is a monitoring aid, not a warning system.** Confirm anything here
against DHM, NDRRMA/BIPAD, or the National Seismological Centre before anyone
acts on it.

Scope is natural hazards and humanitarian response only. India and China
appear only through cross-boundary hazards.

Degradation is by design: a source that fails answers stale or empty with an
honest timestamp rather than a substituted figure, and features that need
Supabase or MinIO hide themselves when those are absent.
"""

CONTACT = {
    "name": "Ancoda Labs",
    "url": "https://atlas.ancodalabs.com",
    "email": "research@ancodalabs.com",
}

LICENSE = {
    "name": "AGPL-3.0-only",
    "url": "https://www.gnu.org/licenses/agpl-3.0.en.html",
}

SERVERS = [
    {"url": "http://localhost:8000", "description": "Local"},
    {"url": "https://atlas-api.ancodalabs.com", "description": "Production"},
]

TAGS_METADATA = [
    {"name": "health", "description": "Liveness and readiness."},
    {"name": "hazards", "description": "The national hazard sweep and its dashboard snapshot."},
    {"name": "flood", "description": "The Rasuwa–Bhotekoshi flood response desk."},
    {"name": "news", "description": "The Nepali news wire and coverage."},
    {"name": "photos", "description": "Community ground reports."},
    {"name": "ai", "description": "Actionable reads, translation and the ask sandbox."},
    {"name": "stream", "description": "Server-sent events."},
]
