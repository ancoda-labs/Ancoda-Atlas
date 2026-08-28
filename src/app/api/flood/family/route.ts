import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { FamilyRegister } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// The community missing-and-found register.
//
// Served from the ten-minute refresh. On a cold start — the first request after
// a deploy, before the first cycle lands — it falls back to fetching directly
// rather than showing a family an empty list.

const CACHE_TTL_S = 120;

export async function GET() {
  const store = getFloodStore();
  if (store.family) return cacheFor(NextResponse.json(store.family), { edge: CACHE_TTL_S });

  try {
    const { getFamilyRegister } = await import('@/apis/sources/family-register.mjs');
    const register = await getFamilyRegister();
    const res = NextResponse.json(register);
    // A register that arrived carrying an error is an empty list with a reason
    // attached. Serving that from cache would keep a search coming back empty
    // after the sheet is readable again.
    return register.error ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Family API] Failed:', message);
    return noStore(NextResponse.json(
      {
        missing: [],
        found: [],
        matched: [],
        counts: { missing: 0, found: 0, matched: 0 },
        forms: { missing: null, found: null },
        sheet: null,
        updatedAt: null,
        error: message,
        source: { label: 'Rasuwa flood bulletin — missing and found', url: 'https://nirajbhusal.github.io/rasuwa-flood-bulletin/#family' },
        fetchedAt: new Date().toISOString(),
      } satisfies FamilyRegister,
      { status: 200 },
    ));
  }
}
