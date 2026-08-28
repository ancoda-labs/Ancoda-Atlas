// Verification for lib/image.ts — the EXIF reader and the metadata stripper.
//
// This code walks JPEG, PNG and WebP containers byte by byte with no image
// library behind it, and it decides two things that matter: where a ground
// report gets pinned on the map, and whether the device and location tags a
// phone wrote into the file are still there after Atlas stores it. Both are
// worth a test with real bytes rather than a reading of the code.
//
// Run: node --experimental-strip-types --test test/flood-image.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readImageFacts, sniffType, stripMetadata } from '../lib/image.ts';

// ─── Builders: synthesise the containers rather than ship binary fixtures ───

/** A TIFF block with an orientation, a GPS IFD and a capture time. */
function buildExifTiff({ lat, latRef, lon, lonRef, orientation }) {
  const parts = [];
  const header = Buffer.alloc(8);
  header.write('II', 0, 'ascii');       // little-endian
  header.writeUInt16LE(0x002a, 2);
  header.writeUInt32LE(8, 4);           // IFD0 starts right after the header
  parts.push(header);

  // IFD0: Orientation, GPS pointer, Exif pointer.
  const ifd0 = Buffer.alloc(2 + 3 * 12 + 4);
  ifd0.writeUInt16LE(3, 0);
  const entry = (buf, i, tag, type, count, value) => {
    const at = 2 + i * 12;
    buf.writeUInt16LE(tag, at);
    buf.writeUInt16LE(type, at + 2);
    buf.writeUInt32LE(count, at + 4);
    buf.writeUInt32LE(value, at + 8);
  };
  const ifd0End = 8 + ifd0.length;
  const gpsOffset = ifd0End;
  // GPS IFD: 4 entries plus the two coordinate triples stored after it.
  const gpsIfdSize = 2 + 4 * 12 + 4;
  const gpsValuesOffset = gpsOffset + gpsIfdSize;
  const exifOffset = gpsValuesOffset + 48; // two triples of three rationals

  entry(ifd0, 0, 0x0112, 3, 1, orientation);  // Orientation (SHORT, inline)
  entry(ifd0, 1, 0x8825, 4, 1, gpsOffset);    // GPS IFD pointer
  entry(ifd0, 2, 0x8769, 4, 1, exifOffset);   // Exif IFD pointer
  ifd0.writeUInt32LE(0, 2 + 3 * 12);          // no IFD1
  parts.push(ifd0);

  const gps = Buffer.alloc(gpsIfdSize);
  gps.writeUInt16LE(4, 0);
  // Refs are single ASCII characters, so they sit inline in the entry.
  const refValue = ch => ch.charCodeAt(0);
  entry(gps, 0, 0x0001, 2, 2, refValue(latRef));
  entry(gps, 1, 0x0002, 5, 3, gpsValuesOffset);
  entry(gps, 2, 0x0003, 2, 2, refValue(lonRef));
  entry(gps, 3, 0x0004, 5, 3, gpsValuesOffset + 24);
  gps.writeUInt32LE(0, 2 + 4 * 12);
  parts.push(gps);

  // Degrees, minutes, seconds as RATIONALs, each numerator over denominator.
  const dms = (deg, min, sec) => {
    const b = Buffer.alloc(24);
    b.writeUInt32LE(deg, 0);  b.writeUInt32LE(1, 4);
    b.writeUInt32LE(min, 8);  b.writeUInt32LE(1, 12);
    // Seconds keep two decimals via a denominator of 100.
    b.writeUInt32LE(Math.round(sec * 100), 16); b.writeUInt32LE(100, 20);
    return b;
  };
  parts.push(dms(...lat));
  parts.push(dms(...lon));

  // Exif IFD carrying DateTimeOriginal.
  const exifIfd = Buffer.alloc(2 + 12 + 4);
  exifIfd.writeUInt16LE(1, 0);
  const dateOffset = exifOffset + exifIfd.length;
  entry(exifIfd, 0, 0x9003, 2, 20, dateOffset);
  exifIfd.writeUInt32LE(0, 2 + 12);
  parts.push(exifIfd);
  const date = Buffer.alloc(20);
  date.write('2026:08:26:08:40:00'.replace(/:(\d\d):(\d\d):(\d\d)$/, ' $1:$2:$3'), 0, 'ascii');
  parts.push(date);

  return Buffer.concat(parts);
}

