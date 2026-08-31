import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { isDbConfigured, requireDb } from '@/lib/db';
import { hashIp } from '@/lib/flood-photos';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// Corrections against the rescue register.
//
// Atlas republishes NDRRMA's register as published and has no way to edit the
// government's copy. This is the route that lets a reader say a row is wrong,
// so the desk has something concrete to take back to NDRRMA rather than an
// error with nowhere to go.

const KINDS = new Set(['wrong_details', 'not_safe', 'missing_person', 'remove_me', 'other']);

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

  const kind = typeof payload.kind === 'string' && KINDS.has(payload.kind) ? payload.kind : 'other';
  const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 2000) : '';
  if (!message) return NextResponse.json({ error: 'message_required' }, { status: 400 });

  const personId = Number.isInteger(payload.personId) ? (payload.personId as number) : null;
  const personName = typeof payload.personName === 'string' ? payload.personName.trim().slice(0, 200) : null;
  const contact = typeof payload.contact === 'string' ? payload.contact.trim().slice(0, 200) : null;

  try {
    const { error } = await requireDb().from('rescue_corrections').insert({
      id: randomUUID(),
      person_id: personId,
      person_name: personName,
      kind,
      message,
      contact,
      ip_hash: hashIp(clientIp(req)),
    });
    if (error) throw new Error(error.message);
    console.warn(`[Rescue] Correction raised (${kind}) for person ${personId ?? personName ?? 'unspecified'}`);
    return NextResponse.json({ received: true }, { status: 201 });
  } catch (err) {
    console.error('[Rescue correction] Failed:', errorMessage(err));
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
