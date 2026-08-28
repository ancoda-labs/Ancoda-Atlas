// Cache-Control for the read-only feeds.
//
// Every one of these routes is `force-dynamic` and sent no Cache-Control at
// all, so nothing between the reader and the Worker was allowed to hold an
// answer: each request paid the full upstream fan-out, and on a cold isolate
// that meant nine seconds for /api/news and eight for the insights panel.
//
// The module-level caches inside the routes are still there and still useful,
// but they cannot carry this on their own. They live in one isolate's memory,
// and Cloudflare recycles isolates constantly and spreads requests across
// colos — a "hit" and a "miss" a second apart on the same URL is normal. The
// headers below move the caching somewhere that survives that.
//
// Note for the Cloudflare side: a Worker response is not edge-cached just
// because it says so. `max-age` starts helping browsers immediately, but
// `s-maxage` only takes effect once a Cache Rule matching /api/* is set to
// cache eligible responses and respect the origin TTL.

/** How long the browser and the edge may reuse an answer, in seconds. */
export interface CacheWindow {
  /** Shared-cache lifetime — the CDN. Matches the route's own data TTL. */
  edge: number;
  /** Private-cache lifetime — the reader's browser. Deliberately shorter. */
  browser?: number;
}

/**
 * Mark a response as reusable.
 *
 * `stale-while-revalidate` runs to four times the edge window because a stale
 * river reading served instantly, then replaced, beats a spinner: the reader
 * sees the last known figure with its own timestamp on it rather than nothing.
 */
export function cacheFor<T extends Response>(res: T, { edge, browser = 30 }: CacheWindow): T {
  res.headers.set(
    'Cache-Control',
    `public, max-age=${Math.min(browser, edge)}, s-maxage=${edge}, stale-while-revalidate=${edge * 4}`,
  );
  return res;
}

/**
 * Mark a response as never reusable.
 *
 * For the degraded paths — an empty register because NDRRMA timed out, a feed
 * that came back with an error field. Caching one of those pins a family on
 * "not found" for minutes after the portal has come back, which is the one
 * outcome this desk cannot afford. The next request should try again.
 */
export function noStore<T extends Response>(res: T): T {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