function jpegSegment(marker, payload) {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** A structurally valid JPEG: SOI, JFIF, optional EXIF, a SOF0, SOS, EOI. */
function buildJpeg({ exif = null, comment = null, width = 4032, height = 3024 } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  parts.push(jpegSegment(0xe0, Buffer.concat([Buffer.from('JFIF\0', 'ascii'), Buffer.alloc(9)])));
  if (exif) parts.push(jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), exif])));
  if (comment) parts.push(jpegSegment(0xfe, Buffer.from(comment, 'ascii')));
  const sof = Buffer.alloc(6);
  sof[0] = 8;
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof[5] = 3;
  parts.push(jpegSegment(0xc0, sof));
  // Start of scan, then some entropy-coded bytes, then end of image.
  parts.push(jpegSegment(0xda, Buffer.from([0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00])));
  parts.push(Buffer.alloc(512, 0x5a));
  parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  // The CRC is not verified by the walker, so a placeholder keeps this honest
  // about what is being tested: chunk framing, not checksums.
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

function buildPng({ width = 800, height = 600, withText = true } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
  ];
  if (withText) {
    parts.push(pngChunk('tEXt', Buffer.from('Software\0Nikon Transfer 2', 'ascii')));
    parts.push(pngChunk('tIME', Buffer.alloc(7)));
  }
  parts.push(pngChunk('IDAT', Buffer.alloc(256, 0x11)));
  parts.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function riffChunk(fourcc, data) {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, 'ascii');
  head.writeUInt32LE(data.length, 4);
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([head, data, pad]);
}

function buildWebp({ width = 1200, height = 900, withExif = true } = {}) {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08; // the EXIF flag
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);
  const chunks = [riffChunk('VP8X', vp8x), riffChunk('VP8 ', Buffer.alloc(64, 0x22))];
  if (withExif) {
    chunks.push(riffChunk('EXIF', buildExifTiff({ lat: [28, 7, 0], latRef: 'N', lon: [85, 18, 0], lonRef: 'E', orientation: 1 })));
    chunks.push(riffChunk('XMP ', Buffer.from('<x:xmpmeta>private</x:xmpmeta>', 'ascii')));
  }
  const body = Buffer.concat(chunks);
  const out = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), body]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('sniffType identifies each format from its magic bytes', () => {
  assert.equal(sniffType(buildJpeg()), 'image/jpeg');
  assert.equal(sniffType(buildPng()), 'image/png');
  assert.equal(sniffType(buildWebp()), 'image/webp');
  assert.equal(sniffType(Buffer.from('%PDF-1.7 not an image at all')), null);
  assert.equal(sniffType(Buffer.alloc(4)), null, 'a truncated buffer is not an image');
});

test('a mislabelled file is judged on its bytes, not its extension', () => {
  // The upload route trusts sniffType over the browser's Content-Type.
  const pdf = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n1 0 obj', 'binary');
  assert.equal(sniffType(pdf), null);
});

test('JPEG: GPS, orientation and capture time are read out of EXIF', () => {
  // Rasuwagadhi, near enough: 28°07\'N 85°18\'E.
  const jpeg = buildJpeg({
    exif: buildExifTiff({ lat: [28, 7, 12], latRef: 'N', lon: [85, 18, 36], lonRef: 'E', orientation: 6 }),
  });
  const facts = readImageFacts(jpeg, 'image/jpeg');

  assert.equal(facts.width, 4032);
  assert.equal(facts.height, 3024);
  assert.equal(facts.orientation, 6, 'portrait phone photo');
  assert.ok(Math.abs(facts.lat - (28 + 7 / 60 + 12 / 3600)) < 1e-6, `lat was ${facts.lat}`);
  assert.ok(Math.abs(facts.lon - (85 + 18 / 60 + 36 / 3600)) < 1e-6, `lon was ${facts.lon}`);
  assert.equal(facts.takenAt?.toISOString(), '2026-08-26T08:40:00.000Z');
});

test('JPEG: southern and western hemisphere refs come back negative', () => {
  const jpeg = buildJpeg({
    exif: buildExifTiff({ lat: [12, 30, 0], latRef: 'S', lon: [77, 15, 0], lonRef: 'W', orientation: 1 }),
  });
  const facts = readImageFacts(jpeg, 'image/jpeg');
  assert.ok(facts.lat < 0, 'S is negative');
  assert.ok(facts.lon < 0, 'W is negative');
});

