// Serving third-party news photographs without ever storing one.
//
// Outlets publish a lead image with most articles and it carries real
// information — a washed-out bridge deck reads faster than the sentence
// describing it. Three constraints shape how Atlas shows them:
//
//   Not stored. The MinIO bucket holds photographs the public sent us and
//   nothing else (see lib/storage.ts). These are streamed from the outlet at
//   request time and forgotten.
//
//   Not hotlinked raw. Several Nepali outlets still serve images over plain
//   HTTP, which a browser blocks as mixed content on an HTTPS page. So the
//   bytes pass through Atlas — the same approach already used for DHM gauge
//   photos in app/api/flood/station-photo.
//
//   Not an open proxy. A route that fetches whatever URL it is handed is an
//   SSRF hole. Atlas will only fetch a URL it signed itself, and the signature
//   is issued exactly once per feed item, at the point the feed is built.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

interface MediaGlobal {
  __atlasMediaSecret?: string;
}
const g = globalThis as unknown as MediaGlobal;

/**
 * The signing key.
 *
 * A configured secret keeps signatures valid across restarts. Without one a
 * per-process key is generated: links then stop working when the server
 * restarts, which is harmless because the page refetches the feed every few
 * minutes, and is far better than shipping a guessable default that would turn
 * the proxy into the open one this design exists to avoid.
 */
function secret(): string {
  if (process.env.ATLAS_MEDIA_SECRET) return process.env.ATLAS_MEDIA_SECRET;
  if (!g.__atlasMediaSecret) {
    g.__atlasMediaSecret = randomBytes(32).toString('hex');
    // Harmless in development, silently destructive in production: behind more
    // than one replica the signatures this process mints are rejected by every
    // other one, and roughly half of all images fail with nothing in the logs
    // to say why. Cloudflare Workers are that case — the flood desk feed is
    // signed on one isolate and the photograph is fetched on another, so every
    // press thumbnail 403s unless ATLAS_MEDIA_SECRET is set to the same value
    // on the deployment.
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[Media proxy] ATLAS_MEDIA_SECRET is not set. A per-process key is in use, ' +
          'so image links break on restart and fail across replicas. Set the same ' +
          'value on every instance.',
      );
    }
  }
  return g.__atlasMediaSecret;
}

function sign(url: string): string {
  return createHmac('sha256', secret()).update(url).digest('base64url');
}

/** Hosts that resolve to the machine itself or to a private network. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return true;
  }
  // IPv6 loopback and unique-local.
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, and the cloud metadata endpoint
  return false;
}

/** Is this a URL Atlas is willing to sign at all? */
export function isSignableImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return !isPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Turn an outlet's image URL into a path on this server.
 * Returns null for anything Atlas will not fetch.
 */
export function proxyUrlFor(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || !isSignableImageUrl(imageUrl)) return null;
  const u = Buffer.from(imageUrl, 'utf8').toString('base64url');
  return `/api/flood/media/image?u=${encodeURIComponent(u)}&s=${encodeURIComponent(sign(imageUrl))}`;
}

/** Recover the URL behind a proxy request, or null if the signature fails. */
export function resolveSignedUrl(u: string | null, s: string | null): string | null {
  if (!u || !s) return null;
  let url: string;
  try {
    url = Buffer.from(u, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = Buffer.from(sign(url));
  const presented = Buffer.from(s);
  if (expected.length !== presented.length) return null;
  if (!timingSafeEqual(expected, presented)) return null;
  // Re-checked after decoding: the allowlist rule must hold at fetch time, not
  // only at signing time.
  return isSignableImageUrl(url) ? url : null;
}
