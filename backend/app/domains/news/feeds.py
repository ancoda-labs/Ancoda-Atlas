"""Feed tables for the Nepali hazard news wire.

Generated from the Node original rather than retyped. The Google News queries
carry Devanagari search terms inside URL-encoded strings, and a single wrong
codepoint would quietly return a different set of stories with nothing to
signal it.
"""

# The national dailies and the Google News queries, per topic.
NEPAL_SOURCES: dict[str, list[dict[str, str]]] = {
    "disaster": [
        {"name": "The Rising Nepal", "url": "https://risingnepaldaily.com/rss"},
        {"name": "Nepal News", "url": "https://www.nepalnews.com/feed/"},
        {"name": "Kathmandu Post", "url": "https://kathmandupost.com/rss"},
        {"name": "Onlinekhabar", "url": "https://www.onlinekhabar.com/feed"},
        {"name": "Ratopati", "url": "https://www.ratopati.com/feed"},
        {"name": "Nagarik News", "url": "https://nagariknews.nagariknetwork.com/feed"},
        {"name": "Setopati", "url": "https://www.setopati.com/feed"},
        {"name": "Himal Khabar", "url": "https://www.himalkhabar.com/feed"},
        {"name": "Onlinekhabar English", "url": "https://english.onlinekhabar.com/feed"},
        {"name": "Google Nepal Disaster", "url": "https://news.google.com/rss/search?q=(Nepal%20earthquake%20OR%20landslide%20Nepal%20OR%20flood%20Nepal%20OR%20monsoon%20Nepal%20OR%20avalanche%20Nepal%20OR%20%22disaster%20Nepal%22%20OR%20NDRRMA)%20when%3A7d&hl=en-US&gl=US&ceid=US:en"},
        {"name": "Google Nepal Disaster Nepali", "url": "https://news.google.com/rss/search?q=(%E0%A4%B5%E0%A4%BF%E0%A4%AA%E0%A4%A6%E0%A5%8D%20OR%20%E0%A4%AD%E0%A5%82%E0%A4%95%E0%A4%AE%E0%A5%8D%E0%A4%AA%20OR%20%E0%A4%AA%E0%A4%B9%E0%A4%BF%E0%A4%B0%E0%A5%8B%20OR%20%E0%A4%AC%E0%A4%BE%E0%A4%A2%E0%A5%80%20OR%20%E0%A4%89%E0%A4%A6%E0%A5%8D%E0%A4%A7%E0%A4%BE%E0%A4%B0%20OR%20%E0%A4%B0%E0%A4%BE%E0%A4%B9%E0%A4%A4)%20%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%20when%3A7d&hl=ne&gl=NP&ceid=NP:ne"},
    ],
    "earthquake": [
        {"name": "Kathmandu Post", "url": "https://kathmandupost.com/rss"},
        {"name": "Google Nepal Earthquake", "url": "https://news.google.com/rss/search?q=(Nepal%20earthquake%20OR%20Nepal%20quake%20OR%20aftershock%20Nepal%20OR%20%22National%20Seismological%20Centre%22%20Nepal%20OR%20tremor%20Kathmandu)%20when%3A14d&hl=en-US&gl=US&ceid=US:en"},
        {"name": "Google Nepal Earthquake Nepali", "url": "https://news.google.com/rss/search?q=(%E0%A4%AD%E0%A5%82%E0%A4%95%E0%A4%AE%E0%A5%8D%E0%A4%AA%20OR%20%E0%A4%AA%E0%A4%B0%E0%A4%BE%E0%A4%95%E0%A4%AE%E0%A5%8D%E0%A4%AA%20OR%20%E0%A4%AD%E0%A5%82%E0%A4%95%E0%A4%AE%E0%A5%8D%E0%A4%AA%E0%A5%80%E0%A4%AF)%20%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%20when%3A14d&hl=ne&gl=NP&ceid=NP:ne"},
    ],
    "flood": [
        {"name": "The Rising Nepal", "url": "https://risingnepaldaily.com/rss"},
        {"name": "Onlinekhabar", "url": "https://www.onlinekhabar.com/feed"},
        {"name": "Ratopati", "url": "https://www.ratopati.com/feed"},
        {"name": "Nagarik News", "url": "https://nagariknews.nagariknetwork.com/feed"},
        {"name": "Setopati", "url": "https://www.setopati.com/feed"},
        {"name": "Himal Khabar", "url": "https://www.himalkhabar.com/feed"},
        {"name": "Onlinekhabar English", "url": "https://english.onlinekhabar.com/feed"},
        {"name": "Kantipur", "url": "https://news.google.com/rss/search?q=site%3Aekantipur.com%20(%E0%A4%AC%E0%A4%BE%E0%A4%A2%E0%A5%80%20OR%20%E0%A4%AA%E0%A4%B9%E0%A4%BF%E0%A4%B0%E0%A5%8B%20OR%20%E0%A4%B0%E0%A4%B8%E0%A5%81%E0%A4%B5%E0%A4%BE%20OR%20%E0%A4%AD%E0%A5%8B%E0%A4%9F%E0%A5%87%E0%A4%95%E0%A5%8B%E0%A4%B6%E0%A5%80%20OR%20%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A4%BF%E0%A4%B6%E0%A5%82%E0%A4%B2%E0%A5%80)%20when%3A14d&hl=ne&gl=NP&ceid=NP:ne"},
        {"name": "Google Nepal Flood", "url": "https://news.google.com/rss/search?q=(flood%20Nepal%20OR%20landslide%20Nepal%20OR%20inundation%20Terai%20OR%20%22Koshi%20river%22%20OR%20%22Karnali%20river%22%20OR%20embankment%20Nepal%20OR%20flash%20flood%20Nepal)%20when%3A14d&hl=en-US&gl=US&ceid=US:en"},
        {"name": "Google Nepal Flood Nepali", "url": "https://news.google.com/rss/search?q=(%E0%A4%AC%E0%A4%BE%E0%A4%A2%E0%A5%80%20OR%20%E0%A4%AA%E0%A4%B9%E0%A4%BF%E0%A4%B0%E0%A5%8B%20OR%20%E0%A4%A1%E0%A5%81%E0%A4%AC%E0%A4%BE%E0%A4%A8%20OR%20%E0%A4%95%E0%A4%9F%E0%A4%BE%E0%A4%A8%20OR%20%E0%A4%A4%E0%A4%9F%E0%A4%AC%E0%A4%A8%E0%A5%8D%E0%A4%A7)%20%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%20when%3A14d&hl=ne&gl=NP&ceid=NP:ne"},
    ],
    "weather": [
        {"name": "Kathmandu Post", "url": "https://kathmandupost.com/rss"},
        {"name": "Google Nepal Weather", "url": "https://news.google.com/rss/search?q=(%22Department%20of%20Hydrology%20and%20Meteorology%22%20OR%20DHM%20Nepal%20OR%20weather%20warning%20Nepal%20OR%20heavy%20rainfall%20Nepal%20OR%20cold%20wave%20Nepal%20OR%20heat%20wave%20Nepal%20OR%20hailstorm%20Nepal%20OR%20lightning%20Nepal)%20when%3A14d&hl=en-US&gl=US&ceid=US:en"},
        {"name": "Google Nepal Weather Nepali", "url": "https://news.google.com/rss/search?q=(%E0%A4%AE%E0%A5%8C%E0%A4%B8%E0%A4%AE%20OR%20%E0%A4%B5%E0%A4%B0%E0%A5%8D%E0%A4%B7%E0%A4%BE%20OR%20%E0%A4%AE%E0%A4%A8%E0%A4%B8%E0%A5%81%E0%A4%A8%20OR%20%E0%A4%B6%E0%A5%80%E0%A4%A4%E0%A4%B2%E0%A4%B9%E0%A4%B0%20OR%20%E0%A4%85%E0%A4%B8%E0%A4%BF%E0%A4%A8%E0%A4%BE%20OR%20%E0%A4%9A%E0%A4%9F%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%99)%20%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%20when%3A14d&hl=ne&gl=NP&ceid=NP:ne"},
    ],
    "wildfire": [
        {"name": "Google Nepal Wildfire", "url": "https://news.google.com/rss/search?q=(%22forest%20fire%22%20Nepal%20OR%20wildfire%20Nepal%20OR%20%22Department%20of%20Forests%22%20Nepal%20fire%20OR%20bushfire%20Nepal)%20when%3A21d&hl=en-US&gl=US&ceid=US:en"},
        {"name": "Google Nepal Wildfire Nepali", "url": "https://news.google.com/rss/search?q=(%E0%A4%A1%E0%A4%A2%E0%A5%87%E0%A4%B2%E0%A5%8B%20OR%20%E0%A4%B5%E0%A4%A8%20%E0%A4%86%E0%A4%97%E0%A4%B2%E0%A4%BE%E0%A4%97%E0%A5%80%20OR%20%E0%A4%86%E0%A4%97%E0%A4%B2%E0%A4%BE%E0%A4%97%E0%A5%80)%20%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%20when%3A21d&hl=ne&gl=NP&ceid=NP:ne"},
    ],
    "airquality": [
        {"name": "Kathmandu Post", "url": "https://kathmandupost.com/rss"},
        {"name": "Google Nepal Air Quality", "url": "https://news.google.com/rss/search?q=(%22air%20quality%22%20Kathmandu%20OR%20AQI%20Nepal%20OR%20%22air%20pollution%22%20Nepal%20OR%20smog%20Kathmandu%20OR%20haze%20Nepal%20OR%20PM2.5%20Nepal)%20when%3A21d&hl=en-US&gl=US&ceid=US:en"},
        {"name": "Google Nepal Air Quality Nepali", "url": "https://news.google.com/rss/search?q=(%E0%A4%B5%E0%A4%BE%E0%A4%AF%E0%A5%81%20%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%A6%E0%A5%82%E0%A4%B7%E0%A4%A3%20OR%20%E0%A4%B5%E0%A4%BE%E0%A4%AF%E0%A5%81%20%E0%A4%97%E0%A5%81%E0%A4%A3%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A4%B0%20OR%20%E0%A4%A7%E0%A5%81%E0%A4%B5%E0%A4%BE%E0%A4%81%20OR%20%E0%A4%A4%E0%A5%81%E0%A4%B8%E0%A4%BE%E0%A4%B0%E0%A5%8B)%20%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%20when%3A21d&hl=ne&gl=NP&ceid=NP:ne"},
    ],
    "climate": [
        # Local dailies often carry enclosure/og images; Google RSS usually does not.
        # Hazard + climate gates still drop non-climate stories.
        {"name": "Kathmandu Post", "url": "https://kathmandupost.com/rss"},
        {"name": "Onlinekhabar English", "url": "https://english.onlinekhabar.com/feed"},
        {"name": "The Rising Nepal", "url": "https://risingnepaldaily.com/rss"},
        {"name": "Himal Khabar", "url": "https://www.himalkhabar.com/feed"},
        {"name": "Google Nepal Climate Hazard", "url": "https://news.google.com/rss/search?q=(glacier%20Nepal%20OR%20%22glacial%20lake%22%20Nepal%20OR%20GLOF%20Nepal%20OR%20ICIMOD%20OR%20snowmelt%20Nepal%20OR%20drought%20Nepal%20OR%20%22climate%20risk%22%20Nepal)%20when%3A30d&hl=en-US&gl=US&ceid=US:en"},
        {"name": "Google Nepal Climate Nepali", "url": "https://news.google.com/rss/search?q=(%E0%A4%B9%E0%A4%BF%E0%A4%AE%E0%A4%A4%E0%A4%BE%E0%A4%B2%20OR%20%E0%A4%B9%E0%A4%BF%E0%A4%AE%E0%A4%A8%E0%A4%A6%E0%A5%80%20OR%20%E0%A4%9C%E0%A4%B2%E0%A4%B5%E0%A4%BE%E0%A4%AF%E0%A5%81%20OR%20%E0%A4%96%E0%A4%A1%E0%A5%87%E0%A4%B0%E0%A5%80)%20%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%20when%3A30d&hl=ne&gl=NP&ceid=NP:ne"},
    ],
    "relief": [
        {"name": "Nepal News", "url": "https://www.nepalnews.com/feed/"},
        {"name": "Onlinekhabar", "url": "https://www.onlinekhabar.com/feed"},
        {"name": "Ratopati", "url": "https://www.ratopati.com/feed"},
        {"name": "Nagarik News", "url": "https://nagariknews.nagariknetwork.com/feed"},
        {"name": "Setopati", "url": "https://www.setopati.com/feed"},
        {"name": "Himal Khabar", "url": "https://www.himalkhabar.com/feed"},
        {"name": "Onlinekhabar English", "url": "https://english.onlinekhabar.com/feed"},
        {"name": "Google Nepal Relief", "url": "https://news.google.com/rss/search?q=(NDRRMA%20OR%20%22disaster%20relief%22%20Nepal%20OR%20%22Nepal%20Red%20Cross%22%20OR%20rescue%20operation%20Nepal%20OR%20displaced%20Nepal%20OR%20relief%20distribution%20Nepal%20OR%20evacuation%20Nepal)%20when%3A14d&hl=en-US&gl=US&ceid=US:en"},
        {"name": "Google Nepal Relief Nepali", "url": "https://news.google.com/rss/search?q=(%E0%A4%89%E0%A4%A6%E0%A5%8D%E0%A4%A7%E0%A4%BE%E0%A4%B0%20OR%20%E0%A4%B0%E0%A4%BE%E0%A4%B9%E0%A4%A4%20OR%20%E0%A4%B5%E0%A4%BF%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A4%BE%E0%A4%AA%E0%A4%BF%E0%A4%A4%20OR%20%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%A4%E0%A4%BF%E0%A4%AA%E0%A5%82%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A4%BF%20OR%20%E0%A4%B5%E0%A4%BF%E0%A4%AA%E0%A4%A6%E0%A5%8D%20%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A4%BE%E0%A4%AA%E0%A4%A8)%20%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2%20when%3A14d&hl=ne&gl=NP&ceid=NP:ne"},
    ],
}

