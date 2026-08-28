// Groq Provider — raw fetch, no SDK
// Uses Groq's OpenAI-compatible Chat Completions API.
//
// Not to be confused with grok.mjs, which is xAI's Grok. Groq is an inference
// host running open-weight models very fast, and its keys start with `gsk_`.
// The names differ by one letter and the mix-up costs an afternoon, so both
// files say so at the top.

import { LLMProvider } from './provider.mjs';

const BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Models that think before answering.
 *
 * These spend part of the token budget on hidden reasoning and only then emit
 * content, so a budget sized for the answer alone comes back empty with
 * finish_reason 'length'. Groq accepts reasoning_effort for them, and 'low'
 * leaves most of the budget for the answer — which is what a short JSON brief
 * actually needs.
 */
function isReasoningModel(model) {
  return /^openai\/gpt-oss/.test(model || '');
}

export class GroqProvider extends LLMProvider {
  constructor(config) {
    super(config);
    this.name = 'groq';
    this.apiKey = config.apiKey;
    // Groq rotates its catalogue and a retired id returns 404 rather than
    // falling back — check GET /openai/v1/models against your key if
    // completions suddenly start failing.
    this.model = config.model || 'openai/gpt-oss-120b';
    this.reasoningEffort = config.reasoningEffort || null;
  }

  get isConfigured() { return !!this.apiKey; }

  /** The catalogue this key can reach, for picking a value for LLM_MODEL. */
  async listModels(opts = {}) {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(opts.timeout || 30000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Groq models ${res.status}: ${err.substring(0, 200)}`);
    }
    const data = await res.json();
    return (data.data || []).map(m => m.id).filter(Boolean).sort();
  }

  async complete(systemPrompt, userMessage, opts = {}) {
    const body = {
      model: this.model,
      max_tokens: opts.maxTokens || 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    };

    const effort = this.reasoningEffort || (isReasoningModel(this.model) ? 'low' : null);
    if (effort) body.reasoning_effort = effort;

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeout || 60000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Groq API ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0] || {};
    const text = choice.message?.content || '';

    // Callers fall back to the extractive path on empty text. Say why, or the
    // page quietly shows headline-only briefs with nothing in the log.
    if (!text && choice.finish_reason === 'length') {
      console.warn(
        `[Groq] ${this.model} returned no content — the token budget went to reasoning. Raise maxTokens or lower reasoning_effort.`,
      );
    }

    return {
      text,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      model: data.model || this.model,
    };
  }
}
