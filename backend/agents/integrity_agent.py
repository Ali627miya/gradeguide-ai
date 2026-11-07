"""Academic Integrity Agent.

Checks every AI-generated message before it reaches the student, using layered safeguards:
  Layer 1 - request screening: refuses requests to write/rewrite/complete coursework.
  Layer 2 - rule-based output checks: replacement-text phrasing, code generation, new quoted wording,
            paraphrases of the student's own sentences, missing guiding question.
  Layer 3 - (live mode only) an independent LLM classifier double-checks coach replies.
If a check fails, the response is replaced with a safe guiding question.

Limitations (shown to users): rules can be evaded by unusual phrasing, and the classifier can make
mistakes in both directions. This is a deterrent and a guard-rail, not a guarantee.
"""
import re

from pydantic import BaseModel

from agents.llm_client import AIUnavailableError, call_json
from config import settings
from services.evidence_service import canon

REQUEST_PATTERNS = [
    r"\b(re-?write|reword|rephrase|paraphrase)\b",
    r"\bwrite (?:me |my |the |this |an? |up )?(?:\w+ ){0,2}(intro|introduction|conclusion|paragraph|essay|report|section|answer|"
    r"code|function|program|abstract|summary|sentence|literature review|methodology|evaluation)",
    r"\b(complete|finish|do|solve|fix) (?:my|the|this) (?:\w+ )?(code|assignment|homework|essay|report|function|program|bug)",
    r"\b(give|show|send) me (?:the |a |an )?(answer|solution|code|finished|full|model answer|example paragraph)",
    r"\bgenerate (?:a |an |the |some )?(?:\w+ )?(paragraph|essay|code|text|answer|introduction|conclusion|function)",
    r"\b(make|turn) (?:it|this|my \w+) (?:better|sound better|more academic|into)\b",
    r"\bcan you (?:just )?(?:improve|correct|edit) (?:my|this|the) (?:\w+ )?(paragraph|sentence|essay|code|introduction|conclusion)",
]
REPLACEMENT_PHRASES = [
    r"here(?:'s| is) (?:a|an|the|your|my) (?:revised|rewritten|improved|new|better|corrected|updated|suggested) ",
    r"you (?:could|might|can|should) (?:write|say|phrase it|put)\b",
    r"\btry (?:writing|saying|something like)\b",
    r"\b(?:replace|change) (?:it|this|that|the sentence|the paragraph)(?: \w+){0,3} (?:with|to)\b",
    r"\brewrit(?:e|ten) (?:it|this) as\b",
    r"\ba (?:better|stronger|improved) version (?:would be|is|could be)\b",
    r"\bfor example,? (?:you could|write|say)\b",
    r"\b(?:revised|rewritten) (?:version|paragraph|introduction|sentence)\s*:",
]
CODE_SIGNS = re.compile(r"```|^\s*(def |class |function |public |import |#include|for \(|while \()|;\s*$", re.M)
STOPWORDS = set("the a an and or of to in on for with is are was were be been it this that as by at from our we i you".split())

POLICY = {
    "will": [
        "Rate your work against your lecturer's rubric and explain each rating.",
        "Quote your own words as evidence, and check every quote really appears in your document.",
        "Ask questions that help you decide how to improve your work.",
        "Help you plan, track and reflect on your own improvements.",
    ],
    "will_not": [
        "Write, rewrite, paraphrase or complete any part of your assignment.",
        "Generate replacement sentences, paragraphs or code for your submission.",
        "Give official grades or predict your final mark.",
        "Change your uploaded files - you always remain the author.",
    ],
    "limitations": [
        "The integrity checks are layered rules plus (in live mode) an AI classifier. They reduce the risk of "
        "ghost-writing but cannot guarantee it is impossible - unusual phrasing can slip past, and occasionally "
        "a harmless reply may be blocked.",
        "The tool cannot see what you do outside it, so responsibility for academic honesty stays with you and "
        "your university's policies.",
    ],
}

_SAFE_QUESTIONS = {
    "evidence": "What reliable source could help you show that this claim is accurate?",
    "referencing": "Which sources did you actually rely on, and where in your text does each one support a point?",
    "critical_evaluation": "What are the main limitations of your approach, and how do they affect your conclusion?",
    "problem_objectives": "In one sentence of your own, what problem is your work trying to solve?",
    "argument": "What is the single most important point you want the reader to understand?",
    "methodology": "Why was your chosen approach more appropriate than the alternatives?",
    "technical_accuracy": "How would you explain this concept in your own words to a classmate?",
    "structure_presentation": "What would a reader expect to find in each section, and is it there?",
    "testing": "Which behaviour of your code would you most want a test to protect?",
    "error_handling": "What unexpected input could break this part of your program?",
}


