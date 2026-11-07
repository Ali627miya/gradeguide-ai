"""Orchestration workflow: rubric validation -> Marker -> evidence verification -> Integrity -> Feedback Quality -> save."""
import time

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from agents import feedback_quality_agent, integrity_agent, marker_agent
from agents.llm_client import AIUnavailableError
from models.models import (
    Assessment, Assignment, CriterionRating, Draft, FeedbackQualityScore, ImprovementArea, LecturerReview, Rubric,
)
from services.evidence_service import verify_quote
from services.rubric_service import CATEGORIES, validate_questions

DISCLAIMER = "These are AI-generated estimated feedback ratings, not official university marks."
SIM_DISCLAIMER = ("SIMULATED FEEDBACK - produced by GradeGuide's offline rule-based simulator because no OpenAI key is "
                  "configured. It is not AI analysis. Ratings are rough estimates, not official university marks.")


def rubric_questions(rubric: Rubric) -> list[dict]:
    return [{"id": q.id, "section": q.section, "text": q.text, "short_name": q.short_name, "category": q.category,
             "weight": q.weight} for q in rubric.questions]


def weighted_score(ratings: list[dict]) -> float:
    return round(sum(r["score"] / 5 * r["weight"] for r in ratings), 1)


def run_assessment(db: Session, draft: Draft, force_offline: bool = False, is_demo: bool = False) -> Assessment:
    log = []

    def step(name, detail, t0, status="ok"):
        log.append({"step": name, "status": status, "detail": detail, "ms": int((time.perf_counter() - t0) * 1000)})

    assignment: Assignment = draft.assignment
    t = time.perf_counter()
    questions = rubric_questions(assignment.rubric)
    errors = validate_questions(questions)
    if errors:
        raise HTTPException(422, "The rubric is not valid: " + " ".join(errors))
    step("Rubric validation", f"{len(questions)} criteria, weights total 100%", t)

    t = time.perf_counter()
    try:
        result = marker_agent.assess(draft.text, questions, {
            "title": assignment.title, "module": assignment.module_name, "description": assignment.description,
        }, force_offline=force_offline)
    except AIUnavailableError as exc:
        raise HTTPException(503, f"Live AI assessment failed: {exc} You can try again, or tick 'Use offline simulator'.") from exc
    step("Marker Agent", f"{result['mode']} assessment with {result['model_name']}", t)

    t = time.perf_counter()
    qmap = {q["id"]: q for q in questions}
    ratings, integrity_events = [], []
    for pos, c in enumerate(result["criteria"]):
        q = qmap[c["question_id"]]
        flags = list(c.get("flags", []))
        v = verify_quote(c["evidence_quote"], draft.text)
        if v["status"] == "unverified":
            flags.append("Quoted evidence could not be found in your document - it may be inaccurate. Human review needed.")
        elif v["status"] == "near":
            flags.append(f"Quote is a close but not exact match ({int(v['similarity'] * 100)}% similar).")
        elif v["status"] == "none" and c["score"] >= 4:
            flags.append("A high rating was given without any supporting quote.")
        ratings.append({**c, "question": q, "quote_status": v["status"], "flags": flags, "position": pos})
    verified = sum(1 for r in ratings if r["quote_status"] == "verified")
    step("Evidence verification", f"{verified}/{len(ratings)} quotes matched the document exactly", t)

    t = time.perf_counter()
    for r in ratings:
        cq = r["coaching_question"].strip()
        if not cq.endswith("?"):
            r["coaching_question"] = integrity_agent._SAFE_QUESTIONS.get(
                r["question"]["category"], "What would make this criterion stronger, in your own words?")
            integrity_events.append({"field": "coaching_question", "violations": [{"rule": "not_a_question"}]})
        for fld in ("explanation", "missing", "coaching_question"):
            chk = integrity_agent.check_output(r[fld], draft.text, kind="marker", allowed_quotes=[r["evidence_quote"]])
            if not chk["passed"]:
                integrity_events.append({"field": fld, "criterion": r["question"]["short_name"], "violations": chk["violations"]})
                r["flags"].append("Part of this feedback was removed by the Integrity Agent (it contained suggested wording).")
                r[fld] = {
                    "explanation": "Part of this explanation was removed by the Integrity Agent because it contained suggested wording.",
                    "missing": "Review the rubric criterion and decide yourself what is missing.",
                    "coaching_question": integrity_agent._SAFE_QUESTIONS.get(r["question"]["category"],
                                                                             "What would make this criterion stronger, in your own words?"),
                }[fld]
    summary_chk = integrity_agent.check_output(result["overall_summary"], draft.text, kind="marker")
    if not summary_chk["passed"]:
        integrity_events.append({"field": "overall_summary", "violations": summary_chk["violations"]})
        result["overall_summary"] = "Your feedback is ready. Work through each criterion and its coaching question."
    n_viol = sum(len(e["violations"]) for e in integrity_events)
    step("Integrity Agent", "No ghost-writing detected" if n_viol == 0 else f"{n_viol} issue(s) caught and replaced", t)

    t = time.perf_counter()
    rows = []
    for r in ratings:
        q = r["question"]
        rows.append({
            "criterion_name": q["short_name"], "criterion_text": q["text"], "category": q["category"],
            "weight": q["weight"], "score": int(r["score"]), "rating": marker_agent.rating_label(int(r["score"])),
            "quote_status": r["quote_status"], "explanation": r["explanation"], "missing": r.get("missing", ""),
            "coaching_question": r["coaching_question"], "issue_type": r["issue_type"],
        })
    quality = feedback_quality_agent.evaluate(rows, integrity_events,
                                              {k: v[2] for k, v in CATEGORIES.items()}, mode=result["mode"])
    step("Feedback Quality Agent", f"{quality['overall']}/100 from automated checks", t)

    flagged_any = any(r["flags"] for r in ratings)
    a = Assessment(
        draft_id=draft.id, assignment_id=assignment.id, student_id=draft.student_id, mode=result["mode"],
        model_name=result["model_name"], weighted_score=weighted_score(rows), overall_summary=result["overall_summary"],
        needs_human_review=flagged_any, is_demo=is_demo or draft.is_demo, pipeline_log=log,
    )
    db.add(a)
    db.flush()
    for r, row in zip(ratings, rows):
        db.add(CriterionRating(
            assessment_id=a.id, question_id=r["question"]["id"], position=r["position"],
            criterion_name=row["criterion_name"], criterion_text=row["criterion_text"], category=row["category"],
            section=r["question"]["section"], weight=row["weight"], rating=row["rating"], score=row["score"],
            evidence_quote=r["evidence_quote"], quote_status=r["quote_status"], explanation=row["explanation"],
            missing=row["missing"], issue_type=r["issue_type"], coaching_question=row["coaching_question"],
            flagged=bool(r["flags"]), flag_reasons=r["flags"],
        ))
    s = quality["scores"]
    db.add(FeedbackQualityScore(
        assessment_id=a.id, evidence_accuracy=s["evidence_accuracy"], rubric_alignment=s["rubric_alignment"],
        reasoning_quality=s["reasoning_quality"], feedback_relevance=s["feedback_relevance"],
        integrity_compliance=s["integrity_compliance"], overall=quality["overall"], details=quality,
    ))
    db.flush()
    for cr in a.ratings:
        if cr.score <= 3:
            db.add(ImprovementArea(student_id=a.student_id, assessment_id=a.id, rating_id=cr.id,
                                   criterion_name=cr.criterion_name, category=cr.category))
    log.append({"step": "Saved", "status": "ok", "detail": f"{sum(1 for r in rows if r['score'] <= 3)} improvement areas created", "ms": 0})
    a.pipeline_log = log
    db.commit()
    db.refresh(a)
    return a


