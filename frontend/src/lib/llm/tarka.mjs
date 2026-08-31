// Tarka Provider — raw fetch, no SDK
//
// An OpenAI-compatible gateway at tarka.rest. It gets its own provider rather
// than a base-url switch on openai.mjs so the two can drift apart without one
// breaking the other: same request shape today, but a third-party gateway is
// free to change its catalogue, its auth or its token fields whenever it likes,
// and none of that should reach the official OpenAI path.
//
//   Chat        POST {baseUrl}/chat/completions
//   Models      GET  {baseUrl}/models
//   TTS         POST {baseUrl}/audio/speech
//   STT         POST {baseUrl}/audio/transcriptions
//
// Only chat is wired up here — that is all the hazard desk asks of a model.

import { LLMProvider } from './provider.mjs';

const DEFAULT_BASE_URL = 'https://tarka.rest/v1';

export class TarkaProvider extends LLMProvider {
  constructor(config) {
    super(config);
    this.name = 'tarka';
    this.apiKey = config.apiKey;
    // No default model id is guessed here. The gateway's catalogue is its own
    // and changes without notice, so an unset LLM_MODEL is reported as such
    // rather than sent as a 404 waiting to happen.
    this.model = config.model || null;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  get isConfigured() { return !!this.apiKey && !!this.model; }

  /** The gateway's catalogue, for picking a value for LLM_MODEL. */
  async listModels(opts = {}) {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(opts.timeout || 30000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Tarka models ${res.status}: ${err.substring(0, 200)}`);
    }
    const data = await res.json();
    return (data.data || []).map(m => m.id).filter(Boolean).sort();
  }

  async complete(systemPrompt, userMessage, opts = {}) {
    if (!this.model) {
      throw new Error('Tarka: LLM_MODEL is not set. Pick an id from ' + `${this.baseUrl}/models`);
    }

    const body = {
      model: this.model,
      max_tokens: opts.maxTokens || 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    };

    // Tarka's local utility models can answer a JSON prompt as plain text
    // unless the OpenAI-compatible response constraint is explicit. Atlas uses
    // this for translations and digests, where malformed JSON is discarded.
    if (opts.json) body.response_format = { type: 'json_object' };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
      throw new Error(`Tarka API ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message || {};
    const text = message.content || '';

    // Reasoning models can spend the whole budget thinking and return empty
    // content with finish_reason 'length'. Callers fall back to the extractive
    // path on empty text, so say why in the log rather than failing silently.
    if (!text && data.choices?.[0]?.finish_reason === 'length') {
      console.warn(
        `[Tarka] ${this.model} returned no content — the token budget went to reasoning. Raise maxTokens.`,
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
