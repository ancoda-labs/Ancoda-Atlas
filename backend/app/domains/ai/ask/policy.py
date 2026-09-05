"""What the sandbox will and will not answer.

Two intents are refused outright, and each refusal is a considered position
rather than a limitation:

  safety_advice — this desk does not tell anyone whether to stay or leave. That
  decision belongs to NDRRMA and the police, who can see things Atlas cannot.

  prediction — Atlas reads model output and satellite feeds. It is a monitoring
  aid, not a warning system, and a confident forecast from it would be read as
  one.

  rescue_person — answered from the OPMCM lost/found reports and the NDRRMA
  rescued register already on the desk. Matching is the same fold the rescue
  page uses. Names never enter a model prompt; the template restates hits only.
  Absence is not a death — every answer says so.

Classification is regex over the question rather than a model call, because the
refusal must not depend on a model being available, configured, or in a good
mood.
"""

import re

INTENTS = (
    "figures", "worst_districts", "uncontacted", "gauges", "district",
    "funds", "news", "helplines", "rescued", "nationality",
    # The dashboard's hazards, not just the flood desk's. The box sits on every
    # page now, so a reader on the homepage asking about an earthquake used to
    # fall through to "other" and be answered with flood figures.
    "earthquake", "air_quality", "wildfire", "weather",
    # Climate background (/climate) and landslide wire — in platform scope,
    # but they used to fall through to `other` and get the catch-all refusal.
    "climate", "landslide",
    "rescue_person", "safety_advice", "prediction", "faq", "other",
)

# `other` is the third refusal. The classifier places every question this
# desk answers; anything left over is not a hazard question, and the box says
# so rather than passing it to a model to see what happens. That mattered
# immediately: asked "what is 2+2?" the model answered "4". It was not wrong,
# it was out of scope, and a disaster desk that does arithmetic on request has
# stopped being a disaster desk.
#
# Refusing an unmatched question is the safe direction. The reply lists what
# can be asked, so a hazard question phrased in a way no pattern caught comes
# back rephrasable rather than answered from nowhere.
REFUSAL_INTENTS = ("safety_advice", "prediction", "other")

