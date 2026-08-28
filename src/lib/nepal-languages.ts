// The languages this desk can brief in.
//
// Two groups, for two different readers.
//
//   Nepal. The people downstream of the Bhotekoshi are disproportionately
//   Tamang, Tharu and Maithili speakers, and a relief notice someone cannot
//   read is a notice that did not reach them.
//
//   The world. Rasuwa is a trekking corridor and a labour-migration source
//   district, so a good share of the people refreshing this page are reading
//   from outside Nepal — relatives abroad, embassies, responding agencies.
//
// Only languages a model can actually write are listed. Nepal's census records
// 124 mother tongues, but general-purpose models do not write most of the
// smaller ones, and confident-sounding malformed Limbu on a page people use to
// decide whether to move is worse than Nepali they can partly read — a reader
// cannot tell the difference. Those languages are therefore absent rather than
// offered and quietly substituted.
//
// Note the remaining constraint: with no model configured nothing can be
// translated at all. The extractive fallback reproduces headlines, and those
// arrive from the outlets only in Nepali and English.

export interface BriefLanguage {
  /** ISO 639-1 where one exists, otherwise ISO 639-3. */
  code: string;
  /** Endonym, in the script the language is written in. */
  native: string;
  /** English name — also what the model is asked to write in. */
  english: string;
  region: 'nepal' | 'world';
}

/** Nepal's languages, most-spoken first. */
const NEPAL: BriefLanguage[] = [
  { code: 'ne',  native: 'नेपाली',      english: 'Nepali',     region: 'nepal' },
  { code: 'mai', native: 'मैथिली',       english: 'Maithili',   region: 'nepal' },
  { code: 'bho', native: 'भोजपुरी',      english: 'Bhojpuri',   region: 'nepal' },
  { code: 'thr', native: 'थारू',         english: 'Tharu',      region: 'nepal' },
  { code: 'taj', native: 'तामाङ',        english: 'Tamang',     region: 'nepal' },
  { code: 'new', native: 'नेपाल भाषा',    english: 'Newar',      region: 'nepal' },
  { code: 'bjj', native: 'बज्जिका',       english: 'Bajjika',    region: 'nepal' },
  { code: 'mag', native: 'मगर ढुट',      english: 'Magar Dhut', region: 'nepal' },
  { code: 'awa', native: 'अवधी',         english: 'Awadhi',     region: 'nepal' },
  { code: 'dty', native: 'डोटेली',        english: 'Doteli',     region: 'nepal' },
];

