// Loose matching for the flood-desk people registers.
//
// Families will not guess the spelling a portal used: Shrestha/Shrest,
// Bahadur/Bdr, Devanagari on one row and romanised on the next. This fold is
// the same idea on every list. It does not translate, merge, or invent a
// person — it only decides whether a query is close enough to show a row that
// already exists.
//
// Queries can carry a bit of intent ("missing ram timure", "rescued 40") so
// the page can open the right list. Those words are stripped before matching
// so they do not hide the name.

export type PersonQueryIntent = 'any' | 'rescued' | 'missing' | 'found';

export interface PersonQuery {
  raw: string;
  /** Folded tokens that must all appear, unless the query was only intent words. */
  tokens: string[];
  intent: PersonQueryIntent;
  age: number | null;
  foreign: boolean;
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'from', 'in', 'at', 'to', 'for', 'and', 'or',
  'year', 'years', 'old', 'yr', 'yrs', 'named', 'name', 'person', 'people',
  'someone', 'called', 'report', 'reported', 'is', 'was', 'who', 'with',
  'को', 'का', 'की', 'मा', 'बाट', 'र', 'जना', 'वर्ष', 'नाम', 'व्यक्ति',
]);

const DEV_LATIN: Array<[string, string]> = [
  ['तामाङ', 'tamang'],
  ['श्रेष्ठ', 'shrestha'],
  ['गुरुङ', 'gurung'],
  ['मगर', 'magar'],
  ['थापा', 'thapa'],
  ['राई', 'rai'],
  ['लिम्बू', 'limbu'],
  ['बहादुर', 'bahadur'],
  ['कुमार', 'kumar'],
];

export function foldName(value: string): string {
  let s = value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  for (const [dev, latin] of DEV_LATIN) s = s.split(dev).join(latin);
  return s
    .replace(/bahadur/g, 'bdr')
    .replace(/chhetr[iy]/g, 'chetri')
    .replace(/kshetr[iy]/g, 'chetri')
    .replace(/sh/g, 's')
    .replace(/ph/g, 'f')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/w/g, 'v')
    .replace(/[^a-z0-9\u0900-\u097f]/g, '');
}

function readAge(raw: string): number | null {
  const m = raw.match(/\b([1-9][0-9]?)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 99 ? n : null;
}

export function parsePersonQuery(raw: string): PersonQuery {
  const text = raw.trim();
  let intent: PersonQueryIntent = 'any';
  if (/\b(missing|lost|uncontacted)\b/i.test(text) || /हरा|बेपत्ता|सम्पर्कविहीन/.test(text)) intent = 'missing';
  else if (/\b(found)\b/i.test(text) || /भेट|फेला/.test(text)) intent = 'found';
  else if (/\b(rescued|rescue|safe|saved)\b/i.test(text) || /उद्धार|सुरक्षित/.test(text)) intent = 'rescued';

  const foreign = /\b(foreign|indian?|china|chinese|korea|korean|foreigner)\b/i.test(text) || /विदेशी|भारतीय/.test(text);
  const age = readAge(text);

  const stripped = text
    .replace(/\b(missing|lost|uncontacted|found|rescued|rescue|safe|saved|foreign|indian?|china|chinese|korea|korean|foreigner|old|years?|yrs?)\b/gi, ' ')
    .replace(/हराएका?|बेपत्ता|सम्पर्कविहीन|भेटिएका?|फेला|उद्धार|सुरक्षित|विदेशी|भारतीय|वर्ष/g, ' ');

  const tokens = stripped
    .split(/\s+/)
    .map(foldName)
    .filter(tok => tok.length > 0 && !STOP.has(tok) && !/^\d{1,2}$/.test(tok));

  return { raw: text, tokens, intent, age, foreign };
}

/**
 * 0 means hide the row. Higher is a closer name/place match.
 * Age is a bonus, never the only reason a row appears unless the query
 * had no name tokens.
 */
export function matchScore(opts: {
  foldedName: string;
  foldedHay: string;
  age: number | null;
  query: PersonQuery;
}): number {
  const { foldedName, foldedHay, age, query } = opts;
  const tokens = query.tokens;

  if (tokens.length === 0) {
    if (query.age != null) {
      if (age == null) return 0;
      if (age === query.age) return 30;
      if (Math.abs(age - query.age) <= 2) return 12;
      return 0;
    }
    return 1;
  }

  for (const tok of tokens) {
    if (!foldedHay.includes(tok)) return 0;
  }

  let score = 40;
  const allInName = tokens.every(tok => foldedName.includes(tok));
  if (allInName) {
    score = 100;
    const glued = tokens.join('');
    if (foldedName.startsWith(glued) || foldedName.includes(glued)) score = 120;
  } else {
    const nameHits = tokens.filter(tok => foldedName.includes(tok)).length;
    score += nameHits * 12;
  }

  if (query.age != null && age != null) {
    if (age === query.age) score += 25;
    else if (Math.abs(age - query.age) <= 2) score += 8;
  }

  return score;
}

export function parseAgeField(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const m = String(value).match(/([1-9][0-9]?)/);
  return m ? Number(m[1]) : null;
}