def recompute_quality(db: Session, a: Assessment) -> FeedbackQualityScore:
    draft = a.draft
    rows, events = [], []
    for cr in a.ratings:
        v = verify_quote(cr.evidence_quote, draft.text)
        cr.quote_status = v["status"]
        rows.append({"criterion_name": cr.criterion_name, "criterion_text": cr.criterion_text, "category": cr.category,
                     "weight": cr.weight, "score": cr.score, "rating": cr.rating, "quote_status": cr.quote_status,
                     "explanation": cr.explanation, "missing": cr.missing, "coaching_question": cr.coaching_question,
                     "issue_type": cr.issue_type})
        for fld in ("explanation", "missing", "coaching_question"):
            chk = integrity_agent.check_output(getattr(cr, fld), draft.text, kind="marker", allowed_quotes=[cr.evidence_quote])
            if not chk["passed"]:
                events.append({"field": fld, "violations": chk["violations"]})
    if a.quality and a.quality.details.get("integrity_violations"):
        events.append({"field": "original", "violations": [{}] * a.quality.details["integrity_violations"]})
    quality = feedback_quality_agent.evaluate(rows, events, {k: v[2] for k, v in CATEGORIES.items()}, mode=a.mode)
    s = quality["scores"]
    fq = a.quality or FeedbackQualityScore(assessment_id=a.id)
    fq.evidence_accuracy, fq.rubric_alignment = s["evidence_accuracy"], s["rubric_alignment"]
    fq.reasoning_quality, fq.feedback_relevance = s["reasoning_quality"], s["feedback_relevance"]
    fq.integrity_compliance, fq.overall, fq.details = s["integrity_compliance"], quality["overall"], quality
    db.add(fq)
    db.commit()
    return fq


