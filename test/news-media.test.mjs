// Verification for lib/news-media.ts — the signed image pass-through.
//
// This module is the only thing standing between a public route and a
// server-side request forgery: it decides which URLs Atlas is willing to fetch
// on a caller's behalf. The rules are worth asserting rather than reading.
//
// Run: node --experimental-strip-types --test test/news-media.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { isSignableImageUrl, proxyUrlFor, resolveSignedUrl } from '../lib/news-media.ts';

/** Pull the u and s parameters back out of a generated proxy path. */
function partsOf(proxyPath) {
  const q = new URLSearchParams(proxyPath.slice(proxyPath.indexOf('?') + 1));
  return { u: q.get('u'), s: q.get('s') };
}

test('a real outlet image round-trips through signing', () => {
  const url = 'https://npcdn.ratopati.com/media/news/rasuwa-bhotekoshi-trishuli-flood.webp';
  const proxy = proxyUrlFor(url);
  assert.ok(proxy, 'a signable URL produces a proxy path');
  assert.ok(proxy.startsWith('/api/flood/media/image?'), 'points at our own route');

  const { u, s } = partsOf(proxy);
  assert.equal(resolveSignedUrl(u, s), url, 'the original URL comes back intact');
});

test('plain HTTP is signable — that is the whole point of proxying', () => {
  // Several Nepali outlets still serve images over HTTP, which a browser blocks
  // as mixed content. Passing them through is why this module exists.
  const url = 'http://images.nagariknewscdn.com/2025/third-party/photo.png';
  assert.equal(isSignableImageUrl(url), true);
  assert.ok(proxyUrlFor(url));
});

test('an unsigned or wrongly signed request is refused', () => {
  const url = 'https://example.com/photo.jpg';
  const { u } = partsOf(proxyUrlFor(url));

  assert.equal(resolveSignedUrl(u, 'not-the-signature'), null, 'a bogus signature fails');
  assert.equal(resolveSignedUrl(u, null), null, 'a missing signature fails');
  assert.equal(resolveSignedUrl(null, 'anything'), null, 'a missing URL fails');
  assert.equal(resolveSignedUrl('!!!not-base64!!!', 'x'), null, 'undecodable input fails');
});

test('a signature cannot be reused for a different URL', () => {
  const { s } = partsOf(proxyUrlFor('https://example.com/harmless.jpg'));
  const swapped = Buffer.from('http://169.254.169.254/latest/meta-data/', 'utf8').toString('base64url');
  assert.equal(resolveSignedUrl(swapped, s), null, 'the signature does not carry over');
});

test('SSRF targets are refused even before signing', () => {
  const forbidden = [
    'http://localhost:9000/atlas/private.jpg',
    'http://127.0.0.1/admin',
    'http://0.0.0.0/',
    'http://10.0.0.5/internal.png',
    'http://172.16.4.9/internal.png',
    'http://172.31.255.255/internal.png',
    'http://192.168.1.1/router.png',
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://[::1]/loopback.png',
    'http://minio.internal/bucket/obj',
    'http://db.local/',
    'file:///etc/passwd',
    'gopher://evil/',
    'ftp://example.com/x.jpg',
  ];
  for (const url of forbidden) {
    assert.equal(isSignableImageUrl(url), false, `${url} must not be signable`);
    assert.equal(proxyUrlFor(url), null, `${url} must not produce a proxy path`);
  }
});

test('public addresses that merely look private are still allowed', () => {
  // 172.32 is outside the private 172.16/12 block, and 11.x is public space.
  assert.equal(isSignableImageUrl('https://172.32.0.1/photo.jpg'), true);
  assert.equal(isSignableImageUrl('https://11.0.0.1/photo.jpg'), true);
});

test('null and malformed input never yields a proxy path', () => {
  assert.equal(proxyUrlFor(null), null);
  assert.equal(proxyUrlFor(undefined), null);
  assert.equal(proxyUrlFor(''), null);
  assert.equal(proxyUrlFor('not a url at all'), null);
});