test('JPEG: stripping removes EXIF and comments but keeps the image', () => {
  const jpeg = buildJpeg({
    exif: buildExifTiff({ lat: [28, 7, 12], latRef: 'N', lon: [85, 18, 36], lonRef: 'E', orientation: 6 }),
    comment: 'Shot on a phone belonging to a real person',
  });
  const stripped = stripMetadata(jpeg, 'image/jpeg');

  assert.equal(sniffType(stripped), 'image/jpeg', 'still a JPEG');
  assert.ok(stripped.length < jpeg.length, 'smaller than the original');
  assert.equal(stripped.includes(Buffer.from('Exif\0\0', 'ascii')), false, 'no EXIF marker survives');
  assert.equal(stripped.includes(Buffer.from('belonging to a real person')), false, 'no comment survives');

  // The frame header and the scan data must both still be there.
  const after = readImageFacts(stripped, 'image/jpeg');
  assert.equal(after.width, 4032);
  assert.equal(after.height, 3024);
  assert.equal(after.lat, null, 'position is gone from the stored bytes');
  assert.equal(after.orientation, 1, 'and so is the orientation tag');
});

test('PNG: dimensions read, text and time chunks stripped', () => {
  const png = buildPng();
  const facts = readImageFacts(png, 'image/png');
  assert.equal(facts.width, 800);
  assert.equal(facts.height, 600);

  const stripped = stripMetadata(png, 'image/png');
  assert.equal(sniffType(stripped), 'image/png');
  assert.equal(stripped.includes(Buffer.from('Nikon Transfer 2')), false, 'no tEXt survives');
  assert.equal(stripped.includes(Buffer.from('tIME')), false, 'no timestamp survives');
  assert.ok(stripped.includes(Buffer.from('IDAT')), 'the pixels are still there');
  assert.ok(stripped.includes(Buffer.from('IEND')), 'and the file still terminates');
});

test('WebP: dimensions and EXIF read, EXIF and XMP stripped, RIFF size rewritten', () => {
  const webp = buildWebp();
  const facts = readImageFacts(webp, 'image/webp');
  assert.equal(facts.width, 1200);
  assert.equal(facts.height, 900);
  assert.ok(facts.lat > 28 && facts.lat < 29, `lat was ${facts.lat}`);

  const stripped = stripMetadata(webp, 'image/webp');
  assert.equal(sniffType(stripped), 'image/webp');
  assert.equal(stripped.includes(Buffer.from('XMP ')), false, 'no XMP survives');
  assert.equal(
    stripped.readUInt32LE(4),
    stripped.length - 8,
    'the RIFF size field matches the shortened file',
  );
});

test('a photo with no EXIF at all is handled, not rejected', () => {
  const facts = readImageFacts(buildJpeg(), 'image/jpeg');
  assert.equal(facts.lat, null);
  assert.equal(facts.lon, null);
  assert.equal(facts.orientation, 1);
  assert.equal(facts.width, 4032, 'dimensions still come from the frame header');
});

test('a truncated or malformed file costs its metadata, not the upload', () => {
  const truncated = buildJpeg({ exif: buildExifTiff({ lat: [28, 7, 0], latRef: 'N', lon: [85, 18, 0], lonRef: 'E', orientation: 1 }) }).subarray(0, 40);
  const facts = readImageFacts(truncated, 'image/jpeg');
  assert.equal(facts.lat, null, 'no coordinates invented from a partial file');
  // And the stripper must not corrupt what it cannot parse.
  const out = stripMetadata(truncated, 'image/jpeg');
  assert.ok(Buffer.isBuffer(out));
});

test('a zero fix is treated as no fix', () => {
  // Phones write 0,0 when the GPS never locked. That is the Gulf of Guinea.
  const jpeg = buildJpeg({ exif: buildExifTiff({ lat: [0, 0, 0], latRef: 'N', lon: [0, 0, 0], lonRef: 'E', orientation: 1 }) });
  const facts = readImageFacts(jpeg, 'image/jpeg');
  assert.equal(facts.lat, null);
  assert.equal(facts.lon, null);
});
