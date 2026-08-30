// Tarka OCR utility client — the dedicated document endpoint, not chat.
//
// Tarka's public v1 contract accepts one inline image or up to 32 inline
// images and returns an ocr.completion. It deliberately does not fetch remote
// URLs, so callers must validate and download documents themselves before they
// reach this class.

const DEFAULT_BASE_URL = 'https://tarka.rest/v1';
const DEFAULT_MODEL = 'glm-ocr-nepali';

function configuredKey(config) {
  if (config.apiKey) return config.apiKey;
  if (process.env.TARKA_API_KEY) return process.env.TARKA_API_KEY;
  // A deployment already using Tarka for the LLM layer should not need to copy
  // the same secret into a second variable. Keys for other providers must never
  // be sent to Tarka.
  return process.env.LLM_PROVIDER?.toLowerCase() === 'tarka'
    ? process.env.LLM_API_KEY || null
    : null;
}

export class TarkaOcrProvider {
  constructor(config = {}) {
    this.apiKey = configuredKey(config);
    this.model = config.model || process.env.TARKA_OCR_MODEL || DEFAULT_MODEL;
    this.baseUrl = (
      config.baseUrl || process.env.TARKA_OCR_BASE_URL || DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
  }

  get isConfigured() {
    return Boolean(this.apiKey && this.model);
  }

  async extract(images, prompt, opts = {}) {
    if (!this.isConfigured) throw new Error('Tarka OCR is not configured');
    if (!Array.isArray(images) || images.length < 1 || images.length > 32) {
      throw new Error('Tarka OCR requires between 1 and 32 images');
    }
    if (images.some(image => !/^data:image\/[a-z0-9.+-]+;base64,/i.test(image))) {
      throw new Error('Tarka OCR images must be inline base64 data URIs');
    }

    const body = {
      model: this.model,
      images,
      prompt,
      stream: false,
      max_tokens: opts.maxTokens || 12_000,
      temperature: 0,
    };

    const res = await fetch(`${this.baseUrl}/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeout || 120_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Tarka OCR ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('Tarka OCR returned no text');

    return {
      text,
      model: data.model || this.model,
      usage: data.usage || null,
    };
  }
}

export function isTarkaOcrConfigured() {
  return new TarkaOcrProvider().isConfigured;
}
