import test from 'node:test';
import assert from 'node:assert/strict';
import { TarkaProvider } from '../src/lib/llm/tarka.mjs';
import { createLLMProvider } from '../src/lib/llm/index.mjs';

test('TarkaProvider uses the v1 catalogue by default', async () => {
  const provider = new TarkaProvider({ apiKey: 'tk_test', model: 'himalaya-gemma-4-q4' });
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    assert.equal(options.headers.Authorization, 'Bearer tk_test');
    return {
      ok: true,
      json: async () => ({ data: [{ id: 'himalaya-gemma-4-q4' }] }),
    };
  };

  try {
    assert.deepEqual(await provider.listModels(), ['himalaya-gemma-4-q4']);
    assert.equal(requestedUrl, 'https://tarka.rest/v1/models');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TarkaProvider requests constrained JSON when a caller needs it', async () => {
  const provider = new TarkaProvider({ apiKey: 'tk_test', model: 'himalaya-gemma-4-q4' });
  const originalFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://tarka.rest/v1/chat/completions');
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        model: 'himalaya-gemma-4-q4',
        choices: [{ message: { content: '{"headline":"Flood update"}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }),
    };
  };

  try {
    const result = await provider.complete('Return JSON.', 'Translate.', {
      maxTokens: 900,
      json: true,
    });
    assert.deepEqual(requestBody.response_format, { type: 'json_object' });
    assert.equal(requestBody.max_tokens, 900);
    assert.equal(result.text, '{"headline":"Flood update"}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TarkaProvider leaves unconstrained completions unchanged', async () => {
  const provider = createLLMProvider({
    provider: 'tarka',
    apiKey: 'tk_test',
    model: 'himalaya-gemma-4-q4',
    baseUrl: null,
  });
  assert.ok(provider instanceof TarkaProvider);

  const originalFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'plain text' } }] }),
    };
  };

  try {
    await provider.complete('System', 'User');
    assert.equal('response_format' in requestBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
