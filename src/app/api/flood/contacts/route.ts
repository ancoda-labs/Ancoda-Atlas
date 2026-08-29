import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { BipadDistrictContacts, FloodOfficialFeed } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// The local government's own contact register, per affected district.
//
// On its own route rather than in the desk payload: it is three hundred rows
// and only one page needs them.
//
// These are the government's numbers as BIPAD lists them, and the page says so.
// They do not replace the hand-verified national lines beside them — Atlas has
// not rung these, and a number nobody has checked is presented as exactly that.

const CACHE_TTL_S = 600;

function empty(error: string): FloodOfficialFeed<BipadDistrictContacts> {
  return {
    items: [],
    error,
    source: { label: 'BIPAD Portal — district contacts', url: 'https://bipadportal.gov.np/' },
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const store = getFloodStore();
  if (store.officialContacts) {
    const res = NextResponse.json(store.officialContacts);
    res.headers.set('X-Atlas-Cache', 'cron');
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  try {
    const { getDistrictContacts } = await import('@/apis/sources/bipad.mjs');
    const feed = await getDistrictContacts();
    const payload: FloodOfficialFeed<BipadDistrictContacts> = {
      items: feed.districts,
      error: feed.error,
      source: feed.source,
      fetchedAt: feed.fetchedAt,
    };
    const res = NextResponse.json(payload);
    return payload.error && !payload.items.length ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Contacts API] Failed:', message);
    return noStore(NextResponse.json(empty(message), { status: 200 }));
  }
}
