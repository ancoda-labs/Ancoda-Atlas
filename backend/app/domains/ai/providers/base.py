"""The provider interface, and the OpenAI-compatible base most of them share.

Every provider here speaks raw HTTP. There are no vendor SDKs anywhere in
Atlas: eleven of them would be eleven dependency trees, eleven release
cadences, and eleven ways for a transitive package to reach a machine that
serves a public-safety page. A chat completion is one POST.
"""

from dataclasses import dataclass, field
from typing import Any

from app.core.logging import get_logger

log = get_logger(__name__)

DEFAULT_MAX_TOKENS = 4096
DEFAULT_TIMEOUT_S = 60.0


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class Completion:
    text: str
    model: str
    usage: Usage = field(default_factory=Usage)


class LLMProvider:
    """All providers implement this."""

    name = "base"

    def __init__(self, **config: Any) -> None:
        self.config = config
        self.model: str | None = None

    @property
    def is_configured(self) -> bool:
        return False

    async def complete(
        self,
        system_prompt: str,
        user_message: str,
        *,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        timeout: float = DEFAULT_TIMEOUT_S,
        json: bool = False,
    ) -> Completion:
        raise NotImplementedError(f"{self.name}: complete() not implemented")


class OpenAICompatibleProvider(LLMProvider):
    """The /v1/chat/completions shape, which most hosts implement.

    Subclasses set `base_url`, `default_model` and any extra headers. The
    empty-content-on-length warning lives here because it is the same failure
    on every one of them: a reasoning model can spend its whole budget thinking
    and return nothing, and callers fall back to the extractive path on empty
    text — so without this the page quietly shows headline-only briefs with
    nothing in the log to explain it.
    """

    base_url = ""
    default_model = ""
    label = "LLM"

    def __init__(self, api_key: str | None = None, model: str | None = None, **config: Any):
        super().__init__(**config)
        self.api_key = api_key
        self.model = model or self.default_model

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def build_body(
        self, system_prompt: str, user_message: str, max_tokens: int, json: bool
    ) -> dict[str, Any]:
        return {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        }

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
            f"{self.base_url}/chat/completions",
            json=self.build_body(system_prompt, user_message, max_tokens, json),
            headers=self.headers(),
            timeout=timeout,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"{self.label} API {response.status_code}: {response.text[:200]}"
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise RuntimeError(f"{self.label} returned a non-JSON body") from exc

        choice = (data.get("choices") or [{}])[0]
        text = (choice.get("message") or {}).get("content") or ""

        if not text and choice.get("finish_reason") == "length":
            log.warning(
                "llm_budget_spent_on_reasoning",
                provider=self.name,
                model=self.model,
                detail=(
                    "returned no content — the token budget went to reasoning. "
                    "Raise max_tokens or lower reasoning effort."
                ),
            )

        usage = data.get("usage") or {}
        return Completion(
            text=text,
            model=data.get("model") or self.model or "",
            usage=Usage(
                input_tokens=usage.get("prompt_tokens") or 0,
                output_tokens=usage.get("completion_tokens") or 0,
            ),
        )
