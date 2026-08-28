import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import type { FamilyRegister } from '@/lib/types';
import { errorMessage } from '@/lib/types';

export const dynamic = 'force-dynamic';

// The community missing-and-found register.
//
// Served from the ten-minute refresh. On a cold start — the first request after
// a deploy, before the first cycle lands — it falls back to fetching directly
// rather than showing a family an empty list.

export async function GET() {
  const store = getFloodStore();
  if (store.family) return NextResponse.json(store.family);

  try {
    const { getFamilyRegister } = await import('@/apis/sources/family-register.mjs');
    return NextResponse.json(await getFamilyRegister());
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Family API] Failed:', message);
    return NextResponse.json(
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
    );
  }
}
