"""Discord alerts, over a webhook.

Only the sending half lives here; the decision is in base.py.

WEBHOOK ONLY, deliberately. The Node build could also run a discord.js gateway
client with slash commands, behind an optional dependency — and nothing ever
started it, exactly as with the Telegram bot. A webhook needs no dependency, no
gateway connection held open by a Celery worker, and no bot token: it is one
POST to a URL. That is the whole of what the sweep actually used.
"""

from typing import Any

from app.core.config import settings
from app.core.http import post_json
from app.core.logging import get_logger
from app.domains.alerts.base import TIERS, Alerter

log = get_logger(__name__)

# Discord's embed limits. Exceeding one rejects the whole message.
MAX_TITLE = 256
MAX_DESCRIPTION = 4096
MAX_FIELD_VALUE = 1024

TIER_COLOURS = {
    "FLASH": 0xDC2626,     # red
    "PRIORITY": 0xF59E0B,  # amber
    "ROUTINE": 0x3B82F6,   # blue
}


def truncate(value: Any, limit: int, fallback: str = "—") -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    return f"{text[: limit - 1]}…" if len(text) > limit else text


class DiscordAlerter(Alerter):
    name = "discord"

    def __init__(self, webhook_url: str | None = None):
        super().__init__()
        self.webhook_url = webhook_url or settings.DISCORD_WEBHOOK_URL

    @property
    def is_configured(self) -> bool:
        return bool(self.webhook_url)

    async def _post(self, payload: dict[str, Any]) -> bool:
        if not self.is_configured:
            return False
        result = await post_json(self.webhook_url, payload, timeout=15.0)
        if hasattr(result, "error"):
            log.warning("discord_send_failed", error=result.error)
            return False
        return True

    def build_embed(
        self, evaluation: dict[str, Any], delta: dict[str, Any], tier: str
    ) -> dict[str, Any]:
        config = TIERS[tier]
        summary = delta.get("summary") or {}

        fields = []
        if evaluation.get("actionable"):
            fields.append(
                {
                    "name": "What to do",
                    "value": truncate(evaluation["actionable"], MAX_FIELD_VALUE),
                    "inline": False,
                }
            )
        if evaluation.get("signals"):
            fields.append(
                {
                    "name": "Signals",
                    "value": truncate(
                        ", ".join(str(s) for s in evaluation["signals"][:5]),
                        MAX_FIELD_VALUE,
                    ),
                    "inline": False,
                }
            )
        if evaluation.get("crossCorrelation"):
            fields.append(
                {
                    "name": "Correlation",
                    "value": truncate(evaluation["crossCorrelation"], MAX_FIELD_VALUE),
                    "inline": True,
                }
            )
        fields.append(
            {
                "name": "Confidence",
                "value": truncate(evaluation.get("confidence"), 64),
                "inline": True,
            }
        )

        return {
            "title": truncate(
                f"{config.emoji} {config.label} — {evaluation.get('headline')}", MAX_TITLE
            ),
            "description": truncate(evaluation.get("reason"), MAX_DESCRIPTION),
            "color": TIER_COLOURS.get(tier, TIER_COLOURS["ROUTINE"]),
            "fields": fields,
            "footer": {
                "text": (
                    f"{summary.get('totalChanges')} changes · {summary.get('direction')} · "
                    "Atlas is a monitoring aid, not a warning system"
                )
            },
        }

    async def send_alert(
        self, evaluation: dict[str, Any], delta: dict[str, Any], tier: str
    ) -> bool:
        return await self._post({"embeds": [self.build_embed(evaluation, delta, tier)]})

    async def send_actionable_ideas(self, ideas: list[dict[str, Any]]) -> bool:
        """The sweep's reads, posted after a cycle that produced them.

        Not rate-limited by tier: these follow the sweep's own cadence, and the
        sweep is already the rate limit.
        """
        if not self.is_configured or not ideas:
            return False

        embeds = [
            {
                "title": truncate(idea.get("title"), MAX_TITLE),
                "description": truncate(
                    idea.get("rationale") or idea.get("text"), MAX_DESCRIPTION
                ),
                "color": 0x6366F1,
                "fields": [
                    f
                    for f in (
                        {
                            "name": "Type",
                            "value": truncate(idea.get("type"), 64),
                            "inline": True,
                        },
                        {
                            "name": "Confidence",
                            "value": truncate(idea.get("confidence"), 64),
                            "inline": True,
                        },
                        {
                            "name": "Horizon",
                            "value": truncate(idea.get("horizon"), 64),
                            "inline": True,
                        },
                    )
                    if f["value"] != "—"
                ],
            }
            # Discord accepts at most ten embeds in one message.
            for idea in ideas[:10]
        ]
        return await self._post({"embeds": embeds})
