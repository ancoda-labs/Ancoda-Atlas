import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDigestLanguage,
  resolveDigestLanguage,
  translateDigest,
} from '../src/lib/news-digest.mjs';

const nepaliDraft = {
  headline: 'बाढी र पहिरोका कारण राजमार्ग अवरुद्ध',
  summary: 'समाचार सूची',
  bullets: ['उद्धार टोली सतर्क रहन आग्रह — Example'],
};

test('detectDigestLanguage reads the wire text instead of its requested label', () => {
  assert.equal(detectDigestLanguage(nepaliDraft), 'ne');
  assert.equal(detectDigestLanguage({
    headline: 'Highway blocked by flooding',
    summary: 'Reports listed below',
    bullets: ['Rescue teams remain alert — Example'],
  }), 'en');
});

test('a failed English translation remains truthfully labelled Nepali', () => {
  assert.equal(resolveDigestLanguage(nepaliDraft, 'en', false), 'ne');
  assert.equal(resolveDigestLanguage(nepaliDraft, 'en', true), 'en');
});

test('translateDigest asks providers for constrained JSON', async () => {
  let options = null;
  const provider = {
    isConfigured: true,
    name: 'tarka',
    async complete(_system, _user, opts) {
      options = opts;
      return {
        text: JSON.stringify({
          headline: 'Highway blocked by floods and landslides',
          summary: 'News list',
          bullets: ['Rescue teams urged to remain alert — Example'],
        }),
      };
    },
  };

  const result = await translateDigest(provider, nepaliDraft, 'en', 'English');
  assert.equal(options.json, true);
  assert.equal(result.translated, true);
  assert.equal(result.model, 'tarka');
  assert.match(result.draft.headline, /^Highway blocked/);
});
