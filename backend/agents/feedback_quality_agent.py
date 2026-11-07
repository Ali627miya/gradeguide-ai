"""Feedback Quality Agent: scores the quality of GradeGuide's OWN feedback (not the student's work).

Deliberately deterministic: every dimension is computed by programmatic checks, so the AI can never
award itself a high score. These checks measure *consistency and verifiability*, not factual truth.
"""
import re

WEIGHTS = {
    "evidence_accuracy": 30, "rubric_alignment": 25, "reasoning_quality": 20,
    "feedback_relevance": 15, "integrity_compliance": 10,
}
LABELS = {
    "evidence_accuracy": "Evidence accuracy", "rubric_alignment": "Rubric alignment",
    "reasoning_quality": "Reasoning quality", "feedback_relevance": "Feedback relevance",
    "integrity_compliance": "Integrity compliance",
}
_STOP = set("does the a an and or of to in on for with is are be it this that as by at from report code work "
            "your their appropriate appropriately clearly sufficiently".split())
_REASON = re.compile(r"\b(because|so|since|only|no|not|without|but|although|which|found|detected|\d+)\b", re.I)
_GENERIC = re.compile(r"^(improve|work on|be more|add more detail)\b", re.I)


def _to_5(frac: float) -> int:
    return 5 if frac >= 0.95 else 4 if frac >= 0.8 else 3 if frac >= 0.6 else 2 if frac >= 0.35 else 1


def _terms(s: str) -> set[str]:
    return {w[:6] for w in re.findall(r"[a-z]{4,}", s.lower()) if w not in _STOP}


def evaluate(ratings: list[dict], integrity_events: list[dict], category_keywords: dict[str, list[str]],
             mode: str = "live") -> dict:
    n = max(1, len(ratings))
    per = []
    ev_sum = al_sum = rq_sum = rel_sum = 0.0
    questions_seen = set()
    for r in ratings:
        status = r["quote_status"]
        honest_none = status == "none" and re.search(r"insufficient|no .*(found|detected)|not (found|detected)|did not return",
                                                     r["explanation"], re.I)
        ev = {"verified": 1.0, "near": 0.6, "unverified": 0.0}.get(status, 0.8 if honest_none else 0.4)
        crit_terms = _terms(r["criterion_text"] + " " + r["criterion_name"])
        fb_text = (r["explanation"] + " " + r["missing"]).lower()
        kw = [k for k in category_keywords.get(r["category"], [])]
        aligned = bool(crit_terms & _terms(fb_text)) or any(k in fb_text for k in kw)
        checks = [
            len(r["explanation"].split()) >= 12,
            bool(_REASON.search(r["explanation"])),
            r["score"] >= 4 or bool(r["missing"].strip()),
            (r["rating"] == "STRONG") == (r["score"] >= 4),
        ]
        rq = sum(checks) / len(checks)
        cq = r["coaching_question"].strip()
        rel_checks = [
            cq.endswith("?") and len(cq.split()) >= 6,
            cq.lower() not in questions_seen,
            not _GENERIC.search(r["missing"].strip()) if r["missing"] else r["score"] >= 4,
        ]
        questions_seen.add(cq.lower())
        rel = sum(rel_checks) / len(rel_checks)
        ev_sum, al_sum, rq_sum, rel_sum = ev_sum + ev, al_sum + aligned, rq_sum + rq, rel_sum + rel
        per.append({"criterion": r["criterion_name"], "quote_status": status, "aligned": aligned,
                    "reasoning_checks_passed": f"{sum(checks)}/{len(checks)}",
                    "relevance_checks_passed": f"{sum(rel_checks)}/{len(rel_checks)}"})
    violations = sum(len(e.get("violations", [])) for e in integrity_events)
    scores = {
        "evidence_accuracy": _to_5(ev_sum / n),
        "rubric_alignment": _to_5(al_sum / n),
        "reasoning_quality": _to_5(rq_sum / n),
        "feedback_relevance": _to_5(rel_sum / n),
        "integrity_compliance": max(1, 5 - violations),
    }
    caps = []
    if mode == "simulated":
        # template-based reasoning cannot earn top marks, however tidy it looks
        scores["reasoning_quality"] = min(scores["reasoning_quality"], 4)
        scores["feedback_relevance"] = min(scores["feedback_relevance"], 4)
        caps.append("Simulated (rule-based) feedback is capped at 4/5 for reasoning and relevance because its "
                    "explanations and questions come from templates.")
    if any(r["issue_type"] == "ambiguous" for r in ratings):
        scores["reasoning_quality"] = min(scores["reasoning_quality"], 4)
        caps.append("At least one criterion could not be judged reliably (marked 'ambiguous'), so reasoning is capped at 4/5.")
    overall = round(sum(scores[k] / 5 * w for k, w in WEIGHTS.items()), 1)
    verified = sum(1 for r in ratings if r["quote_status"] == "verified")
    unverified = sum(1 for r in ratings if r["quote_status"] == "unverified")
    explanations = {
        "evidence_accuracy": f"{verified} of {len(ratings)} quotes matched your document exactly"
                             + (f"; {unverified} could not be found and were flagged." if unverified else "."),
        "rubric_alignment": f"{int(al_sum)} of {len(ratings)} explanations use the language of their rubric criterion.",
        "reasoning_quality": "Checks that each rating has a reasoned explanation, a stated gap when not strong, and a label that matches its score.",
        "feedback_relevance": "Checks that each criterion has a distinct, open coaching question and a specific improvement area.",
        "integrity_compliance": "No ghost-writing detected in the generated feedback." if violations == 0 else
                                f"{violations} integrity issue(s) were caught and replaced with guiding questions before you saw them.",
    }
    return {
        "scores": scores, "overall": overall, "weights": WEIGHTS, "labels": LABELS, "explanations": explanations,
        "per_criterion": per, "integrity_violations": violations, "caps": caps,
        "method": "automated_checks",
        "disclaimer": "This score is calculated by automated consistency checks (quote matching, rubric wording, "
                      "structure of reasoning and integrity rules). It shows the feedback is verifiable and well-formed - "
                      "it does NOT prove the ratings are correct. Only a human marker can confirm that.",
    }
