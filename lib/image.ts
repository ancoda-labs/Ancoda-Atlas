// Image handling for community flood photos — validate, read, strip.
//
// Three jobs, all done by walking the container format directly rather than by
// pulling in an image library:
//
//   Validate — the declared MIME type of an upload is whatever the sender says
//   it is, so the format is decided from the magic bytes instead.
//
//   Locate — a phone photo usually carries the coordinates it was taken at.
//   Those are far better than the uploader's current position, which is where
//   they are standing now, not where the water was.
//
//   Strip — and then every tag goes. EXIF from a phone carries the device, its
//   serial number in some makes, and the exact position of whoever pressed the
//   shutter. Atlas keeps the one coordinate pair it displays and the
//   orientation it needs to render the photo upright, and discards the rest
//   before the bytes are ever stored.

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageFacts {
  width: number | null;
  height: number | null;
  /** EXIF orientation, 1–8. 1 when absent or unreadable. */
  orientation: number;
  lat: number | null;
  lon: number | null;
  takenAt: Date | null;
}

export const EXTENSION: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Identify the format from its magic bytes, or null if it is not one we take. */
export function sniffType(buf: Buffer): ImageType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ─── EXIF (TIFF IFD) reading ────────────────────────────────────────────────

const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

/** Byte width of each TIFF field type, indexed by the type code. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Offset of the value inside the TIFF block, for both inline and pointed-to values. */
  valueOffset: number;
}

/** Read the entries of one IFD. `tiff` starts at the TIFF header. */
function readIfd(tiff: Buffer, offset: number, le: boolean): IfdEntry[] {
  if (offset < 0 || offset + 2 > tiff.length) return [];
  const count = le ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    if (at + 12 > tiff.length) break;
    const tag = le ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at);
    const type = le ? tiff.readUInt16LE(at + 2) : tiff.readUInt16BE(at + 2);
    const n = le ? tiff.readUInt32LE(at + 4) : tiff.readUInt32BE(at + 4);
    const size = (TYPE_SIZE[type] || 0) * n;
    // Values of four bytes or fewer sit in the entry itself; longer ones live
    // elsewhere in the block and the entry holds their offset.
    const valueOffset = size > 4 ? (le ? tiff.readUInt32LE(at + 8) : tiff.readUInt32BE(at + 8)) : at + 8;
    entries.push({ tag, type, count: n, valueOffset });
  }
  return entries;
}

function readShort(tiff: Buffer, offset: number, le: boolean): number | null {
  if (offset < 0 || offset + 2 > tiff.length) return null;
  return le ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
}

function readLong(tiff: Buffer, offset: number, le: boolean): number | null {
  if (offset < 0 || offset + 4 > tiff.length) return null;
  return le ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
}

