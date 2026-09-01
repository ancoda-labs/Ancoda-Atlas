import type { BipadContact, BipadDistrictContacts, PortalContact } from '@/types';
import { foldName } from '@/lib/person-search';

/**
 * BIPAD's district register is a dump: the same officer listed five times,
 * ward chairs mixed with CDOs, volunteers in the same pile as the police.
 * The page has to be a directory someone can dial from, so the rows are
 * grouped and a repeated number is shown once.
 *
 * Numbers are not invented here. A dropped duplicate is the same phone the
 * portal already printed; a collapsed ward list is those same rows behind a
 * summary. Atlas still has not rung them.
 */

export type ContactBucket =
  | 'focal'
  | 'dao'
  | 'security'
  | 'municipal'
  | 'officers'
  | 'ward'
  | 'committee'
  | 'volunteer';

export const BUCKET_ORDER: readonly ContactBucket[] = [
  'focal',
  'dao',
  'security',
  'municipal',
  'officers',
  'ward',
  'committee',
  'volunteer',
];

/** These open only when asked — they are long and not the first call. */
export const COLLAPSED_BUCKETS: ReadonlySet<ContactBucket> = new Set([
  'ward',
  'committee',
  'volunteer',
]);

export interface ContactGroup {
  bucket: ContactBucket;
  contacts: BipadContact[];
}

export interface StructuredDistrict {
  id: number;
  slug: string;
  name: string;
  nameNe: string;
  groups: ContactGroup[];
  unique: number;
}

/** Digits a reader can actually dial, or null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('977') && digits.length > 10) digits = digits.slice(3);
  while (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1);
  return digits.length >= 6 ? digits : null;
}

/**
 * A comparison key that also works for 100 / 101 / 1155. `normalizePhone`
 * refuses those because they are shorter than a mobile number, so a second
 * listing of 100 as +977-100 would otherwise survive as a different line.
 */
export function dialKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('977') && digits.length > 3) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  return digits.length >= 3 ? digits : null;
}

function hay(contact: BipadContact): string {
  return `${contact.position || ''} ${contact.name || ''}`.toLowerCase();
}

/**
 * Which shelf a row belongs on.
 *
 * Volunteers stay volunteers. BIPAD's own DRR flag then wins over job title —
 * the computer operator marked as the district focal person is the person
 * to call about this flood. Ward chairs are matched before "Chairman" so they
 * do not land in the municipal pile.
 */
export function classifyBipadContact(contact: BipadContact): ContactBucket {
  const text = hay(contact);
  const role = (contact.position || '').trim().toLowerCase();

  if (/स्वयंसेवक|\bvolunteer\b/.test(text)) return 'volunteer';
  if (contact.drrFocal) return 'focal';
  if (
    /focal person|drr focal|disaster focal|विपद् सम्पर्क|bipad focal|disaster help desk|\bmeoc\b/.test(
      text,
    )
  ) {
    return 'focal';
  }
  if (
    /वडा|ward\s*(chair|president|chairman|no\.?|member)|chair\s*person\s*ward|ward chairman/.test(
      text,
    )
  ) {
    return 'ward';
  }
  if (
    /प्रमुख जिल्ला|chief district|\bcdo\b|assistant (chief )?district|सहायक प्रमुख जिल्ला/.test(
      text,
    )
  ) {
    return 'dao';
  }
  if (
    /प्रहरी|\bpolice\b|सेनानी|\barmy\b|सशस्त्र|fire in-?charge|qrt/.test(text)
  ) {
    return 'security';
  }
  if (
    /committee\s*member|समिति\s*सदस्य|secretary member/.test(text) ||
    /^(member|सदस्य)$/i.test(role)
  ) {
    return 'committee';
  }
  if (
    /mayor|deputy mayor|उप.?मेयर|vice[- ]?chair|chief administrat|\bcao\b|प्रमुख प्रशासकीय|पालिका|rural municipality|executive chief|acting mayor|administration officer/.test(
      text,
    )
  ) {
    return 'municipal';
  }
  // A palika chair often arrives as "Chairman" / "अध्यक्ष" with no ward number.
  if (/^(chairman|chairperson|chair person|अध्यक्ष|उपाध्यक्ष)$/i.test(role)) {
    return 'municipal';
  }
  return 'officers';
}

