import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFloodStore, setRescueOcrDocument } from '@/lib/flood-cron';
import { isTarkaOcrConfigured } from '@/lib/llm/tarka-ocr.mjs';
import {
  publicRescueOcrDocument,
  rescueOcrCsv,
} from '@/lib/rescue-ocr-utils.mjs';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(req: NextRequest): boolean {
  const expected = process.env.FLOOD_ADMIN_TOKEN;
  if (!expected) return false;
  const presented = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(presented && tokenMatches(presented, expected));
}

function csvResponse(csv: string, filename: string): NextResponse {
  const safe = filename.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'rescued-list';
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safe}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Latest structured extraction, as privacy-safe JSON or CSV. */
export async function GET(req: NextRequest) {
  const document = getFloodStore().ocrRescue;
  if (!document) {
    return NextResponse.json(
      {
        error: isTarkaOcrConfigured() ? 'no_document_ingested' : 'tarka_ocr_not_configured',
      },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const wantsSensitive = req.nextUrl.searchParams.get('include_sensitive') === '1';
  if (wantsSensitive && !authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const output = wantsSensitive ? document : publicRescueOcrDocument(document);
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    return csvResponse(
      rescueOcrCsv(output, { includeSensitive: wantsSensitive }),
      document.source_document.replace(/\.pdf$/i, ''),
    );
  }
  return NextResponse.json(output, { headers: { 'Cache-Control': 'no-store' } });
}

/** Operator-only URL or file ingestion. The full result is never public. */
export async function POST(req: NextRequest) {
  if (!process.env.FLOOD_ADMIN_TOKEN) {
    return NextResponse.json(
      { error: 'admin_token_not_configured' },
      { status: 404 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isTarkaOcrConfigured()) {
    return NextResponse.json({ error: 'tarka_ocr_not_configured' }, { status: 503 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    const previous = getFloodStore().ocrRescue;
    const ocr = await import('@/lib/rescue-ocr.mjs');
    let document;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'file_required' }, { status: 400 });
      }
      if (file.size > ocr.MAX_RESCUE_DOCUMENT_BYTES) {
        return NextResponse.json({ error: 'document_too_large' }, { status: 413 });
      }
      const eventId = form.get('event_id');
      document = await ocr.ingestRescueDocument({
        bytes: Buffer.from(await file.arrayBuffer()),
        sourceDocument: file.name,
        eventId: typeof eventId === 'string' ? eventId : undefined,
        previous,
      });
    } else {
      const body: unknown = await req.json();
      const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      if (typeof payload.url !== 'string') {
        return NextResponse.json({ error: 'document_url_required' }, { status: 400 });
      }
      document = await ocr.ingestRescueDocumentFromUrl({
        url: payload.url,
        eventId: typeof payload.event_id === 'string' ? payload.event_id : undefined,
        previous,
      });
    }

    setRescueOcrDocument(document);
    return NextResponse.json(document, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const detail = errorMessage(err);
    console.error('[Rescue OCR API] Ingestion failed:', detail);
    const status = err instanceof SyntaxError || detail === 'document_empty'
      ? 400
      : detail === 'document_too_large'
        ? 413
        : detail === 'unsupported_document_format'
          ? 415
          : detail.startsWith('document_url_')
            ? 400
            : 502;
    return NextResponse.json(
      { error: 'ingestion_failed', detail },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
