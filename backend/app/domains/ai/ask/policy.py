"""What the sandbox will and will not answer.

Three intents are refused outright, and each refusal is a considered position
rather than a limitation:

  rescue_person — the box cannot search names. The registers are partial and
  separate, and absence from one is not a death. Sending someone to the rescue
  page is the honest answer; guessing is not.

  safety_advice — this desk does not tell anyone whether to stay or leave. That
  decision belongs to NDRRMA and the police, who can see things Atlas cannot.

  prediction — Atlas reads model output and satellite feeds. It is a monitoring
  aid, not a warning system, and a confident forecast from it would be read as
  one.

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
    "rescue_person", "safety_advice", "prediction", "faq", "other",
)

REFUSAL_INTENTS = ("rescue_person", "safety_advice", "prediction")

RESCUE_PERSON = re.compile(
    r"\b(is|was)\s+(my|our)\b.{0,40}\b(on the list|rescued|missing|found)\b"
    r"|\b(brother|sister|mother|father|husband|wife|son|daughter|family)\b.{0,30}"
    r"\b(list|register|rescued|missing)\b"
    r"|\b(ram|sita|hari)\s+bahadur\b|\bnaama?\s+(khoj|list)"
    r"|हराएको|उद्धार सूची|नाम छ कि",
    re.I,
)
SAFETY = re.compile(
    r"\b(should we|shall we|do we)\b.{0,24}\b(leave|stay|evacuate|go back|return)\b"
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
FUNDS = re.compile(r"\bdonat|\bgive (money|safely)\b|\bqr\b|\brelief fund\b|सहयोग|कोष", re.I)
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
    r"|कति मृत्यु|कति जनाको मृत्यु",
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


def classify_intent(question: str) -> str:
    """Order matters: the three refusals are tested first, always."""
    q = (question or "").strip()
    if not q:
        return "other"
    if RESCUE_PERSON.search(q):
        return "rescue_person"
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
    # Both sit above FIGURES: "how many people are rescued" contains no death
    # word, so it used to fall through to `other`, whose default tool is
    # get_figures — and the reader was told the death toll instead. Answering
    # a question nobody asked, with a number that reads as if they had, is the
    # worst outcome available on this desk.
    if RESCUED.search(q):
        return "rescued"
    if NATIONALITY.search(q):
        return "nationality"
    if FIGURES.search(q):
        return "figures"
    # Hazard intents sit below the flood desk's own, because this is a flood
    # response desk first: "how many died" means the flood unless the question
    # says otherwise. They sit above `district`, so "earthquake in Rasuwa"
    # answers about the earthquake rather than the district's flood toll.
    if EARTHQUAKE.search(q):
        return "earthquake"
    if AIR_QUALITY.search(q):
        return "air_quality"
    if WILDFIRE.search(q):
        return "wildfire"
    if WEATHER.search(q):
        return "weather"
    if DISTRICT.search(q):
        return "district"
    return "other"


def is_refusal(intent: str) -> bool:
    return intent in REFUSAL_INTENTS
