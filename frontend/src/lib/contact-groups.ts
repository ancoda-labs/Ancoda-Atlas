import type { BipadContact, BipadDistrictContacts } from '@/types';

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
