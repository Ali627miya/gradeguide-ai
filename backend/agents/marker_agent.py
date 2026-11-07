"""Marker Agent: rates a submission against each rubric criterion with quoted evidence.

Live mode uses OpenAI with a strict JSON contract validated by Pydantic. Offline mode uses the
transparent rule-based simulator (agents/offline_analyser.py) and is always labelled "simulated".
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from agents import offline_analyser
from agents.llm_client import call_json
from config import settings

ISSUE_TYPES = ("missing", "incorrect", "unsupported", "good", "ambiguous")


class MarkerCriterion(BaseModel):
    question_id: int
    score: int = Field(ge=1, le=5)
    evidence_quote: str = ""
    explanation: str = Field(min_length=10)
    missing: str = ""
    issue_type: Literal["missing", "incorrect", "unsupported", "good", "ambiguous"]
    coaching_question: str = Field(min_length=8)

    @field_validator("evidence_quote")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip().strip('"').strip("“”").strip()


class MarkerOutput(BaseModel):
    criteria: list[MarkerCriterion]
    overall_summary: str = ""


SYSTEM_PROMPT = """You are the Marker Agent in GradeGuide AI, a formative feedback tool for university students.
You assess a student's DRAFT against their lecturer's rubric. You are rigorous, fair, specific and kind.

Rules you must follow:
1. Assess ONLY against the rubric questions provided. Every result must reference one question_id. No generic writing advice.
2. Score each question on this scale: 1 Very weak, 2 Weak, 3 Satisfactory, 4 Good, 5 Excellent.
3. evidence_quote MUST be copied VERBATIM (character-for-character) from the submission, max 40 words, a single contiguous span.
   It will be checked programmatically; invented or altered quotes are flagged as errors.
   If nothing in the submission is relevant (e.g. the content is missing), use an empty string and say so in the explanation.
4. issue_type: "missing" (required content absent), "incorrect" (content present but wrong), "unsupported" (claims without
   evidence/justification), "good" (meets the criterion well), "ambiguous" (the rubric wording is unclear or you cannot judge reliably).
5. explanation: 1-3 sentences on WHY the score was given, mentioning the criterion's weight if it is high.
6. missing: what the work still needs, described as a gap - NEVER as replacement text.
7. coaching_question: ONE open question that helps the student think for themselves. It must end with '?'.
8. NEVER write, rewrite, paraphrase or suggest replacement sentences, paragraphs or code. Never provide model answers.
9. These are formative estimates, not official marks.
Return JSON: {"criteria": [{"question_id": int, "score": int, "evidence_quote": str, "explanation": str, "missing": str,
"issue_type": str, "coaching_question": str}], "overall_summary": str (2 sentences, encouraging, no rewriting)}"""


def _user_prompt(text: str, questions: list[dict], context: dict) -> str:
    rubric = "\n".join(
        f"- question_id={q['id']} | section={q['section']} | weight={q['weight']:g}% | {q['text']}" for q in questions
    )
    return (
        f"Assignment: {context.get('title', '')} ({context.get('module', '')})\n"
        f"Assignment description: {context.get('description') or 'not provided'}\n\n"
        f"RUBRIC:\n{rubric}\n\nSUBMISSION (verbatim):\n<<<\n{text[:60000]}\n>>>\n\n"
        "Assess every rubric question exactly once."
    )


def assess(text: str, questions: list[dict], context: dict | None = None, force_offline: bool = False) -> dict:
    """Return {mode, model_name, criteria:[...], overall_summary}. Raises AIUnavailableError in live mode on failure."""
    context = context or {}
    if settings.live_ai_available and not force_offline:
        out = call_json(SYSTEM_PROMPT, _user_prompt(text, questions, context), MarkerOutput)
        by_id = {c.question_id: c.model_dump() for c in out.criteria}
        criteria = []
        for q in questions:
            c = by_id.get(q["id"])
            if c is None:  # the model skipped a criterion - never invent a rating for it silently
                c = {"question_id": q["id"], "score": 3, "evidence_quote": "", "issue_type": "ambiguous",
                     "explanation": "The AI did not return an assessment for this criterion, so no reliable rating is available.",
                     "missing": "", "coaching_question": "How does your work address this criterion?",
                     "flags": ["AI response omitted this criterion - placeholder rating, human review required."]}
            c.setdefault("flags", [])
            criteria.append(c)
        return {"mode": "live", "model_name": settings.OPENAI_MODEL, "criteria": criteria,
                "overall_summary": out.overall_summary}
    criteria = offline_analyser.simulate(text, questions)
    ranked = sorted(zip(questions, criteria), key=lambda qc: qc[1]["score"])
    weakest, strongest = ranked[0][0]["short_name"], ranked[-1][0]["short_name"]
    summary = (f"Simulated feedback: your strongest area appears to be {strongest}; the area with most room to grow is "
               f"{weakest}. Use the coaching questions to decide what to change - the words stay yours.")
    return {"mode": "simulated", "model_name": "offline-rule-simulator-v1", "criteria": criteria, "overall_summary": summary}


def rating_label(score: int) -> str:
    return "STRONG" if score >= 4 else "OKAY" if score == 3 else "WEAK"
