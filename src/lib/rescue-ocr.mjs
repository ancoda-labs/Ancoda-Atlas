// NDRRMA rescue-document ingestion through Tarka OCR.
//
// The utility API accepts images, not remote files. This module owns the risky
// boundary before inference: only NDRRMA media URLs, bounded downloads, magic-
// byte format checks, and at most 32 rasterized PDF pages. OCR output is then
// parsed into a narrow rescue schema and marked unverified for human review.

import { createHash } from 'crypto';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TarkaOcrProvider, isTarkaOcrConfigured } from './llm/tarka-ocr.mjs';
import {
  assertNdrrmaDocumentUrl,
  parseRescueOcrRecords,
  summarizeRescueOcrRecords,
} from './rescue-ocr-utils.mjs';

export const MAX_RESCUE_DOCUMENT_BYTES = 12 * 1024 * 1024;
export const MAX_RESCUE_DOCUMENT_PAGES = 32;

const FETCH_TIMEOUT_MS = 30_000;
const OCR_TIMEOUT_MS = 120_000;
const DEFAULT_EVENT_ID = 'rasuwa-bhotekoshi-flood-2026';
const PDF_SCALE = 1.5;
const MAX_RENDER_DIMENSION = 2400;
const MAX_RENDER_PIXELS = 6_000_000;
const JPEG_QUALITY = 82;
const BATCH_PAGES = 8;
const BATCH_CONCURRENCY = 2;

function formatOf(bytes) {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { kind: 'pdf', mime: 'application/pdf' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'image', mime: 'image/jpeg' };
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { kind: 'image', mime: 'image/png' };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { kind: 'image', mime: 'image/webp' };
  }
  throw new Error('unsupported_document_format');
}

function documentName(sourceUrl, fallback = 'rescue-document') {
  if (!sourceUrl) return fallback;
  try {
    const name = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop() || '');
    return name.slice(0, 240) || fallback;
  } catch {
    return fallback;
  }
}

