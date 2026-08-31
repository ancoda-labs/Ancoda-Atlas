"""Google Gemini — raw HTTP, no SDK."""

from typing import Any

from app.domains.ai.providers.base import (
    DEFAULT_MAX_TOKENS,
    DEFAULT_TIMEOUT_S,
    Completion,
    LLMProvider,
    Usage,
)

BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, api_key: str | None = None, model: str | None = None, **config: Any):
        super().__init__(**config)
        self.api_key = api_key
        self.model = model or "gemini-3.1-pro"

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
            f"{BASE}/{self.model}:generateContent",
            params={"key": self.api_key},
            json={
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": user_message}]}],
                "generationConfig": {
                    "maxOutputTokens": max_tokens,
                    # Gemini's thinking tokens come from a separate budget; cap
                    # it so reasoning cannot consume the answer.
                    "thinkingConfig": {"thinkingBudget": 1024},
                },
            },
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Gemini API {response.status_code}: {response.text[:200]}")

        data = response.json()
        candidates = data.get("candidates") or []
        parts = ((candidates[0].get("content") or {}).get("parts") or []) if candidates else []
        # Gemini can return thinking parts alongside the answer. Only the
        # answer is wanted; a thought rendered as a brief would be nonsense.
        text = "\n".join(p.get("text") or "" for p in parts if not p.get("thought")).strip()

        meta = data.get("usageMetadata") or {}
        return Completion(
            text=text,
            model=self.model or "",
            usage=Usage(
                input_tokens=meta.get("promptTokenCount") or 0,
                output_tokens=meta.get("candidatesTokenCount") or 0,
            ),
        )
