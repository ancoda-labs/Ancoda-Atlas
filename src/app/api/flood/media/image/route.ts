import type { NextRequest } from 'next/server';
import { resolveSignedUrl } from '@/lib/news-media';
import { sniffType } from '@/lib/image';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// Streams one news photograph from the outlet that published it.
//
// Nothing is written to disk or to MinIO. The route will only fetch a URL that
// Atlas signed itself, so it cannot be pointed at an arbitrary host.

const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const upstream = resolveSignedUrl(params.get('u'), params.get('s'));
  if (!upstream) return new Response('Bad or missing signature', { status: 403 });

  try {
    const res = await fetch(upstream, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // No credentials, and no referer leaking which Atlas page a reader is on.
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'image/*', 'User-Agent': 'AncodaAtlas/4.0 (Nepal hazard monitoring)' },
    });
    if (!res.ok) return new Response('Upstream error', { status: 502 });

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return new Response('Image too large', { status: 502 });

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return new Response('Image too large', { status: 502 });

    // Decided from the bytes, not from the upstream's Content-Type header, so a
    // mislabelled or hostile response cannot be passed through as an image.
    const type = sniffType(buf);
    if (!type) return new Response('Upstream is not an image', { status: 502 });

    return new Response(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[News media] Fetch failed:', errorMessage(err));
    return new Response('Fetch failed', { status: 502 });
  }
}
