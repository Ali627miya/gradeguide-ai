"""Learning Coach Agent: Socratic, supportive questions - never replacement text.

All replies pass through the Integrity Agent before being returned.
"""
import re

from pydantic import BaseModel, Field

from agents import integrity_agent
from agents.llm_client import AIUnavailableError, call_json
from config import settings

QUESTION_BANK = {
    "evidence": [
        "Which of your claims would a sceptical reader most want proof for?",
        "What kind of source would be most convincing here - a study, official data, or a textbook?",
        "Where could you find that source (library database, module reading list, Google Scholar)?",
        "Once you have the source, how will you show the reader how it supports your point?",
    ],
    "referencing": [
        "Which referencing style does your module handbook ask for?",
        "Can every claim that came from somewhere else be traced to an entry in your reference list?",
        "Which details does each reference need so a reader could find the source?",
    ],
    "critical_evaluation": [
        "What did your results NOT show, even though it might be tempting to claim they did?",
        "What is the biggest limitation of how you did this, and how might it affect your conclusion?",
        "What would someone who disagrees with you say, and how would you respond?",
        "If you did this again, what one thing would you change and why?",
    ],
    "problem_objectives": [
        "What problem prompted this work in the first place?",
        "What exactly do you want the reader to know or be able to judge by the end?",
        "Could you turn your purpose into two or three specific objectives you can check off in the conclusion?",
    ],
    "argument": [
        "What is the single most important point you want the reader to understand?",
        "What are the two strongest reasons for that point?",
        "Which sentence in your draft currently states your position most clearly?",
    ],
    "methodology": [
        "Why was this approach more appropriate than the alternatives?",
        "Which alternatives did you consider, and why did you reject them?",
        "Which project constraints (time, skills, tools) shaped your choice?",
    ],
    "technical_accuracy": [
        "How would you explain the key concept to a first-year student?",
        "Which technical term in your draft might a reader not understand yet?",
        "What example from your own project best illustrates the concept?",
    ],
    "structure_presentation": [
        "If a reader only read your headings, what story would they get?",
        "Which paragraph tries to make more than one point?",
        "What does the reader need to know first, second and third?",
    ],
    "testing": [
        "Which behaviour of your code would be most damaging if it broke unnoticed?",
        "Which edge cases or invalid inputs have you not tested yet?",
        "How would you know if your tests themselves were wrong?",
    ],
    "error_handling": [
        "What is the most likely way a user could break this program?",
        "What should the user see when something goes wrong?",
    ],
    "functionality": [
        "Which requirement in the brief are you least sure your code meets?",
        "How could you demonstrate each requirement working?",
    ],
}
DEFAULT_QUESTIONS = [
    "What do you think the rubric is really asking for here?",
    "Which part of your draft best shows this criterion, and which part shows it least?",
    "What one change would make the biggest difference?",
]
ENCOURAGEMENT = [
    "That's a thoughtful start.", "Good thinking - you're getting to the heart of it.",
    "That's a useful idea to build on.", "Nice - that shows you understand what the rubric is looking for.",
]


class CoachOutput(BaseModel):
    reply: str = Field(min_length=10)
    questions: list[str] = Field(default_factory=list, max_length=3)


SYSTEM_PROMPT = """You are the Learning Coach in GradeGuide AI. You help a university student improve THEIR OWN draft.
Style: warm, encouraging, never judgemental, plain English, max 120 words.
Method: Socratic. Acknowledge what the student said, then ask 1-3 open questions that help them decide what to change.
Hard rules - NEVER: write or rewrite sentences/paragraphs, suggest wording ("you could write..."), give model answers,
produce code, or provide ready-to-submit content. If asked to write something, kindly decline and ask a guiding question.
You may refer to the student's own quoted words. End your reply with a question.
Return JSON: {"reply": str, "questions": [str, ...up to 3]}"""


def bank_for(category: str) -> list[str]:
    return QUESTION_BANK.get(category, DEFAULT_QUESTIONS)


def opening(area: dict) -> dict:
    qs = bank_for(area["category"])[:3]
    gap = f" The marker noticed: {area['missing'].rstrip('.')}." if area.get("missing") else ""
    reply = (f"Let's work on {area['criterion_name']} together. Your draft was rated {area['rating']} "
             f"({area['score']}/5) here.{gap} I won't write anything for you - instead, let's think it through. "
             f"{area['coaching_question']}")
    return {"reply": reply, "questions": qs, "mode": "simulated" if not settings.live_ai_available else "live"}


def _offline_reply(area: dict, history: list[dict], message: str) -> dict:
    asked = {q for h in history for q in (h.get("questions") or [])} | {h["content"] for h in history}
    remaining = [q for q in bank_for(area["category"]) if q not in asked and not any(q in a for a in asked)]
    words = len(message.split())
    n_student = sum(1 for h in history if h["role"] == "student")
    if words < 6:
        reply = "Can you say a little more? Even a rough idea in your own words is a great starting point."
    else:
        reply = ENCOURAGEMENT[n_student % len(ENCOURAGEMENT)]
        if re.search(r"\b(19|20)\d{2}\b|journal|study|paper|book|article|et al", message, re.I):
            reply += " You've named a possible source - check it's credible, and think about exactly which claim it supports."
        elif re.search(r"\b(because|so that|since)\b", message, re.I):
            reply += " You're giving reasons, which is exactly what markers look for."
    nxt = remaining[:1] or ["When you're ready, what will you change in your draft first? Add it to your improvement plan."]
    reply += " " + nxt[0]
    return {"reply": reply, "questions": nxt, "mode": "simulated"}


def respond(area: dict, history: list[dict], message: str, source_text: str) -> dict:
    """Return {reply, questions, mode, integrity:{...}}."""
    screen = integrity_agent.screen_request(message, area["category"])
    if screen["blocked"]:
        return {"reply": screen["safe_response"], "questions": [], "mode": "integrity",
                "integrity": {"action": "request_refused", "rule": screen["rule"]}}
    out = None
    if settings.live_ai_available:
        convo = "\n".join(f"{h['role'].upper()}: {h['content']}" for h in history[-10:])
        prompt = (f"Criterion: {area['criterion_name']} ({area['weight']:g}% of rubric) - \"{area['criterion_text']}\"\n"
                  f"Current rating: {area['rating']} ({area['score']}/5). Marker explanation: {area['explanation']}\n"
                  f"What is missing: {area['missing']}\nStudent's evidence quote: \"{area['evidence_quote']}\"\n\n"
                  f"Conversation so far:\n{convo}\n\nSTUDENT: {message}")
        try:
            out = call_json(SYSTEM_PROMPT, prompt, CoachOutput, temperature=0.5).model_dump()
            out["mode"] = "live"
        except AIUnavailableError as exc:
            out = _offline_reply(area, history, message)
            out["mode"] = "simulated"
            out["notice"] = f"Live AI unavailable ({exc}); using the offline coach."
    else:
        out = _offline_reply(area, history, message)
    g = integrity_agent.guard(out["reply"], source_text, area["category"], kind="coach",
                              allowed_quotes=[area.get("evidence_quote", "")], use_llm=out["mode"] == "live")
    out["integrity"] = {"action": "replaced" if g["replaced"] else "passed", "violations": g["violations"],
                        "layers": g["layers"]}
    if g["replaced"]:
        out["reply"], out["questions"] = g["text"], []
    return out
