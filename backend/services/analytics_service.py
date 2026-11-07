"""Anonymised, aggregate class analytics with consent and minimum-cohort-size protection."""
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.models import Assessment, Assignment, Module, StudentProfile


def _round5(x: float) -> int:
    return int(5 * round(x / 5))


def module_analytics(db: Session, module: Module) -> dict:
    base = {"module": {"id": module.id, "code": module.code, "name": module.name, "is_demo": module.is_demo,
                       "analytics_enabled": module.analytics_enabled, "min_cohort_size": module.min_cohort_size}}
    if not module.analytics_enabled:
        return {**base, "status": "consent_required",
                "message": "Class analytics are switched off for this module. Enable them to see anonymised aggregate insights."}
    assignments = db.scalars(select(Assignment).where(Assignment.module_id == module.id, Assignment.published.is_(True))
                             .order_by(Assignment.number)).all()
    consenting = {p.user_id for p in db.scalars(select(StudentProfile).where(StudentProfile.consent_aggregate_analytics.is_(True)))}
    latest: dict[tuple[int, int], Assessment] = {}
    first: dict[tuple[int, int], Assessment] = {}
    for asg in assignments:
        for a in db.scalars(select(Assessment).where(Assessment.assignment_id == asg.id).order_by(Assessment.created_at)):
            if a.student_id not in consenting:
                continue
            key = (asg.id, a.student_id)
            first.setdefault(key, a)
            latest[key] = a
    students = {sid for (_, sid) in latest}
    n = len(students)
    if n < module.min_cohort_size:
        return {**base, "status": "suppressed", "students_assessed": None,
                "message": f"Fewer than {module.min_cohort_size} students have consented and been assessed, so results are "
                           "hidden to protect individual privacy."}
    # one score per student per criterion (their most recent), so students are never double-counted
    crit = defaultdict(lambda: {"by_student": {}, "section": "report"})
    for a in sorted(latest.values(), key=lambda x: x.created_at):
        for r in a.ratings:
            crit[r.criterion_name]["by_student"][a.student_id] = r.score
            crit[r.criterion_name]["section"] = r.section
    criteria = []
    for name, d in crit.items():
        s = list(d["by_student"].values())
        if len(s) < module.min_cohort_size:
            continue  # suppress small sub-groups too
        k = len(s)
        weak, okay, strong = (sum(1 for x in s if x <= 2), sum(1 for x in s if x == 3), sum(1 for x in s if x >= 4))
        weak_p, okay_p = _round5(100 * weak / k), _round5(100 * okay / k)
        criteria.append({
            "criterion": name, "section": d["section"], "n": "5+" if k < 10 else k,
            "average": round(sum(s) / k, 1),
            "needs_improvement_pct": min(100, weak_p + okay_p),
            "weak_pct": weak_p, "okay_pct": okay_p, "strong_pct": max(0, 100 - weak_p - okay_p),
        })
    criteria.sort(key=lambda c: -c["needs_improvement_pct"])
    trends = []
    for asg in assignments:
        keys = [k for k in latest if k[0] == asg.id]
        if len(keys) < module.min_cohort_size:
            trends.append({"assignment": f"A{asg.number}: {asg.title}", "status": "suppressed"})
            continue
        f = [first[k].weighted_score for k in keys]
        l_ = [latest[k].weighted_score for k in keys]
        revised = sum(1 for k in keys if first[k].id != latest[k].id)
        trends.append({"assignment": f"A{asg.number}: {asg.title}", "status": "ok", "students": len(keys),
                       "avg_first_draft": round(sum(f) / len(f), 1), "avg_latest_draft": round(sum(l_) / len(l_), 1),
                       "revised_pct": _round5(100 * revised / len(keys))})
    insights = [f"{c['needs_improvement_pct']}% need improvement in {c['criterion'].lower()}." for c in criteria[:3]]
    strong = sorted(criteria, key=lambda c: -c["strong_pct"])
    if strong:
        insights.append(f"{strong[0]['strong_pct']}% demonstrate strong {strong[0]['criterion'].lower()}.")
    focus = criteria[0]["criterion"] if criteria else None
    return {**base, "status": "ok", "students_assessed": n, "criteria": criteria, "trends": trends, "insights": insights,
            "teaching_focus": None if not focus else
            f"Suggested teaching focus: spend additional time on {focus.lower()} in the next lecture - "
            f"{criteria[0]['needs_improvement_pct']}% of the class are not yet rated strong here.",
            "privacy_note": f"Aggregated across {n} consenting students. Percentages are rounded to the nearest 5% and any "
                            f"group smaller than {module.min_cohort_size} is hidden. No individual submissions are shown."}
