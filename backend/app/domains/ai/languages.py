"""The languages a flood brief can be written in.

Generated from frontend/src/lib/nepal-languages.ts, which is the registry the
language picker renders from. Two copies of 131 entries would drift; generating
this one means the codes the UI offers are exactly the codes the API accepts.

Nepal's own languages come first, most-spoken first. The rest are alphabetical
by English name.
"""

from typing import NamedTuple


class BriefLanguage(NamedTuple):
    # ISO 639-1 where one exists, otherwise ISO 639-3.
    code: str
    # Endonym, in the script the language is written in.
    native: str
    # English name — also what the model is asked to write in.
    english: str
    region: str


ALL_LANGUAGES: list[BriefLanguage] = [
    BriefLanguage("ne", "नेपाली", "Nepali", "nepal"),
    BriefLanguage("mai", "मैथिली", "Maithili", "nepal"),
    BriefLanguage("bho", "भोजपुरी", "Bhojpuri", "nepal"),
    BriefLanguage("thr", "थारू", "Tharu", "nepal"),
    BriefLanguage("taj", "तामाङ", "Tamang", "nepal"),
    BriefLanguage("new", "नेपाल भाषा", "Newar", "nepal"),
    BriefLanguage("bjj", "बज्जिका", "Bajjika", "nepal"),
    BriefLanguage("mag", "मगर ढुट", "Magar Dhut", "nepal"),
    BriefLanguage("awa", "अवधी", "Awadhi", "nepal"),
    BriefLanguage("dty", "डोटेली", "Doteli", "nepal"),
    BriefLanguage("af", "Afrikaans", "Afrikaans", "world"),
    BriefLanguage("sq", "Shqip", "Albanian", "world"),
    BriefLanguage("am", "አማርኛ", "Amharic", "world"),
    BriefLanguage("ar", "العربية", "Arabic", "world"),
    BriefLanguage("hy", "Հայերեն", "Armenian", "world"),
    BriefLanguage("as", "অসমীয়া", "Assamese", "world"),
    BriefLanguage("ay", "Aymar aru", "Aymara", "world"),
    BriefLanguage("az", "Azərbaycan", "Azerbaijani", "world"),
    BriefLanguage("bm", "Bamanankan", "Bambara", "world"),
    BriefLanguage("eu", "Euskara", "Basque", "world"),
    BriefLanguage("be", "Беларуская", "Belarusian", "world"),
    BriefLanguage("bn", "বাংলা", "Bengali", "world"),
    BriefLanguage("bs", "Bosanski", "Bosnian", "world"),
    BriefLanguage("bg", "Български", "Bulgarian", "world"),
    BriefLanguage("my", "မြန်မာ", "Burmese", "world"),
    BriefLanguage("ca", "Català", "Catalan", "world"),
    BriefLanguage("ceb", "Cebuano", "Cebuano", "world"),
    BriefLanguage("ny", "Chichewa", "Chichewa", "world"),
    BriefLanguage("zh", "简体中文", "Chinese (Simplified)", "world"),
    BriefLanguage("zh-TW", "繁體中文", "Chinese (Traditional)", "world"),
    BriefLanguage("hr", "Hrvatski", "Croatian", "world"),
    BriefLanguage("cs", "Čeština", "Czech", "world"),
    BriefLanguage("da", "Dansk", "Danish", "world"),
    BriefLanguage("dv", "ދިވެހި", "Dhivehi", "world"),
    BriefLanguage("nl", "Nederlands", "Dutch", "world"),
    BriefLanguage("dz", "རྫོང་ཁ", "Dzongkha", "world"),
    BriefLanguage("en", "English", "English", "world"),
    BriefLanguage("eo", "Esperanto", "Esperanto", "world"),
    BriefLanguage("et", "Eesti", "Estonian", "world"),
    BriefLanguage("ee", "Eʋegbe", "Ewe", "world"),
    BriefLanguage("fi", "Suomi", "Finnish", "world"),
    BriefLanguage("fr", "Français", "French", "world"),
    BriefLanguage("fy", "Frysk", "Frisian", "world"),
    BriefLanguage("ff", "Fulfulde", "Fula", "world"),
    BriefLanguage("gl", "Galego", "Galician", "world"),
    BriefLanguage("ka", "ქართული", "Georgian", "world"),
    BriefLanguage("de", "Deutsch", "German", "world"),
    BriefLanguage("el", "Ελληνικά", "Greek", "world"),
    BriefLanguage("gu", "ગુજરાતી", "Gujarati", "world"),
    BriefLanguage("ht", "Kreyòl Ayisyen", "Haitian Creole", "world"),
    BriefLanguage("ha", "Hausa", "Hausa", "world"),
    BriefLanguage("haw", "ʻŌlelo Hawaiʻi", "Hawaiian", "world"),
    BriefLanguage("he", "עברית", "Hebrew", "world"),
    BriefLanguage("hi", "हिन्दी", "Hindi", "world"),
    BriefLanguage("hu", "Magyar", "Hungarian", "world"),
    BriefLanguage("is", "Íslenska", "Icelandic", "world"),
    BriefLanguage("ig", "Igbo", "Igbo", "world"),
    BriefLanguage("id", "Bahasa Indonesia", "Indonesian", "world"),
    BriefLanguage("ga", "Gaeilge", "Irish", "world"),
    BriefLanguage("it", "Italiano", "Italian", "world"),
    BriefLanguage("ja", "日本語", "Japanese", "world"),
    BriefLanguage("jv", "Basa Jawa", "Javanese", "world"),
    BriefLanguage("kn", "ಕನ್ನಡ", "Kannada", "world"),
    BriefLanguage("kk", "Қазақ", "Kazakh", "world"),
    BriefLanguage("km", "ខ្មែរ", "Khmer", "world"),
    BriefLanguage("rw", "Kinyarwanda", "Kinyarwanda", "world"),
    BriefLanguage("ko", "한국어", "Korean", "world"),
    BriefLanguage("ku", "Kurdî", "Kurdish", "world"),
    BriefLanguage("ky", "Кыргызча", "Kyrgyz", "world"),
    BriefLanguage("lo", "ລາວ", "Lao", "world"),
    BriefLanguage("la", "Latina", "Latin", "world"),
    BriefLanguage("lv", "Latviešu", "Latvian", "world"),
    BriefLanguage("lt", "Lietuvių", "Lithuanian", "world"),
    BriefLanguage("lb", "Lëtzebuergesch", "Luxembourgish", "world"),
    BriefLanguage("lg", "Luganda", "Luganda", "world"),
    BriefLanguage("mk", "Македонски", "Macedonian", "world"),
    BriefLanguage("mg", "Malagasy", "Malagasy", "world"),
    BriefLanguage("ms", "Bahasa Melayu", "Malay", "world"),
    BriefLanguage("ml", "മലയാളം", "Malayalam", "world"),
    BriefLanguage("mt", "Malti", "Maltese", "world"),
    BriefLanguage("mi", "Te Reo Māori", "Maori", "world"),
    BriefLanguage("mr", "मराठी", "Marathi", "world"),
    BriefLanguage("mn", "Монгол", "Mongolian", "world"),
    BriefLanguage("no", "Norsk", "Norwegian", "world"),
    BriefLanguage("or", "ଓଡ଼ିଆ", "Odia", "world"),
    BriefLanguage("om", "Afaan Oromoo", "Oromo", "world"),
    BriefLanguage("ps", "پښتو", "Pashto", "world"),
    BriefLanguage("fa", "فارسی", "Persian", "world"),
    BriefLanguage("pl", "Polski", "Polish", "world"),
    BriefLanguage("pt", "Português", "Portuguese", "world"),
    BriefLanguage("pa", "ਪੰਜਾਬੀ", "Punjabi", "world"),
    BriefLanguage("qu", "Runasimi", "Quechua", "world"),
    BriefLanguage("ro", "Română", "Romanian", "world"),
    BriefLanguage("ru", "Русский", "Russian", "world"),
    BriefLanguage("sm", "Gagana Samoa", "Samoan", "world"),
    BriefLanguage("gd", "Gàidhlig", "Scottish Gaelic", "world"),
    BriefLanguage("nso", "Sepedi", "Sepedi", "world"),
    BriefLanguage("sr", "Српски", "Serbian", "world"),
    BriefLanguage("sn", "ChiShona", "Shona", "world"),
    BriefLanguage("sd", "سنڌي", "Sindhi", "world"),
    BriefLanguage("si", "සිංහල", "Sinhala", "world"),
    BriefLanguage("sk", "Slovenčina", "Slovak", "world"),
    BriefLanguage("sl", "Slovenščina", "Slovenian", "world"),
    BriefLanguage("so", "Soomaali", "Somali", "world"),
    BriefLanguage("st", "Sesotho", "Sesotho", "world"),
    BriefLanguage("es", "Español", "Spanish", "world"),
    BriefLanguage("su", "Basa Sunda", "Sundanese", "world"),
    BriefLanguage("sw", "Kiswahili", "Swahili", "world"),
    BriefLanguage("sv", "Svenska", "Swedish", "world"),
    BriefLanguage("tl", "Tagalog", "Tagalog", "world"),
    BriefLanguage("tg", "Тоҷикӣ", "Tajik", "world"),
    BriefLanguage("ta", "தமிழ்", "Tamil", "world"),
    BriefLanguage("te", "తెలుగు", "Telugu", "world"),
    BriefLanguage("th", "ไทย", "Thai", "world"),
    BriefLanguage("bo", "བོད་སྐད", "Tibetan", "world"),
    BriefLanguage("ti", "ትግርኛ", "Tigrinya", "world"),
    BriefLanguage("tn", "Setswana", "Tswana", "world"),
    BriefLanguage("tr", "Türkçe", "Turkish", "world"),
    BriefLanguage("tk", "Türkmen", "Turkmen", "world"),
    BriefLanguage("tw", "Twi", "Twi", "world"),
    BriefLanguage("uk", "Українська", "Ukrainian", "world"),
    BriefLanguage("ur", "اردو", "Urdu", "world"),
    BriefLanguage("ug", "ئۇيغۇرچە", "Uyghur", "world"),
    BriefLanguage("uz", "Oʻzbek", "Uzbek", "world"),
    BriefLanguage("vi", "Tiếng Việt", "Vietnamese", "world"),
    BriefLanguage("cy", "Cymraeg", "Welsh", "world"),
    BriefLanguage("wo", "Wolof", "Wolof", "world"),
    BriefLanguage("xh", "isiXhosa", "Xhosa", "world"),
    BriefLanguage("yi", "ייִדיש", "Yiddish", "world"),
    BriefLanguage("yo", "Yorùbá", "Yoruba", "world"),
    BriefLanguage("zu", "isiZulu", "Zulu", "world"),
]

NEPAL_LANGUAGES = [lang for lang in ALL_LANGUAGES if lang.region == "nepal"]
WORLD_LANGUAGES = [lang for lang in ALL_LANGUAGES if lang.region == "world"]

_BY_CODE = {lang.code: lang for lang in ALL_LANGUAGES}


def find_language(code: str | None) -> BriefLanguage:
    """The requested language, or Nepali.

    Falling back to Nepali rather than English is deliberate: this is a desk
    for people in Nepal, and an unrecognised code is far more likely to be a
    typo than a request for English.
    """
    return _BY_CODE.get(code or "") or ALL_LANGUAGES[0]


def is_wire_language(code: str) -> bool:
    """The two languages the wire itself arrives in.

    With no model configured these are the only possible answers, because the
    extractive fallback reproduces headlines rather than translating them.
    """
    return code in ("ne", "en")
