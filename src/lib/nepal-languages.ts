// The languages this desk can brief in.
//
// Nepal's 2021 census records 124 mother tongues. On a flood page that is not
// trivia: the people downstream of the Bhotekoshi are disproportionately Tamang
// and Tharu speakers, and a relief notice someone cannot read is a notice that
// did not reach them.
//
// Two honest constraints shape this list:
//
//   A model that cannot write a language must not be asked to. Producing
//   confident-sounding Limbu or Bantawa that is actually malformed is worse on
//   a disaster page than answering in Nepali, because a reader cannot tell the
//   difference and may act on it. So each entry carries the script it is
//   written in and how well general-purpose models handle it, and the route
//   degrades to Nepali rather than guessing.
//
//   The extractive fallback cannot translate at all. With no model configured
//   it reproduces headlines verbatim, and those arrive in Nepali or English.
//   Any other language therefore falls back with a visible note rather than
//   silently showing Nepali under a Tharu label.

export type LanguageSupport =
  /** Models write this fluently; briefs are generated directly. */
  | 'strong'
  /** Models manage it, with rough edges. Generated, and labelled as such. */
  | 'partial'
  /** Listed for completeness. Never generated — falls back to Nepali. */
  | 'minimal';

export interface NepalLanguage {
  /** ISO 639-1 where one exists, otherwise ISO 639-3. */
  code: string;
  /** Endonym, in the script the language is written in. */
  native: string;
  /** English name, for the picker's secondary line. */
  english: string;
  script: 'Devanagari' | 'Latin' | 'Perso-Arabic' | 'Ol Chiki' | 'Tibetan' | 'Limbu';
  support: LanguageSupport;
}

// Ordered by how many people in Nepal speak them, most first. The list below is
// the set whose names and scripts are verified; it is deliberately not padded
// out to all 124 census entries with guesses.
export const NEPAL_LANGUAGES: NepalLanguage[] = [
  { code: 'ne',  native: 'नेपाली',        english: 'Nepali',        script: 'Devanagari',   support: 'strong'  },
  { code: 'en',  native: 'English',        english: 'English',       script: 'Latin',        support: 'strong'  },
  { code: 'mai', native: 'मैथिली',         english: 'Maithili',      script: 'Devanagari',   support: 'strong'  },
  { code: 'bho', native: 'भोजपुरी',        english: 'Bhojpuri',      script: 'Devanagari',   support: 'strong'  },
  { code: 'ur',  native: 'اردو',           english: 'Urdu',          script: 'Perso-Arabic', support: 'strong'  },
  { code: 'hi',  native: 'हिन्दी',          english: 'Hindi',         script: 'Devanagari',   support: 'strong'  },
  { code: 'thr', native: 'थारू',           english: 'Tharu',         script: 'Devanagari',   support: 'partial' },
  { code: 'taj', native: 'तामाङ',          english: 'Tamang',        script: 'Devanagari',   support: 'partial' },
  { code: 'new', native: 'नेपाल भाषा',      english: 'Newar',         script: 'Devanagari',   support: 'partial' },
  { code: 'bjj', native: 'बज्जिका',         english: 'Bajjika',       script: 'Devanagari',   support: 'partial' },
  { code: 'mag', native: 'मगर ढुट',        english: 'Magar Dhut',    script: 'Devanagari',   support: 'partial' },
  { code: 'awa', native: 'अवधी',           english: 'Awadhi',        script: 'Devanagari',   support: 'partial' },
  { code: 'dty', native: 'डोटेली',          english: 'Doteli',        script: 'Devanagari',   support: 'partial' },
  { code: 'gvr', native: 'गुरुङ',           english: 'Gurung',        script: 'Devanagari',   support: 'minimal' },
  { code: 'lif', native: 'ᤛᤡᤖᤡᤈᤠᤍᤡ',      english: 'Limbu',         script: 'Limbu',        support: 'minimal' },
  { code: 'bap', native: 'बान्तावा',        english: 'Bantawa',       script: 'Devanagari',   support: 'minimal' },
  { code: 'rjs', native: 'राजबंशी',         english: 'Rajbanshi',     script: 'Devanagari',   support: 'minimal' },
  { code: 'sat', native: 'ᱥᱟᱱᱛᱟᱲᱤ',        english: 'Santali',       script: 'Ol Chiki',     support: 'minimal' },
  { code: 'xsr', native: 'ཤར་པ',           english: 'Sherpa',        script: 'Tibetan',      support: 'minimal' },
  { code: 'the', native: 'चेपाङ',           english: 'Chepang',       script: 'Devanagari',   support: 'minimal' },
  { code: 'dhw', native: 'दनुवार',          english: 'Danuwar',       script: 'Devanagari',   support: 'minimal' },
  { code: 'unr', native: 'मुण्डा',          english: 'Mundari',       script: 'Devanagari',   support: 'minimal' },
];

const BY_CODE = new Map(NEPAL_LANGUAGES.map(l => [l.code, l]));

export function findLanguage(code: string | null | undefined): NepalLanguage {
  return (code && BY_CODE.get(code)) || NEPAL_LANGUAGES[0];
}

/**
 * Can a brief actually be written in this language?
 *
 * 'minimal' languages are offered in the picker so a speaker can see their
 * language acknowledged, but the brief itself comes back in Nepali with a note
 * saying so. Showing them a machine's guess at their language would be worse.
 */
export function canGenerateIn(lang: NepalLanguage): boolean {
  return lang.support !== 'minimal';
}