async function readBoundedBody(response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESCUE_DOCUMENT_BYTES) {
    throw new Error('document_too_large');
  }
  if (!response.body) throw new Error('document_body_missing');

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESCUE_DOCUMENT_BYTES) {
      await reader.cancel();
      throw new Error('document_too_large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Download one official document, validating every redirect target. */
export async function fetchNdrrmaRescueDocument(value, redirectsLeft = 3) {
  const url = assertNdrrmaDocumentUrl(value);
  const response = await fetch(url, {
    redirect: 'manual',
    headers: {
      Accept: 'application/pdf,image/jpeg,image/png,image/webp',
      'User-Agent': 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirectsLeft <= 0) throw new Error('too_many_document_redirects');
    const location = response.headers.get('location');
    if (!location) throw new Error('document_redirect_without_location');
    await response.body?.cancel();
    return fetchNdrrmaRescueDocument(new URL(location, url).toString(), redirectsLeft - 1);
  }
  if (!response.ok) throw new Error(`document_fetch_${response.status}`);

  const bytes = await readBoundedBody(response);
  formatOf(bytes); // Magic bytes, not the upstream Content-Type, decide.
  return {
    bytes,
    sourceUrl: url.toString(),
    sourceDocument: documentName(url.toString()),
  };
}

async function rasterize(bytes) {
  const format = formatOf(bytes);
  if (format.kind === 'image') {
    return {
      pageCount: 1,
      images: [`data:${format.mime};base64,${bytes.toString('base64')}`],
    };
  }

  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  if (pdf.numPages < 1) {
    await loadingTask.destroy();
    throw new Error('pdf_has_no_pages');
  }
  if (pdf.numPages > MAX_RESCUE_DOCUMENT_PAGES) {
    await loadingTask.destroy();
    throw new Error('pdf_has_too_many_pages');
  }

  try {
    const images = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        PDF_SCALE,
        MAX_RENDER_DIMENSION / base.width,
        MAX_RENDER_DIMENSION / base.height,
        Math.sqrt(MAX_RENDER_PIXELS / (base.width * base.height)),
      );
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      images.push(`data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', JPEG_QUALITY).toString('base64')}`);
      page.cleanup();
    }
    return { pageCount: pdf.numPages, images };
  } finally {
    await loadingTask.destroy();
  }
}

function promptForPages(start, end) {
  return `Read pages ${start}-${end} of this official NDRRMA rescued-persons document.

Return STRICT JSON only, with this exact shape:
{"records":[{"name":"exact text","nationality":"nepali or foreign or null","country":"country or origin or null","age":null,"gender":null,"passport_or_id":null,"contact":null,"rescue_location":null,"destination_or_hospital":null,"status":null,"rescue_date":null,"report_timestamp":null,"remarks":null,"source_page":${start}}]}

Rules:
- One record per named rescued person. Do not create records for totals, headings, or rows whose name is only a dash.
- Preserve names and values exactly as printed. Never correct a spelling, translate, infer, or invent a value.
- Carry a country or date down only when the table visibly uses merged cells for following rows.
- Use null for every blank or unreadable cell.
- source_page must be the 1-based PDF page number between ${start} and ${end}.
- Return the JSON object and nothing else.`;
}

function batchesOf(images) {
  const batches = [];
  for (let offset = 0; offset < images.length; offset += BATCH_PAGES) {
    batches.push({
      index: batches.length,
      start: offset + 1,
      end: Math.min(offset + BATCH_PAGES, images.length),
      images: images.slice(offset, offset + BATCH_PAGES),
    });
  }
  return batches;
}

async function readBatches(client, batches) {
  const results = new Array(batches.length);
  let cursor = 0;

  async function worker() {
    while (cursor < batches.length) {
      const current = cursor;
      cursor += 1;
      const batch = batches[current];
      try {
        const response = await client.extract(
          batch.images,
          promptForPages(batch.start, batch.end),
          { timeout: OCR_TIMEOUT_MS, maxTokens: 12_000 },
        );
        results[current] = {
          ok: true,
          model: response.model,
          records: parseRescueOcrRecords(response.text, {
            pageMin: batch.start,
            pageMax: batch.end,
          }),
          pages: batch.images.length,
        };
      } catch (err) {
        console.error(`[Rescue OCR] Pages ${batch.start}-${batch.end} failed:`, err?.message || err);
        results[current] = {
          ok: false,
          warning: `Pages ${batch.start}-${batch.end} could not be read.`,
          records: [],
          pages: 0,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, () => worker()),
  );
  return results;
}

/** Ingest bytes supplied by an authenticated route or the scheduled importer. */
export async function ingestRescueDocument({
  bytes,
  sourceUrl = null,
  sourceDocument = null,
  eventId = DEFAULT_EVENT_ID,
  previous = null,
  client = null,
}) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error('document_empty');
  if (bytes.length > MAX_RESCUE_DOCUMENT_BYTES) throw new Error('document_too_large');
  formatOf(bytes);

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (previous?.source_sha256 === sha256 && previous.records?.length) return previous;

  const ocr = client || new TarkaOcrProvider();
  if (!ocr.isConfigured) throw new Error('tarka_ocr_not_configured');

  const { images, pageCount } = await rasterize(bytes);
  const results = await readBatches(ocr, batchesOf(images));
  const successful = results.filter(result => result.ok);
  if (!successful.length) throw new Error('no_ocr_batch_succeeded');

  const records = successful.flatMap(result => result.records);
  if (!records.length) throw new Error('no_rescue_records_extracted');
  records.forEach((record, index) => {
    record.id = `ocr-${sha256.slice(0, 12)}-${index + 1}`;
  });
  const warnings = results.filter(result => !result.ok).map(result => result.warning);
  const models = [...new Set(successful.map(result => result.model).filter(Boolean))];

  return {
    event_id: textEventId(eventId),
    source_document: (sourceDocument || documentName(sourceUrl)).slice(0, 240),
    source_url: sourceUrl,
    source_sha256: sha256,
    extracted_at: new Date().toISOString(),
    model: models.join(', ') || ocr.model,
    page_count: pageCount,
    processed_pages: successful.reduce((sum, result) => sum + result.pages, 0),
    complete: warnings.length === 0,
    warnings,
    summary: summarizeRescueOcrRecords(records),
    records,
  };
}

function textEventId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value)
    ? value
    : DEFAULT_EVENT_ID;
}

export async function ingestRescueDocumentFromUrl({
  url,
  eventId = DEFAULT_EVENT_ID,
  previous = null,
  client = null,
}) {
  const fetched = await fetchNdrrmaRescueDocument(url);
  return ingestRescueDocument({
    ...fetched,
    eventId,
    previous,
    client,
  });
}

export { isTarkaOcrConfigured };
