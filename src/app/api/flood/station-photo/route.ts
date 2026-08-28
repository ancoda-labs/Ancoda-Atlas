import type { NextRequest } from 'next/server';
import { resolveStationPhotoUrl } from '@/lib/flood';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// DHM publishes gauge-station photos over plain HTTP, which a browser blocks as
// mixed content on an HTTPS dashboard. Proxy them instead, and only from the
// one host we expect — never an arbitrary URL supplied by the caller.
const ALLOWED_HOSTS = new Set(['daq.hydrology.gov.np', 'hydrology.gov.np', 'www.dhm.gov.np', 'bipadportal.gov.np']);
const MAX_BYTES = 6 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isFinite(id)) {
    return new Response('Bad station id', { status: 400 });
  }

  const upstream = await resolveStationPhotoUrl(id);
  if (!upstream) return new Response('No photo for station', { status: 404 });

  let parsed: URL;
  try {
    parsed = new URL(upstream);
  } catch {
    return new Response('Bad upstream URL', { status: 502 });
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response('Upstream host not allowed', { status: 502 });
  }

  try {
    const res = await fetch(parsed.toString(), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return new Response('Upstream error', { status: 502 });

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response('Image too large', { status: 502 });

    // The upstream serves application/octet-stream; sniff the magic bytes so
    // the browser gets a type it will actually render, and so a non-image
    // response is rejected rather than passed through.
    const head = new Uint8Array(buf.slice(0, 12));
    let type: string | null = null;
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) type = 'image/jpeg';
    else if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) type = 'image/png';
    else if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) type = 'image/gif';
    else if (head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) type = 'image/webp';
    if (!type) return new Response('Upstream is not an image', { status: 502 });

    return new Response(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[Flood station photo] Failed:', errorMessage(err));
    return new Response('Fetch failed', { status: 502 });
  }
}