def safe_response(category: str | None = None, topic: str = "this part of your work") -> str:
    q = _SAFE_QUESTIONS.get(category or "", "What is the main point you want this part of your work to make?")
    return f"I can help you improve {topic}, but I can't write or rewrite it for you - it needs to stay your own work. {q}"


def screen_request(message: str, category: str | None = None) -> dict:
    m = message.lower()
    for pat in REQUEST_PATTERNS:
        if re.search(pat, m):
            topic = "your introduction" if "intro" in m else "your conclusion" if "conclusion" in m else \
                "your code" if re.search(r"\bcode|function|program", m) else "this part of your work"
            return {"blocked": True, "rule": pat, "safe_response": safe_response(category, topic)}
    return {"blocked": False}


def _tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9']+", s.lower()) if w not in STOPWORDS}


def check_output(text: str, source_text: str = "", kind: str = "coach", allowed_quotes: list[str] | None = None) -> dict:
    """Return {passed, violations:[{rule, detail}]} for an AI-generated message."""
    violations = []
    low = text.lower()
    for pat in REPLACEMENT_PHRASES:
        if re.search(pat, low):
            violations.append({"rule": "replacement_text", "detail": "Offers wording for the student to use."})
            break
    if CODE_SIGNS.search(text) and len(text.splitlines()) > 1 or "```" in text:
        violations.append({"rule": "code_generation", "detail": "Contains code."})
    src = canon(source_text)
    allowed = [canon(a) for a in (allowed_quotes or []) if a]
    for qm in re.finditer(r"[\"“']([^\"”']{40,})[\"”']", text):
        quoted = canon(qm.group(1))
        if len(quoted.split()) >= 10 and quoted not in src and not any(quoted in a or a in quoted for a in allowed):
            violations.append({"rule": "new_quoted_wording", "detail": "Quotes wording that is not from the student's work."})
            break
    if source_text:
        src_sents = [s for s in re.split(r"(?<=[.!?])\s+", source_text) if len(s.split()) >= 10]
        src_tok = [(_tokens(s), canon(s)) for s in src_sents]
        for sent in re.split(r"(?<=[.!?])\s+", text):
            if len(sent.split()) < 10 or sent.strip().endswith("?"):
                continue
            c = canon(sent)
            if c in src or any(c in a for a in allowed):
                continue  # verbatim quote = evidence, allowed
            t = _tokens(sent)
            for st, sc in src_tok:
                inter = len(t & st)
                jac = inter / max(1, len(t | st))
                if jac >= 0.5 and sc not in c:
                    violations.append({"rule": "paraphrase_of_student_work",
                                       "detail": "Re-words one of the student's own sentences."})
                    break
            if violations and violations[-1]["rule"] == "paraphrase_of_student_work":
                break
    if kind == "coach" and "?" not in text:
        violations.append({"rule": "no_guiding_question", "detail": "Coach replies must end with a guiding question."})
    if kind == "coach" and len(text.split()) > 220:
        violations.append({"rule": "too_long", "detail": "Coach replies longer than 220 words risk drifting into ghost-writing."})
    return {"passed": not violations, "violations": violations, "layers": ["rules"]}


class _Classifier(BaseModel):
    contains_ready_to_submit_content: bool
    reason: str = ""


def llm_double_check(text: str) -> dict | None:
    """Layer 3: independent classifier (live mode only). Returns None if unavailable."""
    if not settings.live_ai_available:
        return None
    try:
        res = call_json(
            "You are an academic integrity auditor. Decide whether a tutor's message to a student contains "
            "ready-to-submit assignment content: rewritten or replacement sentences/paragraphs, model answers, or code "
            "the student could paste into their coursework. Asking questions, giving criteria-based feedback and quoting "
            "the student's own words are allowed. Reply as JSON: {\"contains_ready_to_submit_content\": bool, \"reason\": str}",
            f"Tutor message:\n<<<\n{text}\n>>>", _Classifier, temperature=0)
        return res.model_dump()
    except AIUnavailableError:
        return None


def guard(text: str, source_text: str, category: str | None, kind: str = "coach", allowed_quotes=None,
          use_llm: bool = True) -> dict:
    """Run all layers; returns {text, passed, violations, layers, replaced}."""
    result = check_output(text, source_text, kind, allowed_quotes)
    if result["passed"] and use_llm:
        llm = llm_double_check(text)
        if llm is not None:
            result["layers"].append("llm_classifier")
            if llm["contains_ready_to_submit_content"]:
                result["passed"] = False
                result["violations"].append({"rule": "llm_classifier", "detail": llm.get("reason", "")[:200]})
    if not result["passed"]:
        return {**result, "text": safe_response(category), "replaced": True}
    return {**result, "text": text, "replaced": False}