RESCUE_PERSON = re.compile(
    r"\b(is|was)\s+(my|our)\b.{0,40}\b(on the list|rescued|missing|found|lost)\b"
    r"|\b(brother|sister|mother|father|husband|wife|son|daughter|family|relative)\b.{0,40}"
    r"\b(list|register|rescued|missing|found|lost)\b"
    r"|\b(look\s*up|search|find|check|locate)\b.{0,48}\b(name|list|register|missing|found|lost|rescued)\b"
    # "search for Indra Bahadur" / "find इन्द्रबहादुर थापा"
    r"|\b(look\s*up|search|find|check|locate)\s+(for\s+)?[\w\u0900-\u097f][\w\s.'\-\u0900-\u097f]{1,60}"
    r"|\b(on the )?(missing|lost|found|rescued)[ -]?(list|register|persons?|reports?)\b"
    r"|\blost and found\b|\bmissing[- ]person\b"
    r"|\b(ram|sita|hari)\s+bahadur\b|\bnaama?\s+(khoj|list)"
    r"|हराएको|हराएका|भेटिएका|उद्धार सूची|नाम छ कि|नाम खोज"
    # Devanagari given-name(s) + known surname. Requires a surname so
    # "मृत्यु संख्या कति" never matches.
    r"|[\u0900-\u097f]{2,40}(?:\s+[\u0900-\u097f]{2,40}){0,3}\s+"
    r"(?:थापा|तामाङ|गुरुङ|मगर|श्रेष्ठ|राई|लिम्बू|शेर्पा|यादव|छेत्री|क्षेत्री|"
    r"बस्नेत|अधिकारी|पौडेल|काफ्ले|रिजाल|धिताल|गौतम|नेपाल|प्रधान|महर्जन)"
    # Latin Nepali-style names with a common second element.
    r"|\b[A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+){0,2}\s+"
    r"(?:Bahadur|Bdr|Kumar|Devi|Kumari|Singh|Thapa|Tamang|Gurung|Magar|"
    r"Shrestha|Rai|Limbu|Sherpa|Yadav|Chhetri|Chettri)\b",
    re.I,
)
SAFETY = re.compile(
    r"\b(should|shall|do)\s+(i|we)\b.{0,24}\b(leave|stay|evacuate|go back|return)\b"
    r"|\bis (it|betrawati|rasuwa|the (bridge|road|village)) safe\b"
    r"|\bwalk onto the bridge\b|छोड्ने|जानु हुन्छ|सुरक्षित छ",
    re.I,
)
PREDICT = re.compile(
    r"\bwill (the )?(lake|glacial|glof|river|flood|dam)\b.{0,30}"
    r"\b(burst|break|come|rise|happen|again)\b"
    r"|\b(predict|forecast|tomorrow).{0,20}(flood|burst|glof)\b|फुट्छ|आउँछ कि",
    re.I,
)
WORST = re.compile(
    r"\b(worst|hardest)[ -]hit|\bwhich districts\b|\bmost (deaths|dead|killed)\b|कुन जिल्ला",
    re.I,
)
UNCONTACTED = re.compile(
    r"\buncontacted\b|\bstill missing\b|\bnot (been )?contacted\b|सम्पर्कविहीन", re.I
)
GAUGES = re.compile(
    r"\bgauge\b|\bwater level\b|\briver (level|height)\b|बेत्रावती|betrawati"
    r"|\bphalakhu\b|नदी सतह",
    re.I,
)
FUNDS = re.compile(
    r"\bdonat|\bgive (money|safely)\b|\bqr\b|\brelief fund\b"
    r"|\b(funds?|money|aid|pledges?)\b.{0,24}\b(raised|received|recieved|collected|"
    r"so far|total|how much|amount)\b"
    r"|\b(raised|received|recieved|collected|how much|amount|total)\b.{0,24}"
    r"\b(funds?|money|aid|relief|pledges?|pmdrf|pm fund|nvidia)\b"
    r"|सहयोग|कोष|संकलन|प्राप्त.?रकम",
    re.I,
)
NEWS = re.compile(
    r"\b(news|headline|press|what are (they|outlets) saying)\b|समाचार", re.I
)
HELPLINES = re.compile(
    r"\bwho (to|do i|should i|can i) call\b|\b(helpline|phone number|1234)\b"
    r"|फोन|हेल्पलाइन",
    re.I,
)
# The words between "how many" and the death word matter: "how many have
# died", "how many people were killed". The strict form only ever matched
# "how many died", and everything else fell through to the catch-all — which
# used to answer with the death toll anyway, so the gap stayed invisible until
# the catch-all stopped guessing.
FIGURES = re.compile(
    r"\bhow many\b[\w\s]{0,24}?\b(died|dead|deaths|killed|injured|casualt\w*)\b"
    r"|\bdeath toll\b|\bhow many (casualties|fatalities)\b"
    r"|\bdeaths?\b|\bfatalit(?:y|ies)\b"
    r"|कति मृत्यु|कति जनाको मृत्यु|मृत्यु संख्या|मृत्यु कति|घाइते कति|घाइते संख्या",
    re.I,
)
# Bare flood / this-event questions with no death word. Without this, "how is
# the flood situation" and "Bhotekoshi flood update" fell through to `other`
# and were refused as off-topic — even though the starter chip asks that
# phrasing for deaths, and the desk *is* this flood.
FLOOD = re.compile(
    r"\b(bhotekoshi|bhote[\s-]?koshi|rasuwa\s+flood|this\s+flood)\b"
    r"|\bflood\s+(desk|situation|status|update|toll|response)\b"
    r"|\b(situation|status|update)\s+(of\s+)?(the\s+)?flood\b"
    r"|बाढी|भोटेकोशी",
    re.I,
)
CLIMATE = re.compile(
    r"\b(climate\s+change|global\s+warming|emissions?|co[\s₂2]|carbon\s+dioxide"
    r"|greenhouse|glacial\s+lake|glaciers?|\bglof\b)\b"
    r"|जलवायु|उत्सर्जन|हिमनदी|हिमनदीय\s*ताल",
    re.I,
)
LANDSLIDE = re.compile(
    r"\b(landslides?|mudslides?|debris\s+flows?)\b|पहिरो",
    re.I,
)
# Every alternative carries its own plural. A trailing \b after a bare
# singular is the classic version of this bug: "earthquakes" and "forest fires"
# both failed to match, and the question then fell through to the flood desk's
# death toll — the wrong number, answered confidently.
# How many were rescued, not who. RESCUE_PERSON is tested first and keeps
# "is my brother on the list" out of here.
RESCUED = re.compile(
    r"\bhow many\b.{0,30}\b(rescued|saved|evacuated|airlifted)\b"
    r"|\b(rescue|evacuation) (count|total|numbers?)\b"
    r"|\bhow many people (are|were) rescued\b"
    r"|कति जनाको उद्धार|उद्धार संख्या",
    re.I,
)
# The split between Nepali citizens and foreign nationals, which the register
# and the tourist list both carry.
NATIONALITY = re.compile(
    r"\b(foreign(ers?|ationals?)?|tourists?|nepali(s| citizens)?|nationalit(y|ies))\b"
    r"|विदेशी|पर्यटक|नेपाली नागरिक",
    re.I,
)
EARTHQUAKE = re.compile(
    r"\b(earthquakes?|quakes?|tremors?|aftershocks?|seismic|magnitudes?"
    r"|richter|epicent\w*)\b"
    r"|भूकम्प|पराकम्प|रिक्टर",
    re.I,
)
AIR_QUALITY = re.compile(
    r"\b(air quality|aqi|pm2\.?5|pm10|smog|haze|pollution|breathe)\b"
    r"|वायु गुणस्तर|प्रदूषण|धुवाँ",
    re.I,
)
WILDFIRE = re.compile(
    r"\b(wildfires?|forest fires?|bush ?fires?|firms|burning|hotspots?)\b"
    r"|डढेलो|वन आगलागी",
    re.I,
)
WEATHER = re.compile(
    r"\b(rains?|rainfall|monsoons?|storms?|lightning|hail|heat ?waves?"
    r"|cold ?waves?|droughts?|snow|avalanches?|temperatures?)\b"
    r"|\bweather (alert|warning|advisory)s?\b"
    r"|वर्षा|मनसुन|चट्याङ|असिना|हिमपहिरो|खडेरी|मौसम",
    re.I,
)
DISTRICT = re.compile(
    r"\b(rasuwa|nuwakot|dhading|chitwan|gorkha|tanahun|nawalparasi|syaphrubesi"
    r"|timure|galchhi|devghat|bidur)\b|रसुवा|नुवाकोट|धादिङ|चितवन|बेत्रावती",
    re.I,
)

