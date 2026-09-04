"""Creating the configured provider, or None.

None is a first-class answer here. Atlas runs without an LLM: the actionable
reads fall back to a rule-based engine, briefs stay in the two languages the
sources publish, and every panel still works. A missing key is a configuration
state, not an error.
"""

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.ai.providers.anthropic import AnthropicProvider
from app.domains.ai.providers.base import Completion, LLMProvider, Usage
from app.domains.ai.providers.codex import CodexProvider
from app.domains.ai.providers.gemini import GeminiProvider
from app.domains.ai.providers.openai_family import (
    GrokProvider,
    GroqProvider,
    MiniMaxProvider,
    MistralProvider,
    OllamaProvider,
    OpenAIProvider,
    OpenRouterProvider,
    TarkaProvider,
)

log = get_logger(__name__)

__all__ = [
    "AnthropicProvider",
    "CodexProvider",
    "Completion",
    "GeminiProvider",
    "GrokProvider",
    "GroqProvider",
    "LLMProvider",
    "MiniMaxProvider",
    "MistralProvider",
    "OllamaProvider",
    "OpenAIProvider",
    "OpenRouterProvider",
    "TarkaProvider",
    "Usage",
    "create_llm_provider",
    "get_provider",
]

PROVIDERS = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "openrouter": OpenRouterProvider,
    "gemini": GeminiProvider,
    "codex": CodexProvider,
    "minimax": MiniMaxProvider,
    "mistral": MistralProvider,
    "ollama": OllamaProvider,
    "grok": GrokProvider,
    "groq": GroqProvider,
    "tarka": TarkaProvider,
}


def create_llm_provider(
    provider: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    reasoning_effort: str | None = None,
) -> LLMProvider | None:
    if not provider:
        return None

    key = provider.lower()
    cls = PROVIDERS.get(key)
    if cls is None:
        log.warning("llm_unknown_provider", provider=provider)
        return None

    kwargs: dict[str, Any] = {"model": model}
    if key == "codex":
        pass  # reads its own credentials
    elif key == "ollama":
        kwargs["base_url"] = base_url
    else:
        kwargs["api_key"] = api_key
        if key == "tarka":
            kwargs["base_url"] = base_url
            kwargs["reasoning_effort"] = reasoning_effort or "low"
        if key == "groq":
            kwargs["reasoning_effort"] = reasoning_effort

    return cls(**kwargs)  # type: ignore[arg-type]


_provider: LLMProvider | None = None
_resolved = False


def get_provider() -> LLMProvider | None:
    """The configured provider for this process, or None."""
    global _provider, _resolved
    if not _resolved:
        _provider = create_llm_provider(
            provider=settings.LLM_PROVIDER or None,
            api_key=settings.LLM_API_KEY or None,
            model=settings.LLM_MODEL or None,
            base_url=settings.LLM_BASE_URL or settings.OLLAMA_BASE_URL or None,
            reasoning_effort=settings.LLM_REASONING_EFFORT or None,
        )
        _resolved = True
        if _provider:
            log.info("llm_provider", provider=_provider.name, model=_provider.model)
    return _provider
