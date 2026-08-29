import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { FloodOfficialFeed, PortalDonationChannel } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// The donation channels the Office of the Prime Minister publishes, live.
//
// On its own route rather than inside the desk payload for two reasons. The
// QR codes arrive as inline base64 images and would roughly double the size of
// a payload every page on the desk loads. And the giving page treats these
// differently from its reviewed accounts — they are shown under the portal's
// name, with its link, and are never merged into the hand-checked fund table —
// so keeping them on a separate wire keeps that separation obvious.

const CACHE_TTL_S = 300;

function empty(error: string): FloodOfficialFeed<PortalDonationChannel> {
  return {
    items: [],
    error,
    source: { label: 'OPMCM rescue portal — donations', url: 'https://rescue.opmcm.gov.np/donations' },
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const store = getFloodStore();
  if (store.donationChannels) {
    const res = NextResponse.json(store.donationChannels);
    res.headers.set('X-Atlas-Cache', 'cron');
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  try {
    const { getDonationChannels } = await import('@/apis/sources/rescue-portal.mjs');
    const { proxyUrlFor } = await import('@/lib/news-media');
    const feed = await getDonationChannels({ limit: 12 });
    const payload: FloodOfficialFeed<PortalDonationChannel> = {
      items: feed.items.map(({ qrImage, ...rest }) => ({ ...rest, qrProxy: proxyUrlFor(qrImage) })),
      error: feed.error,
      source: feed.source,
      fetchedAt: feed.fetchedAt,
    };
    const res = NextResponse.json(payload);
    return payload.error && !payload.items.length ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Donations API] Failed:', message);
    return noStore(NextResponse.json(empty(message), { status: 200 }));
  }
}
