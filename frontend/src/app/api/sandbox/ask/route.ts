import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { noStore } from '@/lib/http-cache';
import { FAQ_CHIPS, faqBlurb } from '@/lib/ask-sandbox/faq';
import { hashAskClient } from '@/lib/ask-sandbox/rate-limit';
import { liveSnapshot } from '@/lib/ask-sandbox/live';
import { runAskTurn, sandboxStatus } from '@/lib/ask-sandbox/run';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function clientKey(req: NextRequest): string {
  return hashAskClient(clientIp(req));
}

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get('lang') === 'ne' ? 'ne' : 'en';
  const status = sandboxStatus(clientKey(req));
  return noStore(
    NextResponse.json({
      ...status,
      blurb: faqBlurb(lang),
      chips: FAQ_CHIPS.map(c => ({ id: c.id, label: c[lang] })),
    }),
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { message?: unknown; lang?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const lang = body.lang === 'ne' ? 'ne' : 'en';
    if (!message || message.length > 500) {
      return noStore(NextResponse.json({ error: 'message_required' }, { status: 400 }));
    }
    const result = await runAskTurn({
      question: message,
      lang,
      clientKey: clientKey(req),
      snapshot: liveSnapshot(),
    });
    return noStore(NextResponse.json(result));
  } catch (err) {
    return noStore(
      NextResponse.json({ error: errorMessage(err) }, { status: 500 }),
    );
  }
}