function score(contact: BipadContact): number {
  return (
    (contact.drrFocal ? 100 : 0) +
    (contact.position?.length ?? 0) +
    (contact.name?.length ?? 0)
  );
}

function nameKey(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Unique labels on one line. English and Nepali of the same officer stay
 * once each; a fifth dump of the same Latin spelling is dropped.
 */
export function mergeContactNames(a: string, b: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const piece of `${a} / ${b}`.split(/\s*\/\s*/)) {
    const trimmed = piece.replace(/\s+/g, ' ').trim();
    const key = nameKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parts.push(trimmed);
  }
  return parts.join(' / ');
}

function richerPosition(a: string | null | undefined, b: string | null | undefined): string | null {
  const left = (a || '').trim();
  const right = (b || '').trim();
  if (!left) return right || null;
  if (!right) return left || null;
  return right.length > left.length ? right : left;
}

/**
 * One row per dialable number.
 *
 * The richer title wins (focal flag, then longer position/name). Two different
 * people on one switchboard keep both names, joined — the number is still one
 * tap. The same person in two scripts is shown once per script, not five times.
 */
export function dedupeBipadContacts(contacts: BipadContact[]): BipadContact[] {
  const byPhone = new Map<string, BipadContact>();
  for (const row of contacts) {
    const key = normalizePhone(row.phone);
    if (!key) continue;
    const held = byPhone.get(key);
    if (!held) {
      byPhone.set(key, row);
      continue;
    }
    const winner = score(row) > score(held) ? row : held;
    const other = winner === row ? held : row;
    byPhone.set(key, {
      ...winner,
      name: mergeContactNames(winner.name || '', other.name || ''),
      position: richerPosition(winner.position, other.position),
      drrFocal: winner.drrFocal || other.drrFocal,
    });
  }
  return [...byPhone.values()];
}

export function districtSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function structureDistrict(district: BipadDistrictContacts): StructuredDistrict {
  const unique = dedupeBipadContacts(district.contacts);
  const buckets = new Map<ContactBucket, BipadContact[]>();
  for (const contact of unique) {
    const bucket = classifyBipadContact(contact);
    const list = buckets.get(bucket) ?? [];
    list.push(contact);
    buckets.set(bucket, list);
  }
  const groups: ContactGroup[] = [];
  for (const bucket of BUCKET_ORDER) {
    const contacts = buckets.get(bucket);
    if (contacts?.length) groups.push({ bucket, contacts });
  }
  return {
    id: district.id,
    slug: districtSlug(district.name),
    name: district.name,
    nameNe: district.nameNe,
    groups,
    unique: unique.length,
  };
}

export function structureDistricts(
  districts: BipadDistrictContacts[],
): StructuredDistrict[] {
  return districts.map(structureDistrict);
}

/**
 * Tokens a contact search must all hit. Same fold as the people register, so
 * "Chaudhary" finds चौधरी and a partial number finds the line.
 */
export function parseContactQuery(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .map(foldName)
    .filter(tok => tok.length > 0);
}

export function foldHay(...parts: Array<string | null | undefined>): string {
  return foldName(parts.filter(Boolean).join(' '));
}

function contactHay(district: StructuredDistrict, contact: BipadContact): string {
  return foldHay(
    district.name,
    district.nameNe,
    contact.name,
    contact.position,
    normalizePhone(contact.phone) || contact.phone,
  );
}

/**
 * Keep a district if its name matches the query, or keep only the rows that
 * do. A district-name hit shows the whole directory — "Rasuwa" should not
 * hide the CDO. A person or number hit shows just those lines, under the
 * district they belong to.
 */