# The global hazard gate. An item must name a natural hazard, its impact, or the
# response to it — for every topic, including 'all'. A Nepali daily's RSS feed
# carries its whole newsroom, and Google News queries leak adjacent stories, so
# relevance is enforced here rather than trusted from the feed.
HAZARD_GATE_TERMS: list[str] = [
    "earthquake",
    "quake",
    "aftershock",
    "tremor",
    "seismic",
    "epicentre",
    "epicenter",
    "landslide",
    "mudslide",
    "rockfall",
    "avalanche",
    "debris flow",
    "flood",
    "inundat",
    "glof",
    "glacial lake",
    "embankment",
    "washed away",
    "swollen",
    "waterlogg",
    "monsoon",
    "rainfall",
    "heavy rain",
    "downpour",
    "cloudburst",
    "storm",
    "hailstorm",
    "thunderstorm",
    "lightning",
    "cold wave",
    "heat wave",
    "heatwave",
    "snowfall",
    "blizzard",
    "drought",
    "glacier",
    "snowmelt",
    "wildfire",
    "forest fire",
    "bushfire",
    "fire season",
    "air quality",
    "aqi",
    "pm2.5",
    "smog",
    "haze",
    "air pollution",
    "disaster",
    "calamity",
    "hazard",
    "evacuat",
    "rescue",
    "relief",
    "displaced",
    "casualt",
    "missing",
    "shelter",
    "ndrrma",
    "red cross",
    "dhm",
    "icimod",
    "preparedness",
    "early warning",
    "weather warning",
    "भूकम्प",
    "पराकम्प",
    "पहिरो",
    "बाढी",
    "डुबान",
    "हिमपहिरो",
    "हिमताल",
    "हिमनदी",
    "वर्षा",
    "मनसुन",
    "असिना",
    "चट्याङ",
    "आगलागी",
    "डढेलो",
    "खडेरी",
    "मौसम",
    "विपद्",
    "उद्धार",
    "राहत",
    "विस्थापित",
    "क्षति",
    "बेपत्ता",
    "शीतलहर",
    "प्रदूषण",
]