# Bare hazard nouns that the strict patterns miss ("Death?", "missing?",
# "funds"). Runs only after every strict match and after the three refusals,
# so a well-formed question keeps its better intent and "evacuate?" stays a
# refusal rather than becoming a death-toll answer. Broadest last.
LOOSE: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "figures",
        re.compile(
            r"\b(deaths?|died|dead|killed|fatalit\w*|casualt\w*|injured|injuries|"
            r"toll|victims?)\b|मृत्यु|मृतक|घाइते",
            re.I,
        ),
    ),
    (
        "uncontacted",
        re.compile(
            r"\b(missing|unaccounted|disappeared)\b|बेपत्ता|सम्पर्कविहीन",
            re.I,
        ),
    ),
    (
        "rescued",
        re.compile(
            r"\b(rescue|rescued|evacuees?|airlifted|survivors?)\b|उद्धार",
            re.I,
        ),
    ),
    (
        "nationality",
        re.compile(
            r"\b(foreign(ers?|ationals?)?|tourists?|nepali(s| citizens)?|"
            r"nationalit(y|ies))\b|विदेशी|पर्यटक|नेपाली",
            re.I,
        ),
    ),
    (
        "funds",
        re.compile(
            r"\b(donat\w*|money|funds?|relief|aid)\b|सहयोग|राहत|कोष",
            re.I,
        ),
    ),
    (
        "helplines",
        re.compile(
            r"\b(helpline|phone|call|1234)\b|फोन|हेल्पलाइन",
            re.I,
        ),
    ),
    (
        "gauges",
        re.compile(
            r"\b(gauge|water\s+level|river\s+(level|height)|betrawati|phalakhu)\b"
            r"|बेत्रावती|नदी\s*सतह",
            re.I,
        ),
    ),
    (
        "worst_districts",
        re.compile(
            r"\b(districts?|areas?|worst|affected|damage|displaced)\b"
            r"|जिल्ला|प्रभावित",
            re.I,
        ),
    ),
    (
        "news",
        re.compile(
            r"\b(floods?|flooding|glof|bhotekoshi|landslides?|situation|latest|"
            r"what\s+happened)\b|बाढी|पहिरो|भोटेकोशी",
            re.I,
        ),
    ),
)


def classify_intent(question: str) -> str:
    """Order matters: refusals, then desk figures, then name lookup, then hazards.

    Name lookup must not run before death/uncontacted/rescued patterns — a bare
    Devanagari rule once stole "मृत्यु संख्या कति?" and answered with a register
    search. Figures stay above person search.
    """
    q = (question or "").strip()
    if not q:
        return "other"
    if SAFETY.search(q):
        return "safety_advice"
    if PREDICT.search(q):
        return "prediction"
    if WORST.search(q):
        return "worst_districts"
    if UNCONTACTED.search(q):
        return "uncontacted"
    if FUNDS.search(q):
        return "funds"
    if GAUGES.search(q) and not FIGURES.search(q):
        return "gauges"
    if HELPLINES.search(q):
        return "helplines"
    if NEWS.search(q) and not FIGURES.search(q):
        return "news"
    if RESCUED.search(q):
        return "rescued"
    if NATIONALITY.search(q):
        return "nationality"
    if FIGURES.search(q):
        return "figures"
    # Person/name search after the desk's own figure intents.
    if RESCUE_PERSON.search(q):
        return "rescue_person"
    if CLIMATE.search(q):
        return "climate"
    if FLOOD.search(q):
        return "figures"
    if EARTHQUAKE.search(q):
        return "earthquake"
    if AIR_QUALITY.search(q):
        return "air_quality"
    if WILDFIRE.search(q):
        return "wildfire"
    if WEATHER.search(q):
        return "weather"
    if LANDSLIDE.search(q):
        return "landslide"
    if DISTRICT.search(q):
        return "district"
    for intent, pattern in LOOSE:
        if pattern.search(q):
            return intent
    return "other"


def is_refusal(intent: str) -> bool:
    return intent in REFUSAL_INTENTS
