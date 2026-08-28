import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { isStorageConfigured } from '@/lib/storage';
import {
  MAX_CAPTION_CHARS,
  MAX_CONTRIBUTOR_CHARS,
  MAX_UPLOAD_BYTES,
  UPLOAD_LIMIT,
  UPLOAD_LIMIT_WINDOW_MINUTES,
  DISTRICT_CENTRES,
  createPhoto,
  hashIp,
  listPhotos,
  recentUploadCount,
} from '@/lib/flood-photos';
import type { FloodPhotoFeed } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Ground reports from the flood corridor.
 *
 * GET  — the published feed, with a short-lived URL per photo.
 * POST — one photo, multipart. A Route Handler rather than a Server Action
 *        because Server Actions cap request bodies at 1MB, and a phone photo
 *        is routinely eight times that.
 */

/** The caller's address, as far forward as the proxy chain reports it. */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function disabledReason(): string | null {
  if (!isDbConfigured()) return 'database_not_configured';
  if (!isStorageConfigured()) return 'storage_not_configured';
  return null;
}

export async function GET() {
  const reason = disabledReason();
  if (reason) {
    const payload: FloodPhotoFeed = { enabled: false, photos: [], reason };
    return NextResponse.json(payload);
  }
  try {
    const payload: FloodPhotoFeed = { enabled: true, photos: await listPhotos(60) };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[Photos API] List failed:', errorMessage(err));
    // The rest of the flood desk does not depend on this feed, so a database
    // blip should empty one section rather than break the page.
    const payload: FloodPhotoFeed = { enabled: false, photos: [], reason: 'unavailable' };
    return NextResponse.json(payload, { status: 200 });
  }
}

function text(form: FormData, field: string, max: number): string | null {
  const value = form.get(field);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

function coordinate(form: FormData, field: string): number | null {
  const value = form.get(field);
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const reason = disabledReason();
  if (reason) return NextResponse.json({ error: reason }, { status: 503 });

  // Reject an oversized body before buffering it rather than after.
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'file_too_large', maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // The safety notice is not decoration. A sender confirms they were not at the
  // water's edge before the desk will take the photo, and the server enforces
  // it so the check cannot be skipped by posting straight to this endpoint.
  if (form.get('safetyAcknowledged') !== 'true') {
    return NextResponse.json({ error: 'safety_not_acknowledged' }, { status: 400 });
  }

  const file = form.get('photo');
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'file_too_large', maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
  }

  const ipHash = hashIp(clientIp(req));

  try {
    if ((await recentUploadCount(ipHash)) >= UPLOAD_LIMIT) {
      return NextResponse.json(
        { error: 'rate_limited', limit: UPLOAD_LIMIT, windowMinutes: UPLOAD_LIMIT_WINDOW_MINUTES },
        { status: 429 },
      );
    }
  } catch (err) {
    console.error('[Photos API] Rate-limit check failed:', errorMessage(err));
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const districtRaw = text(form, 'district', 40);
  const district = districtRaw && districtRaw in DISTRICT_CENTRES ? districtRaw : null;

  const result = await createPhoto({
    bytes: Buffer.from(await file.arrayBuffer()),
    caption: text(form, 'caption', MAX_CAPTION_CHARS),
    contributor: text(form, 'contributor', MAX_CONTRIBUTOR_CHARS),
    district,
    placeLabel: text(form, 'placeLabel', 80),
    deviceLat: coordinate(form, 'lat'),
    deviceLon: coordinate(form, 'lon'),
    ipHash,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ photo: result.photo }, { status: 201 });
}
