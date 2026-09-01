"""The LLM provider layer. Eleven hosts, one interface, and no vendor SDKs."""

import httpx
import pytest
import respx

from app.domains.ai.providers.anthropic import AnthropicProvider
from app.domains.ai.providers.factory import PROVIDERS, create_llm_provider
from app.domains.ai.providers.gemini import GeminiProvider
from app.domains.ai.providers.openai_family import (
    GrokProvider,
    GroqProvider,
    OllamaProvider,
    OpenAIProvider,
    OpenRouterProvider,
    TarkaProvider,
    _is_reasoning_model,
)


class TestFactory:
    def test_no_provider_configured_is_none_not_an_error(self):
        """Atlas runs without an LLM. A missing key is a state, not a failure."""
        assert create_llm_provider(None) is None
        assert create_llm_provider("") is None

    def test_an_unknown_provider_is_none(self):
        assert create_llm_provider("nonesuch", api_key="k") is None

    def test_every_documented_provider_can_be_built(self):
        for name in PROVIDERS:
            provider = create_llm_provider(name, api_key="k", model="m")
            assert provider is not None, name
            assert provider.name == name

    def test_grok_and_groq_are_different_services(self):
        """One letter apart. The mix-up costs an afternoon."""
        grok = create_llm_provider("grok", api_key="k")
        groq = create_llm_provider("groq", api_key="k")
        assert isinstance(grok, GrokProvider)
        assert isinstance(groq, GroqProvider)
        assert "x.ai" in grok.base_url
        assert "groq.com" in groq.base_url


class TestConfigured:
    def test_a_keyed_provider_needs_its_key(self):
        assert OpenAIProvider(api_key=None).is_configured is False
        assert OpenAIProvider(api_key="sk-x").is_configured is True

    def test_ollama_needs_no_key(self):
        """A local model's host is the configuration."""
        assert OllamaProvider().is_configured is True

    def test_ollama_normalises_a_trailing_slash(self):
        assert OllamaProvider(base_url="http://box:11434/").base_url == "http://box:11434/v1"


@respx.mock
async def test_the_chat_completions_shape_is_parsed():
    respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "gpt-5.4",
                "choices": [{"message": {"content": "A brief."}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 4},
            },
        )
    )
    out = await OpenAIProvider(api_key="sk-x").complete("sys", "user")
    assert out.text == "A brief."
    assert out.usage.input_tokens == 10
    assert out.usage.output_tokens == 4


@respx.mock
async def test_openai_sends_max_completion_tokens_not_max_tokens():
    """OpenAI renamed the parameter; max_tokens is rejected on new models."""
    route = respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "x"}}]})
    )
    await OpenAIProvider(api_key="sk-x").complete("sys", "user", max_tokens=99)
    import json

    body = json.loads(route.calls[0].request.content)
    assert body["max_completion_tokens"] == 99
    assert "max_tokens" not in body


@respx.mock
async def test_an_api_error_raises_with_the_upstream_reason():
    respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(429, text="rate limited")
    )
    with pytest.raises(RuntimeError, match="429"):
        await OpenAIProvider(api_key="sk-x").complete("sys", "user")


@respx.mock
async def test_anthropics_own_message_shape_is_parsed():
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "claude-sonnet-4-6",
                "content": [{"type": "text", "text": "A brief."}],
                "usage": {"input_tokens": 7, "output_tokens": 3},
            },
        )
    )
    out = await AnthropicProvider(api_key="k").complete("sys", "user")
    assert out.text == "A brief."
    assert out.usage.input_tokens == 7


@respx.mock
async def test_gemini_drops_thinking_parts():
    """A thought rendered as a brief would be nonsense."""
    respx.post(url__startswith="https://generativelanguage.googleapis.com").mock(
        return_value=httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "hmm let me think", "thought": True},
                                {"text": "The answer."},
                            ]
                        }
                    }
                ],
                "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 2},
            },
        )
    )
    out = await GeminiProvider(api_key="k").complete("sys", "user")
    assert out.text == "The answer."
    assert "think" not in out.text


class TestGroqReasoning:
    def test_a_reasoning_model_is_recognised(self):
        assert _is_reasoning_model("openai/gpt-oss-120b") is True
        assert _is_reasoning_model("llama-3.1-8b") is False

    def test_a_reasoning_model_gets_a_low_effort_by_default(self):
        """Otherwise the budget goes to thinking and the answer comes back empty."""
        body = GroqProvider(api_key="k", model="openai/gpt-oss-120b").build_body(
            "sys", "user", 4096, False
        )
        assert body["reasoning_effort"] == "low"

    def test_an_explicit_effort_wins(self):
        body = GroqProvider(
            api_key="k", model="openai/gpt-oss-120b", reasoning_effort="high"
        ).build_body("sys", "user", 4096, False)
        assert body["reasoning_effort"] == "high"

    def test_a_plain_model_gets_no_effort_field(self):
        body = GroqProvider(api_key="k", model="llama-3.1-8b").build_body(
            "sys", "user", 4096, False
        )
        assert "reasoning_effort" not in body


class TestTarka:
    def test_a_missing_model_is_an_explicit_error(self):
        """The id is not guessable, so failing clearly beats failing at the host."""
        with pytest.raises(RuntimeError, match="LLM_MODEL is not set"):
            TarkaProvider(api_key="k").build_body("sys", "user", 4096, False)

    def test_json_mode_sets_the_response_format(self):
        body = TarkaProvider(api_key="k", model="m").build_body("sys", "user", 4096, True)
        assert body["response_format"] == {"type": "json_object"}


def test_openrouter_sends_its_attribution_headers():
    headers = OpenRouterProvider(api_key="k").headers()
    assert headers["X-Title"] == "Ancoda Atlas"


@respx.mock
async def test_empty_content_on_length_is_logged_not_swallowed(caplog):
    """Callers fall back to the extractive path on empty text.

    Without a log line the page quietly shows headline-only briefs and nothing
    explains why.
    """
    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"content": ""}, "finish_reason": "length"}]}
        )
    )
    out = await GroqProvider(api_key="k").complete("sys", "user")
    assert out.text == ""