NEPAL_CONTEXT_TERMS: list[str] = [
    "nepal",
    "nepali",
    "kathmandu",
    "pokhara",
    "biratnagar",
    "lumbini",
    "terai",
    "koshi",
    "karnali",
    "gandaki",
    "bagmati",
    "madhesh",
    "sudurpashchim",
    "नेपाल",
    "नेपाली",
    "काठमाडौँ",
    "पोखरा",
]

LOCAL_SOURCE_HINTS: list[str] = [
    "kathmandu post",
    "onlinekhabar",
    "nepal news",
    "the rising nepal",
    "setopati",
    "ratopati",
    "khabarhub",
    "nepali times",
]

# Per-topic relevance. `wildfire` deliberately excludes bare 'fire': it matches
# building and vehicle fires, which are not natural hazards.
TOPIC_RELEVANCE_RULES: dict[str, dict] = {
    "disaster": {
        "include": ["disaster", "earthquake", "landslide", "flood", "monsoon", "avalanche", "rescue", "relief", "ndrrma", "emergency", "विपद्", "भूकम्प", "पहिरो", "बाढी", "उद्धार"],
        "minScore": 8,
    },
    "earthquake": {
        "include": ["earthquake", "quake", "aftershock", "tremor", "seismic", "epicentre", "epicenter", "magnitude", "भूकम्प", "पराकम्प"],
        "minScore": 8,
    },
    "flood": {
        "include": ["flood", "landslide", "inundation", "inundated", "embankment", "river", "washed away", "swollen", "debris", "बाढी", "पहिरो", "डुबान", "कटान"],
        "minScore": 8,
    },
    "weather": {
        "include": ["weather", "rainfall", "rain", "monsoon", "storm", "hailstorm", "lightning", "cold wave", "heat wave", "snowfall", "dhm", "forecast", "मौसम", "वर्षा", "मनसुन", "शीतलहर", "असिना", "चट्याङ"],
        "minScore": 8,
    },
    "wildfire": {
        "include": ["wildfire", "forest fire", "bush fire", "bushfire", "grassland fire", "fire season", "डढेलो", "वन आगलागी"],
        "minScore": 8,
    },
    "airquality": {
        "include": ["air quality", "aqi", "air pollution", "pm2.5", "smog", "haze", "pollution", "प्रदूषण", "धुवाँ"],
        "minScore": 8,
    },
    "climate": {
        "include": ["glacier", "glacial lake", "glof", "icimod", "snowmelt", "drought", "climate", "हिमताल", "हिमनदी", "जलवायु", "खडेरी"],
        "minScore": 8,
    },
    "relief": {
        "include": ["relief", "rescue", "ndrrma", "red cross", "displaced", "evacuation", "shelter", "compensation", "aid", "उद्धार", "राहत", "विस्थापित", "क्षतिपूर्ति"],
        "minScore": 8,
    },
}

# Every topic falls back to the broad disaster feed rather than to general news.
TOPIC_FALLBACKS: dict[str, list[str]] = {"earthquake": ["disaster"], "flood": ["disaster", "weather"], "weather": ["disaster"], "wildfire": ["disaster", "airquality"], "airquality": ["wildfire", "disaster"], "climate": ["weather", "disaster"], "relief": ["disaster"]}

TOPIC_MIN_ITEMS: dict[str, int] = {"disaster": 16, "earthquake": 8, "flood": 12, "weather": 12, "wildfire": 8, "airquality": 8, "climate": 8, "relief": 10}
