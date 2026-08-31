/**
 * Server-side reads of the Atlas API, for the first paint.
 *
 * Two reasons these exist rather than letting the client fetch everything.
 *
 * The flood desk's reviewed content — helplines, bank accounts, the sitrep —
 * has to be in the first HTML. This is the page that tells someone who to
 * call, and it must not wait on a round trip to say so.
 *
 * The dashboard's snapshot likewise: a reader on a slow connection should get
 * the hazard figures in the markup rather than after a request completes.
 *
 * ATLAS_API_BASE_URL is a RUNTIME value, unlike NEXT_PUBLIC_API_BASE_URL, and
 * in Docker it points at the API container directly — so a server render does
 * not go back out through the proxy to reach a service sitting beside it.
 */
const API = (process.env.ATLAS_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

/** Never throws. A cold or unreachable API means the page renders its empty
 *  state and the client query fills in, which is the same thing that happens
 *  before the first sweep anyway. */
export async function serverGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/api/v1${path}`, {
      // Always current: this runs per request and the API does its own caching.
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
