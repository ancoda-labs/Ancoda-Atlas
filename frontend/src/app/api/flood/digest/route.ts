import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { cacheFor, noStore } from '@/lib/http-cache';
import { getDigests, scheduleCatchup } from '@/lib/news-digest-store';
import type { DigestLang } from '@/lib/news-digest-store';
import type { NewsDigestFeed } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// Ten-minute news briefs for the flood desk.
//
// The response is whatever has already been written. Filling gaps is kicked off
// alongside it and never awaited, so a reader arriving after a quiet stretch
// gets the existing timeline at once instead of waiting on a queue of model
// calls as long as the gap.

export async function GET(req: NextRequest) {
  // Resolved before the capability check so a disabled response still echoes
  // the language that was asked for, rather than silently answering in English.
  const lang: DigestLang = req.nextUrl.searchParams.get('lang') === 'ne' ? 'ne' : 'en';

  if (!isDbConfigured()) {
    const payload: NewsDigestFeed = { enabled: false, lang, digests: [], reason: 'database_not_configured' };
    return noStore(NextResponse.json(payload));
  }

  const limit = Number(req.nextUrl.searchParams.get('limit')) || 12;

  try {
    const digests = await getDigests(lang, limit);
    scheduleCatchup();
    const payload: NewsDigestFeed = { enabled: true, lang, digests };
    // Briefs are written on a ten-minute cycle; a minute at the edge cannot
    // hide one for meaningfully longer than it would have waited anyway.
    return cacheFor(NextResponse.json(payload), { edge: 60 });
  } catch (err) {
    console.error('[Digest API] Failed:', errorMessage(err));
    const payload: NewsDigestFeed = { enabled: false, lang, digests: [], reason: 'unavailable' };
    return noStore(NextResponse.json(payload, { status: 200 }));
  }
}
