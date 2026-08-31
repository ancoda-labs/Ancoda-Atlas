import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { REPORT_THRESHOLD, hashIp, reportPhoto } from '@/lib/flood-photos';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// Flagging a ground-report photo.
//
// With no review before publication, this is the safety valve: anyone looking
// at the feed can pull a photo towards a takedown, and REPORT_THRESHOLD
// separate people retire it automatically without waiting for an operator.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const id = typeof payload.id === 'string' ? payload.id : '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const reason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 200) : null;

  try {
    const result = await reportPhoto(id, reason, hashIp(clientIp(req)));
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({
      counted: result.counted,
      removed: result.removed,
      threshold: REPORT_THRESHOLD,
    });
  } catch (err) {
    console.error('[Photos API] Report failed:', errorMessage(err));
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
