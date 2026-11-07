"""Draft-to-draft and Assignment-to-Assignment progress comparisons."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from models.models import Assessment, Assignment, AssignmentComparison
from services.rubric_service import category_label

# Categories that are related but not identical across differently-worded rubrics.
RELATED = {frozenset({"referencing", "evidence"}): "One rubric assesses referencing separately; the other combines it with evidence.",
           frozenset({"argument", "problem_objectives"}): "Argument and problem/objectives overlap but are not the same criterion."}


def _msg(name: str, f: int, t: int, kind: str) -> str:
    since = "since your previous draft" if kind == "draft" else "since your earlier assignment"
    d = t - f
    if d >= 2:
        return f"Your {name.lower()} has improved significantly {since} ({f}/5 → {t}/5)."
    if d == 1:
        return f"Your {name.lower()} has improved {since} ({f}/5 → {t}/5)."
    if d < 0:
        return f"{name} has dropped {since} ({f}/5 → {t}/5) - worth revisiting."
    if t <= 2:
        return f"{name} remains an area to focus on (still {t}/5)."
    return f"{name} is unchanged at {t}/5."


def compare(db: Session, a_from: Assessment, a_to: Assessment, save: bool = True) -> dict:
    kind = "draft" if a_from.assignment_id == a_to.assignment_id else "assignment"
    same_rubric = a_from.assignment.rubric_id == a_to.assignment.rubric_id
    rows, unmatched_from, used_to = [], [], set()
    to_by_q = {r.question_id: r for r in a_to.ratings}
    to_by_cat: dict[str, list] = {}
    for r in a_to.ratings:
        to_by_cat.setdefault(r.category, []).append(r)
    for rf in a_from.ratings:
        match, basis, note = None, None, ""
        if same_rubric and rf.question_id in to_by_q:
            match, basis = to_by_q[rf.question_id], "same_question"
        elif rf.category != "general" and to_by_cat.get(rf.category):
            match = next((x for x in to_by_cat[rf.category] if x.id not in used_to), None)
            basis = "equivalent_category"
        if match is None:
            for pair, why in RELATED.items():
                if rf.category in pair:
                    other = next(iter(pair - {rf.category}))
                    cand = next(iter(to_by_cat.get(other, [])), None)
                    if cand:
                        match, basis, note = cand, "related_category", why
                        break
        if match is None:
            unmatched_from.append({"criterion": rf.criterion_name, "score": rf.score,
                                   "reason": "No equivalent criterion in the newer rubric, so a comparison is unavailable."})
            continue
        if basis != "related_category":
            used_to.add(match.id)
        delta = match.score - rf.score
        name = category_label(rf.category) if basis != "same_question" else rf.criterion_name
        rows.append({
            "criterion": rf.criterion_name, "to_criterion": match.criterion_name, "category": rf.category,
            "from_score": rf.score, "to_score": match.score, "delta": delta,
            "from_rating": rf.rating, "to_rating": match.rating, "basis": basis, "note": note,
            "status": "improved" if delta > 0 else "declined" if delta < 0 else "unchanged",
            "message": (_msg(name, rf.score, match.score, kind) + (f" (Partial match: {note})" if note else "")),
        })
    unmatched_to = [{"criterion": r.criterion_name, "score": r.score,
                     "reason": "New criterion - not assessed in the earlier work."}
                    for r in a_to.ratings if r.id not in used_to and not any(x["to_criterion"] == r.criterion_name for x in rows)]
    result = {
        "kind": kind, "same_rubric": same_rubric,
        "from": {"assessment_id": a_from.id, "title": a_from.assignment.title, "number": a_from.assignment.number,
                 "round": a_from.draft.round_number, "weighted_score": a_from.weighted_score, "mode": a_from.mode},
        "to": {"assessment_id": a_to.id, "title": a_to.assignment.title, "number": a_to.assignment.number,
               "round": a_to.draft.round_number, "weighted_score": a_to.weighted_score, "mode": a_to.mode},
        "weighted_delta": round(a_to.weighted_score - a_from.weighted_score, 1) if same_rubric else None,
        "rows": rows, "unmatched_from": unmatched_from, "unmatched_to": unmatched_to,
        "improved": [r["criterion"] for r in rows if r["status"] == "improved"],
        "still_needs_attention": [r["to_criterion"] for r in rows if r["to_score"] <= 3] +
                                 [u["criterion"] for u in unmatched_to if u["score"] <= 3],
        "note": None if same_rubric else
        "These assignments use different rubrics. Criteria are only compared where they assess the same skill; "
        "overall percentages are not directly comparable.",
        "modes_differ": a_from.mode != a_to.mode,
    }
    if save:
        db.add(AssignmentComparison(student_id=a_to.student_id, from_assessment_id=a_from.id,
                                    to_assessment_id=a_to.id, kind=kind, result=result))
        db.commit()
    return result


def latest_per_assignment(db: Session, student_id: int) -> list[Assessment]:
    rows = db.scalars(select(Assessment).where(Assessment.student_id == student_id).order_by(Assessment.created_at)).all()
    latest: dict[int, Assessment] = {}
    for a in rows:
        latest[a.assignment_id] = a
    return list(latest.values())


def module_progress(db: Session, student_id: int) -> list[dict]:
    """For each module, compare consecutive assignments (latest draft of each)."""
    by_module: dict[str, list[Assessment]] = {}
    for a in latest_per_assignment(db, student_id):
        by_module.setdefault(a.assignment.module_name, []).append(a)
    out = []
    for module, items in by_module.items():
        items.sort(key=lambda a: (a.assignment.number, a.created_at))
        comps = []
        for prev, nxt in zip(items, items[1:]):
            if prev.assignment.number == nxt.assignment.number:
                continue
            comps.append(compare(db, prev, nxt, save=False))
        out.append({
            "module": module,
            "assignments": [{"assessment_id": a.id, "assignment_id": a.assignment_id, "title": a.assignment.title,
                             "number": a.assignment.number, "weighted_score": a.weighted_score, "mode": a.mode,
                             "round": a.draft.round_number, "is_demo": a.is_demo, "created_at": a.created_at.isoformat()}
                            for a in items],
            "comparisons": comps,
            "comparison_unavailable": None if comps else "Assess at least two different assignments in this module to see progress between them.",
        })
    return out


def assignment_of(db: Session, assignment_id: int) -> Assignment | None:
    return db.get(Assignment, assignment_id)