/** Everything else, alphabetical by English name. */
const WORLD: BriefLanguage[] = [
  { code: 'af',  native: 'Afrikaans',        english: 'Afrikaans',      region: 'world' },
  { code: 'sq',  native: 'Shqip',            english: 'Albanian',       region: 'world' },
  { code: 'am',  native: 'አማርኛ',             english: 'Amharic',        region: 'world' },
  { code: 'ar',  native: 'العربية',            english: 'Arabic',         region: 'world' },
  { code: 'hy',  native: 'Հայերեն',           english: 'Armenian',       region: 'world' },
  { code: 'as',  native: 'অসমীয়া',            english: 'Assamese',       region: 'world' },
  { code: 'ay',  native: 'Aymar aru',        english: 'Aymara',         region: 'world' },
  { code: 'az',  native: 'Azərbaycan',       english: 'Azerbaijani',    region: 'world' },
  { code: 'bm',  native: 'Bamanankan',       english: 'Bambara',        region: 'world' },
  { code: 'eu',  native: 'Euskara',          english: 'Basque',         region: 'world' },
  { code: 'be',  native: 'Беларуская',       english: 'Belarusian',     region: 'world' },
  { code: 'bn',  native: 'বাংলা',              english: 'Bengali',        region: 'world' },
  { code: 'bs',  native: 'Bosanski',         english: 'Bosnian',        region: 'world' },
  { code: 'bg',  native: 'Български',        english: 'Bulgarian',      region: 'world' },
  { code: 'my',  native: 'မြန်မာ',            english: 'Burmese',        region: 'world' },
  { code: 'ca',  native: 'Català',           english: 'Catalan',        region: 'world' },
  { code: 'ceb', native: 'Cebuano',          english: 'Cebuano',        region: 'world' },
  { code: 'ny',  native: 'Chichewa',         english: 'Chichewa',       region: 'world' },
  { code: 'zh',  native: '简体中文',           english: 'Chinese (Simplified)',  region: 'world' },
  { code: 'zh-TW', native: '繁體中文',         english: 'Chinese (Traditional)', region: 'world' },
  { code: 'hr',  native: 'Hrvatski',         english: 'Croatian',       region: 'world' },
  { code: 'cs',  native: 'Čeština',          english: 'Czech',          region: 'world' },
  { code: 'da',  native: 'Dansk',            english: 'Danish',         region: 'world' },
  { code: 'dv',  native: 'ދިވެހި',             english: 'Dhivehi',        region: 'world' },
  { code: 'nl',  native: 'Nederlands',       english: 'Dutch',          region: 'world' },
  { code: 'dz',  native: 'རྫོང་ཁ',             english: 'Dzongkha',       region: 'world' },
  { code: 'en',  native: 'English',          english: 'English',        region: 'world' },
  { code: 'eo',  native: 'Esperanto',        english: 'Esperanto',      region: 'world' },
  { code: 'et',  native: 'Eesti',            english: 'Estonian',       region: 'world' },
  { code: 'ee',  native: 'Eʋegbe',           english: 'Ewe',            region: 'world' },
  { code: 'fi',  native: 'Suomi',            english: 'Finnish',        region: 'world' },
  { code: 'fr',  native: 'Français',         english: 'French',         region: 'world' },
  { code: 'fy',  native: 'Frysk',            english: 'Frisian',        region: 'world' },
  { code: 'ff',  native: 'Fulfulde',         english: 'Fula',           region: 'world' },
  { code: 'gl',  native: 'Galego',           english: 'Galician',       region: 'world' },
  { code: 'ka',  native: 'ქართული',          english: 'Georgian',       region: 'world' },
  { code: 'de',  native: 'Deutsch',          english: 'German',         region: 'world' },
  { code: 'el',  native: 'Ελληνικά',         english: 'Greek',          region: 'world' },
  { code: 'gn',  native: "Avañe'ẽ",          english: 'Guarani',        region: 'world' },
  { code: 'gu',  native: 'ગુજરાતી',           english: 'Gujarati',       region: 'world' },
  { code: 'ht',  native: 'Kreyòl Ayisyen',   english: 'Haitian Creole', region: 'world' },
  { code: 'ha',  native: 'Hausa',            english: 'Hausa',          region: 'world' },
  { code: 'haw', native: 'ʻŌlelo Hawaiʻi',   english: 'Hawaiian',       region: 'world' },
  { code: 'he',  native: 'עברית',            english: 'Hebrew',         region: 'world' },
  { code: 'hi',  native: 'हिन्दी',             english: 'Hindi',          region: 'world' },
  { code: 'hu',  native: 'Magyar',           english: 'Hungarian',      region: 'world' },
  { code: 'is',  native: 'Íslenska',         english: 'Icelandic',      region: 'world' },
  { code: 'ig',  native: 'Igbo',             english: 'Igbo',           region: 'world' },
  { code: 'id',  native: 'Bahasa Indonesia', english: 'Indonesian',     region: 'world' },
  { code: 'ga',  native: 'Gaeilge',          english: 'Irish',          region: 'world' },
  { code: 'it',  native: 'Italiano',         english: 'Italian',        region: 'world' },
  { code: 'ja',  native: '日本語',            english: 'Japanese',       region: 'world' },
  { code: 'jv',  native: 'Basa Jawa',        english: 'Javanese',       region: 'world' },
  { code: 'kn',  native: 'ಕನ್ನಡ',             english: 'Kannada',        region: 'world' },
  { code: 'kk',  native: 'Қазақ',            english: 'Kazakh',         region: 'world' },
  { code: 'km',  native: 'ខ្មែរ',              english: 'Khmer',          region: 'world' },
  { code: 'rw',  native: 'Kinyarwanda',      english: 'Kinyarwanda',    region: 'world' },
  { code: 'ko',  native: '한국어',            english: 'Korean',         region: 'world' },
  { code: 'ku',  native: 'Kurdî',            english: 'Kurdish',        region: 'world' },
  { code: 'ky',  native: 'Кыргызча',         english: 'Kyrgyz',         region: 'world' },
  { code: 'lo',  native: 'ລາວ',              english: 'Lao',            region: 'world' },
  { code: 'la',  native: 'Latina',           english: 'Latin',          region: 'world' },
  { code: 'lv',  native: 'Latviešu',         english: 'Latvian',        region: 'world' },
  { code: 'lt',  native: 'Lietuvių',         english: 'Lithuanian',     region: 'world' },
  { code: 'lb',  native: 'Lëtzebuergesch',   english: 'Luxembourgish',  region: 'world' },
  { code: 'lg',  native: 'Luganda',          english: 'Luganda',        region: 'world' },
  { code: 'mk',  native: 'Македонски',       english: 'Macedonian',     region: 'world' },
  { code: 'mg',  native: 'Malagasy',         english: 'Malagasy',       region: 'world' },
  { code: 'ms',  native: 'Bahasa Melayu',    english: 'Malay',          region: 'world' },
  { code: 'ml',  native: 'മലയാളം',           english: 'Malayalam',      region: 'world' },
  { code: 'mt',  native: 'Malti',            english: 'Maltese',        region: 'world' },
  { code: 'mi',  native: 'Te Reo Māori',     english: 'Maori',          region: 'world' },
  { code: 'mr',  native: 'मराठी',            english: 'Marathi',        region: 'world' },
  { code: 'mn',  native: 'Монгол',           english: 'Mongolian',      region: 'world' },
  { code: 'no',  native: 'Norsk',            english: 'Norwegian',      region: 'world' },
  { code: 'or',  native: 'ଓଡ଼ିଆ',             english: 'Odia',           region: 'world' },
  { code: 'om',  native: 'Afaan Oromoo',     english: 'Oromo',          region: 'world' },
  { code: 'ps',  native: 'پښتو',             english: 'Pashto',         region: 'world' },
  { code: 'fa',  native: 'فارسی',            english: 'Persian',        region: 'world' },
  { code: 'pl',  native: 'Polski',           english: 'Polish',         region: 'world' },
  { code: 'pt',  native: 'Português',        english: 'Portuguese',     region: 'world' },
  { code: 'pa',  native: 'ਪੰਜਾਬੀ',            english: 'Punjabi',        region: 'world' },
  { code: 'qu',  native: 'Runasimi',         english: 'Quechua',        region: 'world' },
  { code: 'ro',  native: 'Română',           english: 'Romanian',       region: 'world' },
  { code: 'ru',  native: 'Русский',          english: 'Russian',        region: 'world' },
  { code: 'sm',  native: 'Gagana Samoa',     english: 'Samoan',         region: 'world' },
  { code: 'gd',  native: 'Gàidhlig',         english: 'Scottish Gaelic', region: 'world' },
  { code: 'nso', native: 'Sepedi',           english: 'Sepedi',         region: 'world' },
  { code: 'sr',  native: 'Српски',           english: 'Serbian',        region: 'world' },
  { code: 'sn',  native: 'ChiShona',         english: 'Shona',          region: 'world' },
  { code: 'sd',  native: 'سنڌي',             english: 'Sindhi',         region: 'world' },
  { code: 'si',  native: 'සිංහල',            english: 'Sinhala',        region: 'world' },
  { code: 'sk',  native: 'Slovenčina',       english: 'Slovak',         region: 'world' },
  { code: 'sl',  native: 'Slovenščina',      english: 'Slovenian',      region: 'world' },
  { code: 'so',  native: 'Soomaali',         english: 'Somali',         region: 'world' },
  { code: 'st',  native: 'Sesotho',          english: 'Sesotho',        region: 'world' },
  { code: 'es',  native: 'Español',          english: 'Spanish',        region: 'world' },
  { code: 'su',  native: 'Basa Sunda',       english: 'Sundanese',      region: 'world' },
  { code: 'sw',  native: 'Kiswahili',        english: 'Swahili',        region: 'world' },
  { code: 'sv',  native: 'Svenska',          english: 'Swedish',        region: 'world' },
  { code: 'tl',  native: 'Tagalog',          english: 'Tagalog',        region: 'world' },
  { code: 'tg',  native: 'Тоҷикӣ',           english: 'Tajik',          region: 'world' },
  { code: 'ta',  native: 'தமிழ்',             english: 'Tamil',          region: 'world' },
  { code: 'te',  native: 'తెలుగు',            english: 'Telugu',         region: 'world' },
  { code: 'th',  native: 'ไทย',              english: 'Thai',           region: 'world' },
  { code: 'bo',  native: 'བོད་སྐད',            english: 'Tibetan',        region: 'world' },
  { code: 'ti',  native: 'ትግርኛ',             english: 'Tigrinya',       region: 'world' },
  { code: 'tn',  native: 'Setswana',         english: 'Tswana',         region: 'world' },
  { code: 'tr',  native: 'Türkçe',           english: 'Turkish',        region: 'world' },
  { code: 'tk',  native: 'Türkmen',          english: 'Turkmen',        region: 'world' },
  { code: 'tw',  native: 'Twi',              english: 'Twi',            region: 'world' },
  { code: 'uk',  native: 'Українська',       english: 'Ukrainian',      region: 'world' },
  { code: 'ur',  native: 'اردو',             english: 'Urdu',           region: 'world' },
  { code: 'ug',  native: 'ئۇيغۇرچە',          english: 'Uyghur',         region: 'world' },
  { code: 'uz',  native: 'Oʻzbek',           english: 'Uzbek',          region: 'world' },
  { code: 'vi',  native: 'Tiếng Việt',       english: 'Vietnamese',     region: 'world' },
  { code: 'cy',  native: 'Cymraeg',          english: 'Welsh',          region: 'world' },
  { code: 'wo',  native: 'Wolof',            english: 'Wolof',          region: 'world' },
  { code: 'xh',  native: 'isiXhosa',         english: 'Xhosa',          region: 'world' },
  { code: 'yi',  native: 'ייִדיש',            english: 'Yiddish',        region: 'world' },
  { code: 'yo',  native: 'Yorùbá',           english: 'Yoruba',         region: 'world' },
  { code: 'zu',  native: 'isiZulu',          english: 'Zulu',           region: 'world' },
];

export const NEPAL_LANGUAGES: BriefLanguage[] = NEPAL;
export const WORLD_LANGUAGES: BriefLanguage[] = WORLD;
export const ALL_LANGUAGES: BriefLanguage[] = [...NEPAL, ...WORLD];

const BY_CODE = new Map(ALL_LANGUAGES.map(l => [l.code, l]));

export function findLanguage(code: string | null | undefined): BriefLanguage {
  return (code && BY_CODE.get(code)) || NEPAL[0];
}

/**
 * The two languages the wire itself arrives in.
 *
 * With no model configured these are the only possible answers, because the
 * extractive fallback reproduces headlines rather than translating them.
 */
export function isWireLanguage(code: string): boolean {
  return code === 'ne' || code === 'en';
}
