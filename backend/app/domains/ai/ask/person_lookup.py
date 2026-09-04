"""Search the flood desk's people registers for Ask Atlas.

Mirrors `frontend/src/lib/person-search.ts` so a name that matches on
/bhotekoshi-flood/rescue matches here. Matching is fold-and-score only —
nothing invents, merges, or translates a person.

The full registers never enter a model prompt. This module returns a short,
capped list of hits the template can restate, plus the caveats the rescue
page already prints: reports are not people, lists are partial and separate,
absence is not a death.
"""

from __future__ import annotations

import re
from typing import Any, Literal

PersonIntent = Literal["any", "rescued", "missing", "found"]

STOP = {
    "the",
    "a",
    "an",
    "of",
    "from",
    "in",
    "at",
    "to",
    "for",
    "and",
    "or",
    "year",
    "years",
    "old",
    "yr",
    "yrs",
    "named",
    "name",
    "person",
    "people",
    "someone",
    "called",
    "report",
    "reported",
    "reports",
    "is",
    "was",
    "who",
    "with",
    "my",
    "our",
    "brother",
    "sister",
    "mother",
    "father",
    "husband",
    "wife",
    "son",
    "daughter",
    "family",
    "relative",
    "list",
    "register",
    "lookup",
    "look",
    "search",
    "find",
    "check",
    "please",
    "को",
    "का",
    "की",
    "मा",
    "बाट",
    "र",
    "जना",
    "वर्ष",
    "नाम",
    "व्यक्ति",
}

DEV_LATIN: tuple[tuple[str, str], ...] = (
    ("तामाङ", "tamang"),
    ("श्रेष्ठ", "shrestha"),
    ("गुरुङ", "gurung"),
    ("मगर", "magar"),
    ("थापा", "thapa"),
    ("राई", "rai"),
    ("लिम्बू", "limbu"),
    ("बहादुर", "bahadur"),
    ("कुमार", "kumar"),
)

MAX_HITS_PER_LIST = 4
MAX_HITS_TOTAL = 8


def fold_name(value: str) -> str:
    s = (value or "").lower()
    # NFKD strip accents — same idea as the browser fold.
    import unicodedata

    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    for dev, latin in DEV_LATIN:
        s = s.replace(dev, latin)
    s = (
        s.replace("bahadur", "bdr")
        .replace("chhetri", "chetri")
        .replace("chhetry", "chetri")
        .replace("kshetri", "chetri")
        .replace("kshetry", "chetri")
        .replace("sh", "s")
        .replace("ph", "f")
        .replace("aa", "a")
        .replace("ee", "i")
        .replace("oo", "u")
        .replace("w", "v")
    )
    return re.sub(r"[^a-z0-9\u0900-\u097f]", "", s)


def _read_age(raw: str) -> int | None:
    m = re.search(r"\b([1-9][0-9]?)\b", raw)
    if not m:
        return None
    n = int(m.group(1))
    return n if 1 <= n <= 99 else None