/** A TIFF RATIONAL: two longs, numerator over denominator. */
function readRational(tiff: Buffer, offset: number, le: boolean): number | null {
  const num = readLong(tiff, offset, le);
  const den = readLong(tiff, offset + 4, le);
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

function readAscii(tiff: Buffer, entry: IfdEntry): string | null {
  const end = entry.valueOffset + entry.count;
  if (entry.valueOffset < 0 || end > tiff.length) return null;
  return tiff.toString('ascii', entry.valueOffset, end).replace(/\0+$/, '');
}

/** Degrees, minutes and seconds as three rationals → signed decimal degrees. */
function readGpsCoordinate(tiff: Buffer, entry: IfdEntry, ref: string | null, le: boolean): number | null {
  if (entry.count < 3) return null;
  const deg = readRational(tiff, entry.valueOffset, le);
  const min = readRational(tiff, entry.valueOffset + 8, le);
  const sec = readRational(tiff, entry.valueOffset + 16, le);
  if (deg == null || min == null || sec == null) return null;
  const value = deg + min / 60 + sec / 3600;
  if (!Number.isFinite(value)) return null;
  return ref === 'S' || ref === 'W' ? -value : value;
}

/** "YYYY:MM:DD HH:MM:SS" as EXIF writes it. It carries no zone, so it reads as UTC. */
function parseExifDate(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  return Number.isNaN(date.getTime()) ? null : date;
}

interface ExifFacts {
  orientation: number;
  lat: number | null;
  lon: number | null;
  takenAt: Date | null;
}

const NO_EXIF: ExifFacts = { orientation: 1, lat: null, lon: null, takenAt: null };

/** Parse a TIFF block — the payload of an EXIF APP1 segment, past "Exif\0\0". */
function parseTiff(tiff: Buffer): ExifFacts {
  if (tiff.length < 8) return NO_EXIF;
  const order = tiff.toString('ascii', 0, 2);
  if (order !== 'II' && order !== 'MM') return NO_EXIF;
  const le = order === 'II';
  if ((le ? tiff.readUInt16LE(2) : tiff.readUInt16BE(2)) !== 0x002a) return NO_EXIF;

  const ifd0 = readIfd(tiff, le ? tiff.readUInt32LE(4) : tiff.readUInt32BE(4), le);

  let orientation = 1;
  let lat: number | null = null;
  let lon: number | null = null;
  let takenAt: Date | null = null;

  for (const entry of ifd0) {
    if (entry.tag === TAG_ORIENTATION) {
      const value = readShort(tiff, entry.valueOffset, le);
      if (value != null && value >= 1 && value <= 8) orientation = value;
      continue;
    }
    if (entry.tag === TAG_GPS_IFD) {
      const gpsOffset = readLong(tiff, entry.valueOffset, le);
      if (gpsOffset == null) continue;
      const byTag = new Map<number, IfdEntry>();
      for (const e of readIfd(tiff, gpsOffset, le)) byTag.set(e.tag, e);
      const latRefEntry = byTag.get(TAG_GPS_LAT_REF);
      const lonRefEntry = byTag.get(TAG_GPS_LON_REF);
      const latEntry = byTag.get(TAG_GPS_LAT);
      const lonEntry = byTag.get(TAG_GPS_LON);
      if (latEntry) lat = readGpsCoordinate(tiff, latEntry, latRefEntry ? readAscii(tiff, latRefEntry) : null, le);
      if (lonEntry) lon = readGpsCoordinate(tiff, lonEntry, lonRefEntry ? readAscii(tiff, lonRefEntry) : null, le);
      continue;
    }
    if (entry.tag === TAG_EXIF_IFD) {
      const exifOffset = readLong(tiff, entry.valueOffset, le);
      if (exifOffset == null) continue;
      for (const sub of readIfd(tiff, exifOffset, le)) {
        if (sub.tag === TAG_DATETIME_ORIGINAL) takenAt = parseExifDate(readAscii(tiff, sub));
      }
    }
  }

  // 0,0 is what a phone writes when the fix failed. It is in the Gulf of
  // Guinea, not Rasuwa, so treat it as no reading at all.
  if (lat === 0 && lon === 0) return { orientation, lat: null, lon: null, takenAt };
  return { orientation, lat, lon, takenAt };
}

/** Strip the "Exif\0\0" preamble an APP1 segment or a WebP EXIF chunk may carry. */
function tiffFrom(block: Buffer): Buffer {
  return block.toString('ascii', 0, 4) === 'Exif' ? block.subarray(6) : block;
}

// ─── JPEG ───────────────────────────────────────────────────────────────────

const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;
const JPEG_COM = 0xfe;

/** SOFn markers carry the frame dimensions. DHT, JPG and DAC share the range and do not. */
function isSofMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** APPn, where n is 1–15. APP0 is the JFIF header and stays. */
function isStrippableApp(marker: number): boolean {
  return marker >= 0xe1 && marker <= 0xef;
}

interface JpegSegment {
  marker: number;
  /** Offset of the marker itself, at the 0xFF byte. */
  at: number;
  /** Offset of the payload, past the marker and the two length bytes. */
  start: number;
  end: number;
}

/** Walk the marker segments of a JPEG up to the start of scan. */
function jpegSegments(buf: Buffer): { segments: JpegSegment[]; scanStart: number } {
  const segments: JpegSegment[] = [];
  let i = 2; // past SOI
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === JPEG_SOS || marker === JPEG_EOI) return { segments, scanStart: i };
    const length = buf.readUInt16BE(i + 2);
    if (length < 2) break;
    const end = i + 2 + length;
    if (end > buf.length) break;
    segments.push({ marker, at: i, start: i + 4, end });
    i = end;
  }
  return { segments, scanStart: i };
}

