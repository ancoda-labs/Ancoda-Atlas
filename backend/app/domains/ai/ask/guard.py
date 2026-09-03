"""What is scrubbed on the way into the model, and checked on the way out.

THE THREAT.

Text Atlas does not control reaches the model in two places. Headlines arrive
from outlets, and district, fund, gauge and source labels arrive from
government portals — including, now, one fetched while the request is being
served. And the reader types a question. Any of it can be shaped to look like
an instruction.

The prompt already says the tool block is data. That is necessary and it is
not sufficient: it is a sentence competing with another sentence, and the
model decides which wins.

SO THIS IS BOUNDARY WORK, NOT FIELD WORK.

`sanitize_headline` was applied to exactly one field, the news title. Every
other string in the snapshot went in raw, which is the failure mode of
per-field sanitising: the list of fields grows, and the day someone adds one
is the day it is forgotten. `scrub` walks the whole payload instead, so a
field added later is covered by default rather than by memory.

Two things it removes:

  Instruction-shaped text, in the shapes people actually use.

  The fence markers themselves. `wrap_tool_data` puts the payload between
  <<<TOOL_DATA>>> and <<<END_TOOL_DATA>>> and tells the model to distrust what
  is inside. A headline containing the closing marker ends the fence early and
  everything after it reads as prose from the operator — the delimiter was
  load-bearing and nothing was defending it.

ON THE WAY OUT.

An injection that survives all of the above still has to produce an answer,
and the answer is checked for grounding: every figure in it must appear in the
data the model was given. This desk's first rule is that it never invents a
hazard number, and a model told to make one up is exactly how that rule breaks.
An ungrounded answer is discarded for the template, which is plainer prose and
exactly as true.
"""

import re
from typing import Any

from app.core.logging import get_logger

log = get_logger(__name__)

# The shapes that actually appear. Broader than the original three, and each
# alternative is anchored on a verb or a role word so ordinary reporting does
# not trip it — "the system prompted evacuations" is a real headline.
INJECTION = re.compile(
    r"\b(?:"
    # Bounded repetition throughout. `\s+\w*\s*` here was ambiguous enough to
    # backtrack super-linearly, which on a public text box is the vulnerability
    # rather than the defence against one.
    r"ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)(?:\s+\w+){0,2}\s+instructions?"
    r"|disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)"
    r"|forget\s+(?:everything|all|your)\s+(?:above|before|instructions?|rules?)"
    r"|you\s+are\s+now\s+(?:a|an|the)?"
    r"|(?:new|updated|revised)\s+(?:system\s+)?instructions?\s*:"
    # \b, or this matches inside "the system prompted evacuations" — a real
    # headline shape, and mangling one is its own kind of wrong.
    r"|system\s+prompts?\b"
    r"|act\s+as\s+(?:a|an|the)\s"
    r"|pretend\s+(?:to\s+be|you\s+are)"
    r"|reveal\s+(?:your|the)\s+(?:prompt|instructions?|rules?)"
    r"|(?:override|bypass|ignore)\s+(?:your|the)\s+(?:rules?|refusals?|policy)"
    r"|do\s+not\s+follow\s+(?:your|the)\s+(?:rules?|instructions?)"
    r"|\bDAN\b|jailbreak"
    r")",
    re.I,
)

# The delimiters wrap_tool_data relies on. Anything carrying one is trying to
# end the fence, and there is no legitimate reason for a district name to.
# One character class rather than `\s*/?\s*`, which was two adjacent
# variable-width matchers around an optional — the same backtracking shape.
FENCE = re.compile(r"<<<[\s/]*(?:END_)?TOOL_DATA[\s]*>>>", re.I)

# Long enough for a real headline, short enough that no single field can crowd
# the instructions out of the model's attention.
MAX_FIELD_CHARS = 240

DIGITS = re.compile(r"\d+")


def scrub_text(value: str, *, limit: int = MAX_FIELD_CHARS) -> str:
    """One untrusted string, made safe to place in a prompt."""
    cleaned = FENCE.sub("[removed]", value or "")
    cleaned = INJECTION.sub("[removed]", cleaned)
    return cleaned[:limit]


def scrub(value: Any, *, limit: int = MAX_FIELD_CHARS) -> Any:
    """Every string anywhere in a payload, scrubbed.

    Walks dicts and lists so a field added to the snapshot later is covered
    without anyone remembering to cover it. Numbers, booleans and None pass
    through untouched — they cannot carry an instruction.
    """
    if isinstance(value, str):
        return scrub_text(value, limit=limit)
    if isinstance(value, dict):
        return {k: scrub(v, limit=limit) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v, limit=limit) for v in value]
    return value


def numbers_are_grounded(answer: str, allowed: str) -> bool:
    """Whether every figure in the answer came from the data.

    The one rule this desk does not bend is that it never invents a hazard
    number. A model that has been talked into ignoring its instructions still
    has to produce figures, and figures are checkable.

    Years and small ordinals are ignored: "the last 24 hours" and "3 districts"
    are phrasing, not claims, and failing an answer over them would send every
    turn to the template.
    """
    for token in set(DIGITS.findall(answer or "")):
        if len(token) <= 2:
            continue
        if token not in allowed:
            return False
    return True
