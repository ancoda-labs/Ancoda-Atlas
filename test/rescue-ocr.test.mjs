import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestRescueDocument } from '../src/lib/rescue-ocr.mjs';
import {
  assertNdrrmaDocumentUrl,
  parseRescueOcrRecords,
  publicRescueOcrDocument,
  rescueOcrCsv,
} from '../src/lib/rescue-ocr-utils.mjs';

test('OCR JSON is normalized without inventing missing rescue fields', () => {
  const records = parseRescueOcrRecords(`\`\`\`json
  {"records":[{
    "full_name":"सविता रिजाल",
    "nationality":"Nepali",
    "age":"२७",
    "passport":"P-123",
    "contact_no":"9800000000",
    "rescued_from":"Rasuwa",
    "page":3
  }]}
  \`\`\``, { pageMin: 1, pageMax: 4 });

  assert.equal(records.length, 1);
  assert.equal(records[0].name, 'सविता रिजाल');
  assert.equal(records[0].nationality, 'nepali');
  assert.equal(records[0].age, 27);
  assert.equal(records[0].passport_or_id, 'P-123');
  assert.equal(records[0].rescue_location, 'Rasuwa');
  assert.equal(records[0].status, null);
  assert.equal(records[0].source_page, 3);
  assert.equal(records[0].review_status, 'unverified_ocr');
});

test('a country returned in the nationality column remains classifiable', () => {
  const records = parseRescueOcrRecords(JSON.stringify({
    records: [{ name: 'Sajan Kumar Shah', nationality: 'India', source_page: 1 }],
  }));

  assert.equal(records[0].country, 'India');
  assert.equal(records[0].nationality, 'foreign');
});

test('the server fetch allowlist is limited to NDRRMA media documents', () => {
  assert.equal(
    assertNdrrmaDocumentUrl(
      'https://ndrrma.gov.np/mediafiles/website/popup/documents/rescued.pdf',
    ).hostname,
    'ndrrma.gov.np',
  );
  const forbidden = [
    'http://ndrrma.gov.np/mediafiles/document.pdf',
    'https://ndrrma.gov.np/api/v1/private',
    'https://evil.example/mediafiles/document.pdf',
    'https://ndrrma.gov.np.evil.example/mediafiles/document.pdf',
    'https://ndrrma.gov.np@evil.example/mediafiles/document.pdf',
  ];
  for (const url of forbidden) {
    assert.throws(() => assertNdrrmaDocumentUrl(url), /document_url_not_allowed/);
  }
});

test('image ingestion produces the issue schema and automatic counts', async () => {
  // Only magic bytes are needed here: image documents are passed through to
  // Tarka rather than decoded locally.
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('test-image'),
  ]);
  let capturedImages = null;
  const client = {
    isConfigured: true,
    model: 'glm-ocr-nepali',
    async extract(images, prompt) {
      capturedImages = images;
      assert.match(prompt, /STRICT JSON/);
      return {
        model: 'glm-ocr-nepali',
        text: JSON.stringify({
          records: [
            { name: 'Sajan Kumar Shah', country: 'India', age: 35, source_page: 1 },
            { name: 'सविता रिजाल', nationality: 'Nepali', age: 27, source_page: 1 },
          ],
        }),
      };
    },
  };

  const document = await ingestRescueDocument({
    bytes: png,
    sourceDocument: 'rescued.png',
    sourceUrl: 'https://ndrrma.gov.np/mediafiles/rescued.png',
    client,
  });

  assert.equal(capturedImages.length, 1);
  assert.match(capturedImages[0], /^data:image\/png;base64,/);
  assert.equal(document.event_id, 'rasuwa-bhotekoshi-flood-2026');
  assert.equal(document.records.length, 2);
  assert.deepEqual(document.summary, { total: 2, nepali: 1, foreign: 1, unknown: 0 });
  assert.equal(document.complete, true);
  assert.equal(document.processed_pages, 1);
  assert.match(document.records[0].id, /^ocr-[a-f0-9]{12}-1$/);
});

test('a successful OCR call with no rescue rows cannot replace stored data', async () => {
  const image = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('empty-table'),
  ]);
  const client = {
    isConfigured: true,
    model: 'glm-ocr-nepali',
    async extract() {
      return { model: 'glm-ocr-nepali', text: '{"records":[]}' };
    },
  };

  await assert.rejects(
    () => ingestRescueDocument({ bytes: image, client }),
    /no_rescue_records_extracted/,
  );
});

test('public JSON and CSV remove identity and contact fields', () => {
  const document = {
    event_id: 'event',
    source_document: 'rescued.pdf',
    source_url: null,
    source_sha256: 'abc',
    extracted_at: '2026-08-30T00:00:00.000Z',
    model: 'glm-ocr-nepali',
    page_count: 1,
    processed_pages: 1,
    complete: true,
    warnings: [],
    summary: { total: 1, nepali: 0, foreign: 1, unknown: 0 },
    records: [{
      id: 'ocr-1',
      name: 'Example, Person',
      nationality: 'foreign',
      country: 'India',
      age: 35,
      gender: 'Male',
      passport_or_id: 'P-123',
      contact: '9800000000',
      rescue_location: 'Rasuwa',
      destination_or_hospital: null,
      status: null,
      rescue_date: null,
      report_timestamp: null,
      remarks: null,
      source_page: 1,
      review_status: 'unverified_ocr',
    }],
  };

  const publicDocument = publicRescueOcrDocument(document);
  assert.equal('passport_or_id' in publicDocument.records[0], false);
  assert.equal('contact' in publicDocument.records[0], false);
  const csv = rescueOcrCsv(publicDocument);
  assert.doesNotMatch(csv, /P-123|9800000000|passport_or_id|contact/);
  assert.match(csv, /"Example, Person"/);
});
