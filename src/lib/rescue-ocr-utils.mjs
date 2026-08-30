// Validation and output shaping for OCR-derived rescue registers.
//
// This module stays free of the PDF renderer so routes that only need to serve
// an already-extracted document do not load a native canvas binary.

const DEVA_DIGITS = new Map([
  ['०', '0'], ['१', '1'], ['२', '2'], ['३', '3'], ['४', '4'],
  ['५', '5'], ['६', '6'], ['७', '7'], ['८', '8'], ['९', '9'],
]);

function text(value, max = 500) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean ? clean.slice(0, max) : null;
}

function field(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  return null;
}

function number(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value, 20);
  if (!raw) return null;
  const latin = [...raw].map(char => DEVA_DIGITS.get(char) || char).join('');
  const match = latin.match(/\d{1,3}/);
  return match ? Number(match[0]) : null;
}

function parseJson(textValue) {
  if (typeof textValue !== 'string') return null;
  const unfenced = textValue
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  const objectStart = unfenced.indexOf('{');
  const objectEnd = unfenced.lastIndexOf('}');
  const arrayStart = unfenced.indexOf('[');
  const arrayEnd = unfenced.lastIndexOf(']');
  const candidates = [];
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(unfenced.slice(objectStart, objectEnd + 1));
  }
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    candidates.push(unfenced.slice(arrayStart, arrayEnd + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the other JSON shape before giving up.
    }
  }
  return null;
}

function normalizeNationality(raw, country) {
  const value = text(raw, 80)?.toLowerCase() || '';
  const countryValue = text(country, 100)?.toLowerCase() || '';
  if (value.includes('nepal') || countryValue === 'nepal' || countryValue === 'nepali') {
    return 'nepali';
  }
  if (value.includes('foreign') || (countryValue && countryValue !== 'nepal')) {
    return 'foreign';
  }
  return null;
}

function normalizeRecord(row, pageMin, pageMax) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const name = text(field(row, ['name', 'full_name', 'fullName', 'rescued_individual']), 200);
  if (!name || /^[-–—]+$/.test(name)) return null;

  const rawNationality = text(field(row, ['nationality', 'nationality_type']), 100);
  let country = text(field(row, ['country', 'origin', 'nationality_origin']), 100);
  if (
    !country &&
    rawNationality &&
    !/^(nepal|nepali|foreign|unknown|null|n\/a)$/i.test(rawNationality)
  ) {
    // Some table extractors copy a Country column into `nationality`. Keep the
    // country rather than losing both it and the foreign classification.
    country = rawNationality;
  }
  const ageValue = number(field(row, ['age', 'approximate_age']));
  const pageValue = number(field(row, ['source_page', 'page', 'page_number']));

  return {
    id: '',
    name,
    nationality: normalizeNationality(rawNationality, country),
    country,
    age: ageValue !== null && ageValue >= 0 && ageValue <= 120 ? ageValue : null,
    gender: text(field(row, ['gender', 'sex']), 40),
    passport_or_id: text(field(row, ['passport_or_id', 'passport', 'id_number', 'identity']), 120),
    contact: text(field(row, ['contact', 'contact_no', 'phone', 'phone_number']), 120),
    rescue_location: text(field(row, ['rescue_location', 'rescued_from', 'location']), 200),
    destination_or_hospital: text(
      field(row, ['destination_or_hospital', 'destination', 'hospital', 'taken_to']),
      200,
    ),
    status: text(field(row, ['status', 'condition']), 100),
    rescue_date: text(field(row, ['rescue_date', 'rescued_on', 'date']), 100),
    report_timestamp: text(field(row, ['report_timestamp', 'reported_at', 'timestamp']), 100),
    remarks: text(field(row, ['remarks', 'notes']), 500),
    source_page:
      pageValue !== null && pageValue >= pageMin && pageValue <= pageMax
        ? pageValue
        : null,
    review_status: 'unverified_ocr',
  };
}

/** Parse and normalize the strict JSON requested from one OCR page batch. */
export function parseRescueOcrRecords(rawText, { pageMin = 1, pageMax = 32 } = {}) {
  const parsed = parseJson(rawText);
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray(parsed.records)
      ? parsed.records
      : null;
  if (!rows) throw new Error('OCR response was not a JSON records array');
  return rows.map(row => normalizeRecord(row, pageMin, pageMax)).filter(Boolean);
}

export function summarizeRescueOcrRecords(records) {
  return records.reduce(
    (summary, record) => {
      summary.total += 1;
      if (record.nationality === 'nepali') summary.nepali += 1;
      else if (record.nationality === 'foreign') summary.foreign += 1;
      else summary.unknown += 1;
      return summary;
    },
    { total: 0, nepali: 0, foreign: 0, unknown: 0 },
  );
}

/** Only NDRRMA's document bucket may be fetched by the server-side importer. */
export function assertNdrrmaDocumentUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('document_url_invalid');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'ndrrma.gov.np' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !url.pathname.startsWith('/mediafiles/')
  ) {
    throw new Error('document_url_not_allowed');
  }
  url.hash = '';
  return url;
}

/** Strip identity/contact values before OCR records reach the public desk. */
export function publicRescueOcrDocument(document) {
  if (!document) return null;
  return {
    ...document,
    records: document.records.map(({ passport_or_id: _id, contact: _contact, ...record }) => record),
  };
}

const PUBLIC_COLUMNS = [
  'name',
  'nationality',
  'country',
  'age',
  'gender',
  'rescue_location',
  'destination_or_hospital',
  'status',
  'rescue_date',
  'report_timestamp',
  'remarks',
  'source_page',
  'review_status',
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function rescueOcrCsv(document, { includeSensitive = false } = {}) {
  const columns = includeSensitive
    ? [...PUBLIC_COLUMNS.slice(0, 5), 'passport_or_id', 'contact', ...PUBLIC_COLUMNS.slice(5)]
    : PUBLIC_COLUMNS;
  const rows = document.records.map(record => columns.map(column => csvCell(record[column])).join(','));
  return `${columns.join(',')}\n${rows.join('\n')}\n`;
}
