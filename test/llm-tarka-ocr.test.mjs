import test from 'node:test';
import assert from 'node:assert/strict';
import { TarkaOcrProvider } from '../src/lib/llm/tarka-ocr.mjs';

test('TarkaOcrProvider sends inline images to the canonical v1 endpoint', async () => {
  const provider = new TarkaOcrProvider({ apiKey: 'tk_test' });
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        object: 'ocr.completion',
        model: 'glm-ocr-nepali',
        text: '{"records":[]}',
        usage: { total_tokens: 10 },
      }),
    };
  };

  try {
    const image = 'data:image/png;base64,iVBORw0KGgo=';
    const result = await provider.extract([image], 'Return JSON.');
    assert.equal(request.url, 'https://tarka.rest/v1/ocr');
    assert.equal(request.options.headers.Authorization, 'Bearer tk_test');
    assert.equal(request.body.model, 'glm-ocr-nepali');
    assert.deepEqual(request.body.images, [image]);
    assert.equal(request.body.temperature, 0);
    assert.equal(result.text, '{"records":[]}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TarkaOcrProvider refuses remote image URLs before making a request', async () => {
  const provider = new TarkaOcrProvider({ apiKey: 'tk_test' });
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('should not run');
  };

  try {
    await assert.rejects(
      () => provider.extract(['https://example.com/page.png'], 'Read it.'),
      /inline base64/,
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