export function filterDirectory(
  districts: StructuredDistrict[],
  query: string,
): StructuredDistrict[] {
  const tokens = parseContactQuery(query);
  if (!tokens.length) return districts;

  const hits: StructuredDistrict[] = [];
  for (const district of districts) {
    const nameHay = foldHay(district.name, district.nameNe);
    if (tokens.every(tok => nameHay.includes(tok))) {
      hits.push(district);
      continue;
    }
    const groups = district.groups
      .map(group => ({
        ...group,
        contacts: group.contacts.filter(contact => {
          const hay = contactHay(district, contact);
          return tokens.every(tok => hay.includes(tok));
        }),
      }))
      .filter(group => group.contacts.length > 0);
    if (!groups.length) continue;
    hits.push({
      ...district,
      groups,
      unique: groups.reduce((n, group) => n + group.contacts.length, 0),
    });
  }
  return hits;
}

/**
 * The OPMCM rescue portal's emergency-contact dump, reshaped the same way as
 * BIPAD: one row per dialable number, shelves a caller would look for, and
 * district lines kept apart from the nationwide 100 / 101 / 102 that already
 * sit at the top of the page.
 */

export type PortalBucket = 'emergency' | 'authority' | 'health' | 'welfare' | 'local';

export const PORTAL_BUCKET_ORDER: readonly PortalBucket[] = [
  'emergency',
  'authority',
  'health',
  'welfare',
  'local',
];

/** Nationwide 100-style lines, and named officers — not the first tap. */
export const COLLAPSED_PORTAL_BUCKETS: ReadonlySet<PortalBucket> = new Set([
  'emergency',
  'welfare',
]);

export interface PortalLine {
  id: string;
  phone: string;
  name: string;
  nameNe: string | null;
  organization: string | null;
  category: string | null;
  district: string | null;
  isNationwide: boolean;
  available24x7: boolean;
}

export interface PortalGroup {
  bucket: PortalBucket;
  contacts: PortalLine[];
}

export interface StructuredPortalDistrict {
  name: string;
  contacts: PortalLine[];
}

export interface StructuredPortal {
  groups: PortalGroup[];
  local: StructuredPortalDistrict[];
  unique: number;
}

const SHORT_EMERGENCY = /^(100|101|102|103|104|1098|1155|1234)$/;

function portalHay(contact: PortalContact): string {
  return `${contact.name || ''} ${contact.nameNe || ''} ${contact.organization || ''} ${contact.category || ''}`.toLowerCase();
}

/**
 * Which shelf a portal row belongs on.
 *
 * A district number stays local even if its category is Police — Rasuwa DPO
 * is not the same call as 100. Short nationwide emergency codes then win over
 * the portal's DISASTER_AUTHORITY dump, so 1234 and 1155 sit with 100 rather
 * than with a named ministry officer.
 */
export function classifyPortalContact(contact: PortalContact): PortalBucket {
  if (!contact.isNationwide) return 'local';
  const cat = (contact.category || '').toUpperCase();
  const phones = contact.phones.map(p => dialKey(p) || p.replace(/\D/g, ''));
  if (phones.some(p => SHORT_EMERGENCY.test(p))) return 'emergency';
  if (cat === 'POLICE' || cat === 'FIRE' || cat === 'AMBULANCE' || cat === 'HELPLINE' || cat === 'HELPLINES') {
    return 'emergency';
  }
  if (cat === 'HOSPITAL' || cat === 'HOSPITALS' || cat === 'HEALTH') return 'health';
  if (cat === 'RED_CROSS' || /red cross|child|women|ncrc|swc|समाज कल्याण|बाल अधिकार|राहत समन्वय/.test(portalHay(contact))) {
    return 'welfare';
  }
  if (cat === 'DISASTER' || cat === 'DISASTER_AUTHORITY' || cat === 'RESCUE' || cat === 'ARMY') {
    return 'authority';
  }
  return 'authority';
}

