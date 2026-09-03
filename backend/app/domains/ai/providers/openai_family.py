"""The hosts that speak OpenAI's chat-completions shape.

Eight providers, one request format. They differ only in base URL, default
model, and a header or two — so they are declared rather than reimplemented.

grok is xAI; groq is api.groq.com. One letter apart, different services, and
the mix-up costs an afternoon — which is why both say so here.
"""

import re
from typing import Any

from app.domains.ai.providers.base import OpenAICompatibleProvider


class OpenAIProvider(OpenAICompatibleProvider):
    name = "openai"
    label = "OpenAI"
    base_url = "https://api.openai.com/v1"
    default_model = "gpt-5.4"

    def build_body(self, system_prompt, user_message, max_tokens, json):
        body = super().build_body(system_prompt, user_message, max_tokens, json)
        # OpenAI renamed this parameter; max_tokens is rejected on new models.
        body["max_completion_tokens"] = body.pop("max_tokens")
        return body


class OpenRouterProvider(OpenAICompatibleProvider):
    name = "openrouter"
    label = "OpenRouter"
    base_url = "https://openrouter.ai/api/v1"
    default_model = "openrouter/auto"

    def headers(self) -> dict[str, str]:
        return {
            **super().headers(),
            # OpenRouter attributes usage to these, and asks that they be sent.
            "HTTP-Referer": "https://github.com/ancodalabs/atlas",
            "X-Title": "Ancoda Atlas",
        }


class MiniMaxProvider(OpenAICompatibleProvider):
    name = "minimax"
    label = "MiniMax"
    base_url = "https://api.minimax.io/v1"
    default_model = "MiniMax-M2.5"


class MistralProvider(OpenAICompatibleProvider):
    name = "mistral"
    label = "Mistral"
    base_url = "https://api.mistral.ai/v1"
    default_model = "mistral-large-latest"


class GrokProvider(OpenAICompatibleProvider):
    """xAI's Grok. Not Groq — see the module docstring."""

    name = "grok"
    label = "Grok"
    base_url = "https://api.x.ai/v1"
    default_model = "grok-4-latest"


class OllamaProvider(OpenAICompatibleProvider):
    """A local model. Needs no key — the host itself is the configuration."""

    name = "ollama"
    label = "Ollama"
    default_model = "llama3.1:8b"

    def __init__(self, model: str | None = None, base_url: str | None = None, **config: Any):
        super().__init__(api_key=None, model=model, **config)
        self.base_url = f"{(base_url or 'http://localhost:11434').rstrip('/')}/v1"

    @property
    def is_configured(self) -> bool:
        return True

    def headers(self) -> dict[str, str]:
        return {"Content-Type": "application/json"}


def _is_reasoning_model(model: str | None) -> bool:
    """Models that think before answering.

    They spend part of the token budget on hidden reasoning and only then emit
    content, so a budget sized for the answer alone comes back empty with
    finish_reason 'length'. 'low' leaves most of the budget for the answer,
    which is what a short JSON brief actually needs.
    """
    return bool(re.match(r"^openai/gpt-oss", model or ""))


class GroqProvider(OpenAICompatibleProvider):
    """Groq's inference host. Not xAI's Grok — keys start with `gsk_`."""

    name = "groq"
    label = "Groq"
    base_url = "https://api.groq.com/openai/v1"
    # Groq rotates its catalogue and a retired id returns 404 rather than
    # falling back — check GET /openai/v1/models against your key if
    # completions suddenly start failing.
    default_model = "openai/gpt-oss-120b"

    def __init__(self, reasoning_effort: str | None = None, **config: Any):
        super().__init__(**config)
        self.reasoning_effort = reasoning_effort or None

    def build_body(self, system_prompt, user_message, max_tokens, json):
        body = super().build_body(system_prompt, user_message, max_tokens, json)
        effort = self.reasoning_effort or (
            "low" if _is_reasoning_model(self.model) else None
        )
        if effort:
            body["reasoning_effort"] = effort
        return body


class TarkaProvider(OpenAICompatibleProvider):
    """Tarka, the Nepal-hosted inference gateway. Keys begin `tk_live_`.

    Its catalogue mixes chat, OCR, speech and TTS ids behind one endpoint,
    and only some of the chat ids can actually translate — the README's
    provider table says which. So the model is required rather than
    defaulted: guessing picks a transcription id as often as a usable one.
    """

    name = "tarka"
    label = "Tarka"
    default_model = ""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        **config: Any,
    ):
        super().__init__(api_key=api_key, model=model, **config)
        # api.tarka.ai is not Tarka. It resolves to a parked host whose
        # certificate does not match, so every call died in the TLS handshake
        # before this was corrected. The published base is tarka.rest.
        self.base_url = (base_url or "https://tarka.rest/v1").rstrip("/")

    def build_body(self, system_prompt, user_message, max_tokens, json):
        if not self.model:
            raise RuntimeError(
                f"Tarka: LLM_MODEL is not set. Pick an id from {self.base_url}/models"
            )
        body = super().build_body(system_prompt, user_message, max_tokens, json)
        # Tarka's local utility models can answer a JSON prompt as plain text
        # unless the response constraint is explicit. Atlas uses this for
        # translations and digests, where malformed JSON is discarded.
        if json:
            body["response_format"] = {"type": "json_object"}
        return body