function jpegFacts(buf: Buffer): ImageFacts {
  let width: number | null = null;
  let height: number | null = null;
  let exif = NO_EXIF;

  for (const seg of jpegSegments(buf).segments) {
    // SOFn payload: precision(1), height(2), width(2).
    if (isSofMarker(seg.marker) && width == null && seg.start + 5 <= buf.length) {
      height = buf.readUInt16BE(seg.start + 1);
      width = buf.readUInt16BE(seg.start + 3);
      continue;
    }
    if (seg.marker === 0xe1 && buf.toString('ascii', seg.start, seg.start + 4) === 'Exif') {
      exif = parseTiff(tiffFrom(buf.subarray(seg.start, seg.end)));
    }
  }
  return { width, height, ...exif };
}

/** Rebuild the JPEG without APP1–APP15 or comment segments. */
function jpegStrip(buf: Buffer): Buffer {
  const { segments, scanStart } = jpegSegments(buf);
  const parts: Buffer[] = [buf.subarray(0, 2)]; // SOI
  for (const seg of segments) {
    if (isStrippableApp(seg.marker) || seg.marker === JPEG_COM) continue;
    parts.push(buf.subarray(seg.at, seg.end));
  }
  // Everything from the start of scan on is entropy-coded data, copied as is.
  parts.push(buf.subarray(scanStart));
  return Buffer.concat(parts);
}

// ─── PNG ────────────────────────────────────────────────────────────────────

/** The image itself, plus what is needed to render it faithfully. Everything else goes. */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs']);

interface PngChunk {
  type: string;
  start: number;
  end: number;
  dataStart: number;
  dataEnd: number;
}

function pngChunks(buf: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let i = 8; // past the signature
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const dataStart = i + 8;
    const dataEnd = dataStart + length;
    const end = dataEnd + 4; // past the CRC
    if (end > buf.length) break;
    chunks.push({ type, start: i, end, dataStart, dataEnd });
    i = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function pngFacts(buf: Buffer): ImageFacts {
  let width: number | null = null;
  let height: number | null = null;
  let exif = NO_EXIF;
  for (const chunk of pngChunks(buf)) {
    if (chunk.type === 'IHDR' && chunk.dataStart + 8 <= buf.length) {
      width = buf.readUInt32BE(chunk.dataStart);
      height = buf.readUInt32BE(chunk.dataStart + 4);
    } else if (chunk.type === 'eXIf') {
      exif = parseTiff(tiffFrom(buf.subarray(chunk.dataStart, chunk.dataEnd)));
    }
  }
  return { width, height, ...exif };
}

function pngStrip(buf: Buffer): Buffer {
  const parts: Buffer[] = [buf.subarray(0, 8)];
  for (const chunk of pngChunks(buf)) {
    if (!PNG_KEEP.has(chunk.type)) continue;
    parts.push(buf.subarray(chunk.start, chunk.end));
  }
  return Buffer.concat(parts);
}

// ─── WebP ───────────────────────────────────────────────────────────────────

const WEBP_DROP = new Set(['EXIF', 'XMP ']);

interface RiffChunk {
  fourcc: string;
  start: number;
  /** End of the chunk including its pad byte. */
  end: number;
  dataStart: number;
  dataEnd: number;
}

function riffChunks(buf: Buffer): RiffChunk[] {
  const chunks: RiffChunk[] = [];
  let i = 12; // past "RIFF", the size, and "WEBP"
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const dataStart = i + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > buf.length) break;
    const end = dataEnd + (size % 2); // chunks are padded to an even length
    chunks.push({ fourcc, start: i, end, dataStart, dataEnd });
    i = end;
  }
  return chunks;
}