function portalLineId(contact: PortalContact, phone: string, index: number): string {
  return `${contact.id || contact.name || 'row'}:${normalizePhone(phone) || phone}:${index}`;
}

/**
 * One row per dialable number. A second listing of 100 is dropped; two
 * numbers on NDRRMA stay two taps.
 */
export function flattenPortalContacts(contacts: PortalContact[]): PortalLine[] {
  const seen = new Set<string>();
  const lines: PortalLine[] = [];
  for (const contact of contacts) {
    contact.phones.forEach((phone, index) => {
      const key = dialKey(phone) || normalizePhone(phone) || phone.replace(/\D/g, '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      lines.push({
        id: portalLineId(contact, phone, index),
        phone,
        name: contact.name || contact.organization || '',
        nameNe: contact.nameNe,
        organization: contact.organization,
        category: contact.category,
        district: contact.district,
        isNationwide: contact.isNationwide,
        available24x7: contact.available24x7,
      });
    });
  }
  return lines;
}

function lineAsContact(line: PortalLine): PortalContact {
  return {
    id: line.id,
    name: line.name,
    nameNe: line.nameNe,
    organization: line.organization,
    category: line.category,
    phones: [line.phone],
    email: null,
    description: null,
    descriptionNe: null,
    district: line.district,
    isNationwide: line.isNationwide,
    available24x7: line.available24x7,
  };
}

function districtLabel(raw: string | null): string {
  const name = (raw || '').trim();
  return name || 'Other';
}

export function structurePortalContacts(contacts: PortalContact[]): StructuredPortal {
  const unique = flattenPortalContacts(contacts);
  const buckets = new Map<PortalBucket, PortalLine[]>();
  for (const line of unique) {
    const bucket = classifyPortalContact(lineAsContact(line));
    const list = buckets.get(bucket) ?? [];
    list.push(line);
    buckets.set(bucket, list);
  }

  const groups: PortalGroup[] = [];
  for (const bucket of PORTAL_BUCKET_ORDER) {
    if (bucket === 'local') continue;
    const rows = buckets.get(bucket);
    if (rows?.length) groups.push({ bucket, contacts: rows });
  }

  const byDistrict = new Map<string, PortalLine[]>();
  for (const line of buckets.get('local') ?? []) {
    const key = districtLabel(line.district);
    const list = byDistrict.get(key) ?? [];
    list.push(line);
    byDistrict.set(key, list);
  }
  const local: StructuredPortalDistrict[] = [...byDistrict.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, rows]) => ({ name, contacts: rows }));

  return { groups, local, unique: unique.length };
}

function portalLineHay(line: PortalLine): string {
  return foldHay(
    line.name,
    line.nameNe,
    line.organization,
    line.district,
    line.category,
    dialKey(line.phone) || normalizePhone(line.phone) || line.phone,
  );
}

function filterLines(lines: PortalLine[], tokens: string[]): PortalLine[] {
  return lines.filter(line => {
    const hay = portalLineHay(line);
    return tokens.every(tok => hay.includes(tok));
  });
}

/**
 * Keep a portal group or district if its heading matches, otherwise keep
 * only the rows that do — same rule as the BIPAD directory.
 */
export function filterPortalDirectory(portal: StructuredPortal, query: string): StructuredPortal {
  const tokens = parseContactQuery(query);
  if (!tokens.length) return portal;

  const groups = portal.groups
    .map(group => ({
      ...group,
      contacts: filterLines(group.contacts, tokens),
    }))
    .filter(group => group.contacts.length > 0);

  const local = portal.local.flatMap(district => {
    const nameHay = foldHay(district.name);
    if (tokens.every(tok => nameHay.includes(tok))) return [district];
    const contacts = filterLines(district.contacts, tokens);
    return contacts.length ? [{ ...district, contacts }] : [];
  });

  return {
    groups,
    local,
    unique:
      groups.reduce((n, group) => n + group.contacts.length, 0) +
      local.reduce((n, district) => n + district.contacts.length, 0),
  };
}
