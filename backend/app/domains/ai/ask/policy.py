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
    "funds", "news", "helplines", "rescue_person", "safety_advice",
    "prediction", "faq", "other",
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
HELPLINES = re.compile(r"\b(who to call|helpline|phone number|1234)\b|फोन|हेल्पलाइन", re.I)
FIGURES = re.compile(
    r"\bhow many (died|dead|deaths|killed|injured)\b|\bdeath toll\b|कति मृत्यु", re.I
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
    if FIGURES.search(q):
        return "figures"
    if DISTRICT.search(q):
        return "district"
    return "other"


def is_refusal(intent: str) -> bool:
    return intent in REFUSAL_INTENTS
