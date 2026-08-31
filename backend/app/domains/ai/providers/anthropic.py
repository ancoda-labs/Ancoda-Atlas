"""Anthropic Claude — raw HTTP, no SDK.

Its own message shape rather than the chat-completions one: the system prompt
is a top-level field, and the response carries content blocks.
"""

from typing import Any

from app.domains.ai.providers.base import (
    DEFAULT_MAX_TOKENS,
    DEFAULT_TIMEOUT_S,
    Completion,
    LLMProvider,
    Usage,
)

ENDPOINT = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str | None = None, model: str | None = None, **config: Any):
        super().__init__(**config)
        self.api_key = api_key
        self.model = model or "claude-sonnet-4-6"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

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

        client = await get_client()
        response = await client.post(
            ENDPOINT,
            json={
                "model": self.model,
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_message}],
            },
            headers={
                "Content-Type": "application/json",
                "x-api-key": self.api_key or "",
                "anthropic-version": API_VERSION,
            },
            timeout=timeout,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Anthropic API {response.status_code}: {response.text[:200]}"
            )

        data = response.json()
        blocks = data.get("content") or []
        text = blocks[0].get("text", "") if blocks else ""
        usage = data.get("usage") or {}
        return Completion(
            text=text,
            model=data.get("model") or self.model or "",
            usage=Usage(
                input_tokens=usage.get("input_tokens") or 0,
                output_tokens=usage.get("output_tokens") or 0,
            ),
        )