def parse_age_field(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        n = int(value)
        return n if 1 <= n <= 99 else None
    m = re.search(r"([1-9][0-9]?)", str(value))
    return int(m.group(1)) if m else None


def parse_person_query(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    intent: PersonIntent = "any"
    if re.search(r"\b(missing|lost|uncontacted)\b", text, re.I) or re.search(
        r"हरा|बेपत्ता|सम्पर्कविहीन", text
    ):
        intent = "missing"
    elif re.search(r"\b(found)\b", text, re.I) or re.search(r"भेट|फेला", text):
        intent = "found"
    elif re.search(r"\b(rescued|rescue|safe|saved)\b", text, re.I) or re.search(
        r"उद्धार|सुरक्षित", text
    ):
        intent = "rescued"

    foreign = bool(
        re.search(
            r"\b(foreign|indian?|china|chinese|korea|korean|foreigner)\b",
            text,
            re.I,
        )
        or re.search(r"विदेशी|भारतीय", text)
    )
    age = _read_age(text)

    stripped = re.sub(
        r"\b(missing|lost|uncontacted|found|rescued|rescue|safe|saved|foreign|"
        r"indian?|china|chinese|korea|korean|foreigner|old|years?|yrs?|"
        r"brother|sister|mother|father|husband|wife|son|daughter|family|"
        r"relative|list|register|lookup|search|find|check|look\s*up|"
        r"on|the|is|was|my|our|please)\b",
        " ",
        text,
        flags=re.I,
    )
    stripped = re.sub(
        r"हराएका?|बेपत्ता|सम्पर्कविहीन|भेटिएका?|फेला|उद्धार|सुरक्षित|विदेशी|"
        r"भारतीय|वर्ष|नाम\s*छ\s*कि|खोज",
        " ",
        stripped,
    )

    tokens = [
        tok
        for tok in (fold_name(part) for part in stripped.split())
        if tok and tok not in STOP and not re.fullmatch(r"\d{1,2}", tok)
    ]
    return {"raw": text, "tokens": tokens, "intent": intent, "age": age, "foreign": foreign}


def match_score(
    *,
    folded_name: str,
    folded_hay: str,
    age: int | None,
    query: dict[str, Any],
) -> int:
    tokens: list[str] = query["tokens"]
    if not tokens:
        if query.get("age") is not None:
            if age is None:
                return 0
            if age == query["age"]:
                return 30
            if abs(age - query["age"]) <= 2:
                return 12
            return 0
        return 0

    for tok in tokens:
        if tok not in folded_hay:
            return 0

    score = 40
    if all(tok in folded_name for tok in tokens):
        score = 100
        glued = "".join(tokens)
        if folded_name.startswith(glued) or glued in folded_name:
            score = 120
    else:
        score += sum(12 for tok in tokens if tok in folded_name)

    if query.get("age") is not None and age is not None:
        if age == query["age"]:
            score += 25
        elif abs(age - query["age"]) <= 2:
            score += 8
    return score


def _rank(
    rows: list[dict[str, Any]],
    query: dict[str, Any],
    *,
    name_keys: tuple[str, ...],
    hay_keys: tuple[str, ...],
    age_key: str = "age",
) -> list[dict[str, Any]]:
    ranked: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        name_bits = " ".join(str(row.get(k) or "") for k in name_keys)
        hay_bits = " ".join(str(row.get(k) or "") for k in hay_keys)
        score = match_score(
            folded_name=fold_name(name_bits),
            folded_hay=fold_name(f"{name_bits} {hay_bits}"),
            age=parse_age_field(row.get(age_key)),
            query=query,
        )
        if score > 0:
            ranked.append((score, row))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [row for _, row in ranked[:MAX_HITS_PER_LIST]]


def _hit_line(list_id: str, row: dict[str, Any]) -> str:
    name = row.get("name") or row.get("nameNe") or "—"
    age = row.get("age")
    place = (
        row.get("place")
        or (row.get("rescuedAt") or {}).get("name")
        or (row.get("stationedAt") or {}).get("name")
        or row.get("origin")
    )
    status = None
    if list_id == "rescued":
        st = row.get("status")
        if isinstance(st, dict):
            status = st.get("title") or st.get("titleNe")
        else:
            status = row.get("status")
    else:
        status = row.get("status") or row.get("daoStatus")

    bits = [f"{name}"]
    if age not in (None, ""):
        bits.append(f"age {age}")
    if place:
        bits.append(str(place))
    if status:
        bits.append(str(status))
    return " — ".join(bits)


def search_people(
    question: str,
    *,
    persons: dict[str, Any] | None,
    rescue: dict[str, Any] | None,
) -> dict[str, Any]:
    """Ranked hits across OPMCM lost/found/other and the NDRRMA rescued register."""
    query = parse_person_query(question)
    persons = persons or {}
    rescue = rescue or {}

    lists: list[tuple[str, list[dict[str, Any]]]] = [
        ("lost", list(persons.get("lost") or [])),
        ("found", list(persons.get("found") or [])),
        ("other", list(persons.get("other") or [])),
        ("rescued", list(rescue.get("persons") or [])),
    ]

    # Prefer the list the question pointed at, but still search the others —
    # a relative who said "missing" may find the person under "found" or rescued.
    preferred = {
        "missing": ("lost",),
        "found": ("found",),
        "rescued": ("rescued",),
    }.get(query["intent"])
    if preferred:
        lists = [pair for pair in lists if pair[0] in preferred] + [
            pair for pair in lists if pair[0] not in preferred
        ]

    buckets: dict[str, list[dict[str, Any]]] = {}
    total_fetched = int(persons.get("fetched") or 0) + len(rescue.get("persons") or [])

    for list_id, rows in lists:
        if list_id == "rescued":
            hits = _rank(
                rows,
                query,
                name_keys=("name", "nameNe"),
                hay_keys=(
                    "name",
                    "nameNe",
                    "country",
                    "nationality",
                    "remarks",
                ),
            )
            # Foreign filter only applies to the NDRRMA register.
            if query.get("foreign"):
                hits = [
                    h
                    for h in hits
                    if (h.get("nationality") or "").lower() == "foreign"
                    or bool(h.get("country"))
                ]
        else:
            hits = _rank(
                rows,
                query,
                name_keys=("name",),
                hay_keys=(
                    "name",
                    "place",
                    "description",
                    "daoOffice",
                    "status",
                    "daoStatus",
                    "origin",
                ),
            )
        if hits:
            buckets[list_id] = hits

    # Cap overall volume for a short ask answer.
    kept = 0
    capped: dict[str, list[dict[str, Any]]] = {}
    for list_id, hits in buckets.items():
        room = MAX_HITS_TOTAL - kept
        if room <= 0:
            break
        slice_hits = hits[:room]
        capped[list_id] = slice_hits
        kept += len(slice_hits)

    return {
        "query": query,
        "buckets": capped,
        "hitCount": kept,
        "hasNameTokens": bool(query["tokens"]) or query.get("age") is not None,
        "personsFetched": persons.get("fetched"),
        "personsTotal": persons.get("total"),
        "personsError": persons.get("error"),
        "personsFetchedAt": persons.get("fetchedAt"),
        "personsUrl": ((persons.get("source") or {}).get("url")),
        "registerTotal": (rescue.get("summary") or {}).get("total"),
        "registerFetchedAt": rescue.get("fetchedAt"),
        "registerUrl": ((rescue.get("source") or {}).get("url")),
        "rowsIndexed": total_fetched,
    }


LABELS = {
    "lost": "Still missing (OPMCM reports)",
    "found": "Reported found (OPMCM)",
    "other": "Filed otherwise (OPMCM)",
    "rescued": "NDRRMA rescued-persons register",
}

LABELS_NE = {
    "lost": "अझै हराएका (ओपीएमसीएम)",
    "found": "भेटिएको भनिएको (ओपीएमसीएम)",
    "other": "अन्य दर्ता (ओपीएमसीएम)",
    "rescued": "एनडीआरआरएमए उद्धार सूची",
}


def format_search_answer(result: dict[str, Any], lang: str) -> str:
    """English or Nepali template. Figures and names come only from `result`."""
    rescue_path = "/bhotekoshi-flood/rescue"
    caveat_en = (
        "These are public portal filings and the NDRRMA register as the desk "
        "last read them — reports, not a complete headcount. Lists are partial "
        "and separate; absence from one is not a death. Confirm on the portal "
        f"or at {rescue_path}. For rescue, call 1234."
    )
    caveat_ne = (
        "यी सार्वजनिक पोर्टलका रिपोर्ट र एनडीआरआरएमए सूची हुन् — पूर्ण गणना होइनन्। "
        "सूची आंशिक र छुट्टाछुट्टै छन्; एउटामा नभएकोले मृत्यु होइन। "
        f"पोर्टल वा {rescue_path} मा पुष्टि गर्नुहोस्। उद्धारका लागि १२३४।"
    )

    if not result.get("hasNameTokens"):
        if lang == "ne":
            return (
                "नाम लेख्नुहोस् — जस्तै 'राम बहादुर हराएका सूचीमा छन्?' — "
                f"त्यसपछि हराएका/भेटिएका र उद्धार सूची खोजिन्छ। {rescue_path} मा "
                f"पूरा खोज पनि छ। {caveat_ne}"
            )
        return (
            "Give a name to search — e.g. 'Is Ram Bahadur on the missing list?' — "
            f"and this box will check the lost/found reports and the rescued "
            f"register. Full search: {rescue_path}. {caveat_en}"
        )

    if result.get("personsError") and result.get("hitCount", 0) == 0:
        if lang == "ne":
            return (
                "हराएका/भेटिएका सूची अहिले डेस्कमा छैन। "
                f"{rescue_path} वा पोर्टलमा सिधै खोज्नुहोस्। {caveat_ne}"
            )
        return (
            "The missing-and-found register is not loaded on the desk right now. "
            f"Search on {rescue_path} or the portal directly. {caveat_en}"
        )

    buckets: dict[str, list[dict[str, Any]]] = result.get("buckets") or {}
    if not buckets:
        q = (result.get("query") or {}).get("raw") or "that name"
        indexed = result.get("personsFetched") or result.get("rowsIndexed") or "—"
        if lang == "ne":
            return (
                f"डेस्कले पढेका सूचीमा «{q}» मिल्ने रिपोर्ट भेटिएन "
                f"({indexed} ओपीएमसीएम पङ्क्ति जाँच)। अर्को हिज्जे प्रयास गर्नुहोस्, "
                f"वा {rescue_path} मा खोज्नुहोस्। {caveat_ne}"
            )
        return (
            f"No report matching «{q}» on the lists the desk has read "
            f"({indexed} OPMCM rows checked). Try another spelling, or search "
            f"on {rescue_path}. {caveat_en}"
        )

    parts: list[str] = []
    if lang == "ne":
        parts.append(
            f"डेस्कका सूचीमा {result['hitCount']} मिलान "
            f"(ओपीएमसीएम {result.get('personsFetched') or '—'} पङ्क्ति पढिएको"
            f"{', उद्धार सूची सहित' if 'rescued' in buckets else ''}):"
        )
    else:
        parts.append(
            f"{result['hitCount']} match(es) on the desk's lists "
            f"(OPMCM {result.get('personsFetched') or '—'} rows read"
            f"{'; rescued register included' if 'rescued' in buckets else ''}):"
        )

    for list_id, hits in buckets.items():
        label = (LABELS_NE if lang == "ne" else LABELS).get(list_id, list_id)
        lines = "; ".join(_hit_line(list_id, row) for row in hits)
        parts.append(f"{label}: {lines}.")

    parts.append(caveat_ne if lang == "ne" else caveat_en)
    return " ".join(parts)
