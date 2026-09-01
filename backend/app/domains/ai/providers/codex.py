"""OpenAI Codex through a ChatGPT subscription.

Authenticates from ~/.codex/auth.json, written by `npx @openai/codex login`,
or from CODEX_ACCESS_TOKEN / CODEX_ACCOUNT_ID. Answers as an SSE stream rather
than one JSON body.

This is the one provider with no API key of its own, which is why it is the one
that can be configured without anything in .env.
"""

import json as jsonlib
import os
from pathlib import Path
from typing import Any

from app.domains.ai.providers.base import (
    DEFAULT_MAX_TOKENS,
    Completion,
    LLMProvider,
    Usage,
)

ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
AUTH_PATH = Path.home() / ".codex" / "auth.json"
DEFAULT_TIMEOUT_S = 90.0


class CodexProvider(LLMProvider):
    name = "codex"

    def __init__(self, model: str | None = None, **config: Any):
        super().__init__(**config)
        self.model = model or "gpt-5.3-codex"
        self._creds: dict[str, str] | None = None

    def _credentials(self) -> dict[str, str] | None:
        if self._creds:
            return self._creds

        token = os.getenv("CODEX_ACCESS_TOKEN") or os.getenv("OPENAI_OAUTH_TOKEN")
        account_id = os.getenv("CODEX_ACCOUNT_ID")
        if token and account_id:
            self._creds = {"accessToken": token, "accountId": account_id}
            return self._creds

        try:
            auth = jsonlib.loads(AUTH_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

        # Tokens may be nested under `tokens` (newer format) or top-level.
        tokens = auth.get("tokens") or auth
        access = (
            tokens.get("access_token")
            or tokens.get("token")
            or auth.get("access_token")
            or auth.get("token")
        )
        if not access:
            return None
        self._creds = {
            "accessToken": access,
            "accountId": tokens.get("account_id") or auth.get("account_id") or account_id or "",
        }
        return self._creds

    @property
    def is_configured(self) -> bool:
        return bool(self._credentials())

    async def complete(
        self,
        system_prompt: str,
        user_message: str,
        *,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        timeout: float = DEFAULT_TIMEOUT_S,
        json: bool = False,
    ) -> Completion:
        from app.core.http import get_client

        creds = self._credentials()
        if not creds:
            raise RuntimeError(
                "Codex: no credentials found. Run `npx @openai/codex login`"
            )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {creds['accessToken']}",
        }
        if creds["accountId"]:
            headers["ChatGPT-Account-Id"] = creds["accountId"]

        client = await get_client()
        async with client.stream(
            "POST",
            ENDPOINT,
            json={
                "model": self.model,
                "instructions": system_prompt or "",
                "input": [{"type": "message", "role": "user", "content": user_message}],
                "stream": True,
                "store": False,
            },
            headers=headers,
            timeout=timeout,
        ) as response:
            if response.status_code in (401, 403):
                # Cleared so a later call re-reads the file rather than
                # retrying a token that has already been refused.
                self._creds = None
                raise RuntimeError(
                    f"Codex auth failed ({response.status_code}). "
                    "Run `npx @openai/codex login` to refresh."
                )
            if response.status_code >= 400:
                body = await response.aread()
                raise RuntimeError(
                    f"Codex API {response.status_code}: {body[:200].decode(errors='replace')}"
                )
            text = await self._parse_sse(response)

        return Completion(
            text=text,
            model=self.model or "",
            # Codex does not always report usage on this endpoint.
            usage=Usage(),
        )

    async def _parse_sse(self, response: Any) -> str:
        text = ""
        async for line in response.aiter_lines():
            if not line.startswith("data: "):
                continue
            payload = line[6:].strip()
            if payload == "[DONE]":
                return text
            try:
                event = jsonlib.loads(payload)
            except ValueError:
                continue  # a malformed event is not a reason to lose the rest

            if event.get("type") == "response.output_text.delta":
                text += event.get("delta") or ""
            elif event.get("type") == "response.completed":
                for item in ((event.get("response") or {}).get("output") or []):
                    if item.get("type") != "message":
                        continue
                    for part in item.get("content") or []:
                        if part.get("type") == "output_text":
                            text = part.get("text") or text
        return text