def serialize_assessment(db: Session, a: Assessment, include_text: bool = True) -> dict:
    asg = a.assignment
    prev = db.scalar(
        select(Assessment).where(Assessment.assignment_id == a.assignment_id, Assessment.student_id == a.student_id,
                                 Assessment.created_at < a.created_at).order_by(Assessment.created_at.desc())
    )
    review = db.scalar(select(LecturerReview).where(LecturerReview.assessment_id == a.id))
    areas = {ar.rating_id: ar for ar in db.scalars(select(ImprovementArea).where(ImprovementArea.assessment_id == a.id))}
    q = a.quality
    return {
        "id": a.id, "mode": a.mode, "model_name": a.model_name, "weighted_score": a.weighted_score,
        "overall_summary": a.overall_summary, "needs_human_review": a.needs_human_review,
        "shared_with_lecturer": a.shared_with_lecturer, "is_demo": a.is_demo, "created_at": a.created_at.isoformat(),
        "pipeline_log": a.pipeline_log,
        "disclaimer": SIM_DISCLAIMER if a.mode == "simulated" else DISCLAIMER,
        "assignment": {"id": asg.id, "title": asg.title, "module_name": asg.module_name, "number": asg.number,
                       "module_id": asg.module_id, "is_demo": asg.is_demo},
        "draft": {"id": a.draft.id, "round_number": a.draft.round_number, "word_count": a.draft.word_count,
                  "source": a.draft.source, "filename": a.draft.filename, "text": a.draft.text if include_text else None},
        "previous_assessment_id": prev.id if prev else None,
        "ratings": [{
            "id": r.id, "question_id": r.question_id, "criterion_name": r.criterion_name, "criterion_text": r.criterion_text,
            "category": r.category, "section": r.section, "weight": r.weight, "rating": r.rating, "score": r.score,
            "contribution": round(r.score / 5 * r.weight, 1), "evidence_quote": r.evidence_quote,
            "quote_status": r.quote_status, "explanation": r.explanation, "missing": r.missing, "issue_type": r.issue_type,
            "coaching_question": r.coaching_question, "flagged": r.flagged, "flag_reasons": r.flag_reasons,
            "improvement_area_id": areas[r.id].id if r.id in areas else None,
            "improvement_status": areas[r.id].status if r.id in areas else None,
        } for r in a.ratings],
        "quality": None if not q else {
            "overall": q.overall, "is_demonstration": a.is_demo,
            "scores": {"evidence_accuracy": q.evidence_accuracy, "rubric_alignment": q.rubric_alignment,
                       "reasoning_quality": q.reasoning_quality, "feedback_relevance": q.feedback_relevance,
                       "integrity_compliance": q.integrity_compliance},
            "weights": q.details.get("weights"), "labels": q.details.get("labels"),
            "explanations": q.details.get("explanations"), "per_criterion": q.details.get("per_criterion"),
            "disclaimer": q.details.get("disclaimer"), "method": q.details.get("method"), "caps": q.details.get("caps", []),
        },
        "lecturer_review": None if not review else {"items": review.items, "created_at": review.created_at.isoformat()},
    }
