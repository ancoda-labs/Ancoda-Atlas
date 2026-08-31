"""Telegram alerts.

Only the sending half lives here. The decision of whether to alert at all is in
base.py, shared with Discord.

NOT PORTED, deliberately: the two-way bot — polling for updates, slash
commands, /mute and /brief handlers. Roughly 400 lines of it existed in the
Node build and nothing ever started it. instrumentation.ts started the sweeper
and the flood cron and nothing else, so startPolling and every registered
command handler were dead code. Carrying dead code into a new codebase makes it
look supported. If a two-way bot is wanted it belongs in its own long-lived
process, not in a Celery worker.
"""

from typing import Any

from app.core.config import settings
from app.core.http import post_json
from app.core.logging import get_logger
from app.domains.alerts.base import TIERS, Alerter

log = get_logger(__name__)

TELEGRAM_API = "https://api.telegram.org"
# The Bot API's own limit for a single sendMessage.
MAX_TEXT = 4096


def escape_md(text: Any) -> str:
    """Telegram's legacy Markdown breaks on an unmatched marker.

    A district name with an underscore in it would otherwise silently fail to
    send the whole alert.
    """
    return str(text or "").replace("_", "\\_").replace("*", "\\*").replace("`", "\\`")


class TelegramAlerter(Alerter):
    name = "telegram"

    def __init__(self, bot_token: str | None = None, chat_id: str | None = None):
        super().__init__()
        self.bot_token = bot_token or settings.TELEGRAM_BOT_TOKEN
        self.chat_id = chat_id or settings.TELEGRAM_CHAT_ID

    @property
    def is_configured(self) -> bool:
        return bool(self.bot_token and self.chat_id)

    def chunk_text(self, text: str, max_len: int = MAX_TEXT) -> list[str]:
        """Split on line boundaries so a message is never cut mid-sentence."""
        if len(text) <= max_len:
            return [text]
        chunks: list[str] = []
        current = ""
        for line in text.split("\n"):
            if len(current) + len(line) + 1 > max_len:
                if current:
                    chunks.append(current)
                # A single line longer than the limit is hard-split; there is
                # nowhere better to break it.
                while len(line) > max_len:
                    chunks.append(line[:max_len])
                    line = line[max_len:]
                current = line
            else:
                current = f"{current}\n{line}" if current else line
        if current:
            chunks.append(current)
        return chunks

    async def send_message(self, message: str) -> bool:
        if not self.is_configured:
            return False
        url = f"{TELEGRAM_API}/bot{self.bot_token}/sendMessage"
        ok = False
        for chunk in self.chunk_text(message):
            result = await post_json(
                url,
                {
                    "chat_id": self.chat_id,
                    "text": chunk,
                    "parse_mode": "Markdown",
                    "disable_web_page_preview": True,
                },
                timeout=15.0,
            )
            if hasattr(result, "error"):
                log.warning("telegram_send_failed", error=result.error)
                return ok
            ok = True
        return ok

    def format_alert(
        self, evaluation: dict[str, Any], delta: dict[str, Any], tier: str
    ) -> str:
        config = TIERS[tier]
        summary = delta.get("summary") or {}
        lines = [
            f"{config.emoji} *{config.label}* — {escape_md(evaluation.get('headline'))}",
            "",
            escape_md(evaluation.get("reason")),
        ]
        if evaluation.get("actionable"):
            lines += ["", f"*What to do:* {escape_md(evaluation['actionable'])}"]
        if evaluation.get("signals"):
            listed = ", ".join(escape_md(s) for s in evaluation["signals"][:5])
            lines += ["", f"*Signals:* {listed}"]
        if evaluation.get("crossCorrelation"):
            lines.append(f"*Correlation:* {escape_md(evaluation['crossCorrelation'])}")
        lines += [
            "",
            f"_Confidence {escape_md(evaluation.get('confidence'))} · "
            f"{summary.get('totalChanges')} changes · {escape_md(summary.get('direction'))}_",
            "",
            "_Atlas is a monitoring aid, not a warning system. Confirm against DHM, "
            "NDRRMA/BIPAD or the National Seismological Centre._",
        ]
        return "\n".join(lines)

    async def send_alert(
        self, evaluation: dict[str, Any], delta: dict[str, Any], tier: str
    ) -> bool:
        return await self.send_message(self.format_alert(evaluation, delta, tier))