function webpFacts(buf: Buffer): ImageFacts {
  let width: number | null = null;
  let height: number | null = null;
  let exif = NO_EXIF;

  for (const chunk of riffChunks(buf)) {
    const d = chunk.dataStart;
    if (chunk.fourcc === 'VP8X' && d + 10 <= buf.length) {
      // flags(4), then canvas width-1 and height-1 as 24-bit little-endian.
      width = buf.readUIntLE(d + 4, 3) + 1;
      height = buf.readUIntLE(d + 7, 3) + 1;
    } else if (chunk.fourcc === 'VP8 ' && width == null && d + 10 <= buf.length) {
      // 3-byte frame tag, 3-byte start code, then 14-bit width and height.
      width = buf.readUInt16LE(d + 6) & 0x3fff;
      height = buf.readUInt16LE(d + 8) & 0x3fff;
    } else if (chunk.fourcc === 'VP8L' && width == null && d + 5 <= buf.length) {
      // Signature byte, then width-1 and height-1 packed into 14 bits each.
      const bits = buf.readUInt32LE(d + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (chunk.fourcc === 'EXIF') {
      exif = parseTiff(tiffFrom(buf.subarray(chunk.dataStart, chunk.dataEnd)));
    }
  }
  return { width, height, ...exif };
}

function webpStrip(buf: Buffer): Buffer {
  const kept: Buffer[] = [];
  let dropped = false;
  for (const chunk of riffChunks(buf)) {
    if (WEBP_DROP.has(chunk.fourcc)) {
      dropped = true;
      continue;
    }
    kept.push(buf.subarray(chunk.start, chunk.end));
  }
  if (!dropped) return buf;
  const body = Buffer.concat(kept);
  // The RIFF size field covers "WEBP" plus every chunk, so it has to be rewritten.
  const out = Buffer.concat([buf.subarray(0, 12), body]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

// ─── Public surface ─────────────────────────────────────────────────────────

/** Read dimensions, orientation, capture position and capture time. */
export function readImageFacts(buf: Buffer, type: ImageType): ImageFacts {
  try {
    if (type === 'image/jpeg') return jpegFacts(buf);
    if (type === 'image/png') return pngFacts(buf);
    return webpFacts(buf);
  } catch {
    // A malformed container should cost the photo its metadata, not its upload.
    return { width: null, height: null, ...NO_EXIF };
  }
}

/**
 * Is a stripped result still a whole image of the type it started as?
 *
 * Checked structurally rather than by size. An earlier version required the
 * output to clear a fixed byte floor, which quietly returned the ORIGINAL
 * bytes — metadata and all — for any image small enough to fall under it. A
 * rule meant to catch corruption cannot be allowed to fail in the direction of
 * publishing someone's GPS coordinates.
 */
function looksIntact(out: Buffer, type: ImageType): boolean {
  if (sniffType(out) !== type) return false;

  if (type === 'image/jpeg') {
    // Must still end at EOI and still contain a start of scan.
    if (out.readUInt16BE(out.length - 2) !== 0xffd9) return false;
    return jpegSegments(out).scanStart < out.length;
  }

  if (type === 'image/png') {
    const types = pngChunks(out).map(c => c.type);
    return types.includes('IHDR') && types.includes('IDAT') && types.includes('IEND');
  }

  // WebP: the image data chunk has to have survived, and the RIFF size field
  // must describe the buffer we are actually returning.
  const chunks = riffChunks(out);
  if (!chunks.some(c => c.fourcc === 'VP8 ' || c.fourcc === 'VP8L' || c.fourcc === 'VP8X')) return false;
  return out.readUInt32LE(4) === out.length - 8;
}

/**
 * Return the image with every metadata block removed. Falls back to the
 * original bytes only when the rewrite produced something that is no longer a
 * whole image, so a container this walker does not understand is never
 * silently corrupted.
 */
export function stripMetadata(buf: Buffer, type: ImageType): Buffer {
  try {
    const out = type === 'image/jpeg' ? jpegStrip(buf) : type === 'image/png' ? pngStrip(buf) : webpStrip(buf);
    // Stripping only ever removes; anything larger means the walk went wrong.
    if (out.length > buf.length || out.length < 12) return buf;
    return looksIntact(out, type) ? out : buf;
  } catch {
    return buf;
  }
}
