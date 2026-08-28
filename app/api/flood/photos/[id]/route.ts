import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { isDbConfigured } from '@/lib/db';
import { removePhoto } from '@/lib/flood-photos';
import { errorMessage } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Operator takedown for a single ground-report photo.
//
// Guarded by a shared token in FLOOD_ADMIN_TOKEN. When that is unset the route
// answers 404 rather than 401: an unconfigured deployment should not advertise
// that a takedown endpoint exists at all.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Constant-time compare, so the token cannot be recovered a byte at a time. */
function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/flood/photos/[id]'>) {
  const expected = process.env.FLOOD_ADMIN_TOKEN;
  if (!expected) return new Response('Not found', { status: 404 });

  const presented = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!presented || !tokenMatches(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const reason = req.nextUrl.searchParams.get('reason') || 'operator takedown';

  try {
    const removed = await removePhoto(id, reason);
    if (!removed) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    console.warn(`[Photos] Operator removed ${id}: ${reason}`);
    return NextResponse.json({ removed: true, id });
  } catch (err) {
    console.error('[Photos API] Takedown failed:', errorMessage(err));
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
