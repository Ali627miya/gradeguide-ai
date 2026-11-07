"""Database initialisation and demonstration seed data.

Run directly to (re)create the demo database:
    python -m database.seed            # create tables + seed if empty
    python -m database.seed --reset    # delete everything and re-seed
"""
import random
import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy import delete, select

from config import settings
from database.db import Base, SessionLocal, engine
from models import models as m
from services.document_service import word_count
from services.rubric_service import default_questions, make_question

SAMPLES = Path(__file__).resolve().parent.parent / "sample_data"

A1_QUESTIONS = [
    ("Does the report clearly explain the problem and objectives?", 20, "Problem & objectives"),
    ("Are requirements supported by appropriate evidence and research?", 25, "Evidence & research"),
    ("Are sources referenced accurately and consistently?", 15, "Referencing"),
    ("Does the report critically evaluate design options and limitations?", 20, "Critical evaluation"),
    ("Is the report professionally structured and clearly presented?", 20, "Structure & presentation"),
]
DIST = {
    "evidence": [0.10, 0.35, 0.25, 0.20, 0.10], "referencing": [0.10, 0.30, 0.25, 0.25, 0.10],
    "critical_evaluation": [0.05, 0.25, 0.25, 0.30, 0.15], "problem_objectives": [0.0, 0.05, 0.15, 0.45, 0.35],
    "testing": [0.05, 0.10, 0.20, 0.40, 0.25], "methodology": [0.05, 0.20, 0.30, 0.30, 0.15],
}
DEFAULT_DIST = [0.05, 0.15, 0.30, 0.30, 0.20]


def sample_text(name: str) -> str:
    return (SAMPLES / name).read_text(encoding="utf-8")


def _rubric(db, name, questions, owner_id, module_id=None, template=False, source="professor"):
    r = m.Rubric(name=name, owner_id=owner_id, module_id=module_id, is_template=template, is_demo=True, source=source)
    for i, q in enumerate(questions):
        r.questions.append(m.RubricQuestion(position=i, **q))
    db.add(r)
    db.flush()
    return r


def _synthetic_assessment(db, rng, student, asg, round_no, scores_by_q, when):
    d = m.Draft(assignment_id=asg.id, student_id=student.id, round_number=round_no, is_demo=True, source="demo_sample",
                text="[Synthetic demonstration record - no real submission text is stored for the seeded cohort.]",
                word_count=0, created_at=when)
    db.add(d)
    db.flush()
    qs = asg.rubric.questions
    ws = round(sum(scores_by_q[q.id] / 5 * q.weight for q in qs), 1)
    a = m.Assessment(draft_id=d.id, assignment_id=asg.id, student_id=student.id, mode="simulated",
                     model_name="synthetic-cohort-seed", weighted_score=ws, is_demo=True, created_at=when,
                     overall_summary="Synthetic demonstration record.", pipeline_log=[])
    db.add(a)
    db.flush()
    for i, q in enumerate(qs):
        s = scores_by_q[q.id]
        db.add(m.CriterionRating(
            assessment_id=a.id, question_id=q.id, position=i, criterion_name=q.short_name, criterion_text=q.text,
            category=q.category, section=q.section, weight=q.weight, score=s,
            rating="STRONG" if s >= 4 else "OKAY" if s == 3 else "WEAK", evidence_quote="", quote_status="none",
            explanation="Synthetic demonstration record used only for aggregate analytics.", missing="",
            issue_type="good" if s >= 4 else "missing", coaching_question="Synthetic record?"))


def seed(db) -> None:
    from services.assessment_service import run_assessment  # local import avoids cycles

    rng = random.Random(42)
    prof = m.User(display_name="Dr. Morgan (Demo Lecturer)", role="professor", is_demo=True)
    prof.professor_profile = m.ProfessorProfile(department="Computer Science (demo)")
    alex = m.User(display_name="Alex (Demo Student)", role="student", is_demo=True)
    alex.student_profile = m.StudentProfile(programme="BSc Computer Science (demo)")
    db.add_all([prof, alex])
    db.flush()

    _rubric(db, "Template - Code assessment (6 questions)", default_questions("code"), None, template=True, source="template")
    _rubric(db, "Template - Report assessment (6 questions)", default_questions("report"), None, template=True, source="template")

    se = m.Module(code="SE201", name="Software Engineering", professor_id=prof.id, analytics_enabled=True,
                  min_cohort_size=settings.MIN_COHORT_SIZE, is_demo=True)
    ds = m.Module(code="SE210", name="Data Structures", professor_id=prof.id, analytics_enabled=True,
                  min_cohort_size=settings.MIN_COHORT_SIZE, is_demo=True)
    db.add_all([se, ds])
    db.flush()

    r1 = _rubric(db, "SE201 A1 - Requirements report rubric",
                 [make_question(t, w, "report", n) for t, w, n in A1_QUESTIONS], prof.id, se.id)
    r2 = _rubric(db, "SE201 A2 - Testing strategy report rubric", default_questions("report"), prof.id, se.id)
    r3 = _rubric(db, "SE201 A3 - Implementation (code) rubric", default_questions("code"), prof.id, se.id)
    r4 = _rubric(db, "SE210 A1 - Linked lists (code) rubric", default_questions("code"), prof.id, ds.id)

    def asg(title, module, n, rubric, desc):
        a = m.Assignment(title=title, module_id=module.id, module_name=f"{module.code} {module.name}", number=n,
                         description=desc, rubric_id=rubric.id, created_by=prof.id, published=True, is_demo=True)
        db.add(a)
        db.flush()
        return a

    a1 = asg("Requirements & Design Report", se, 1, r1, "Specify and justify the requirements for the CampusBook room-booking app.")
    a2 = asg("Testing Strategy Report", se, 2, r2, "Explain, justify and critically evaluate the testing strategy used for CampusBook.")
    a3 = asg("CampusBook Implementation", se, 3, r3, "Submit the core booking module with tests.")
    d1 = asg("Linked List Implementation", ds, 1, r4, "Implement and test a singly linked list.")
    db.add_all([m.Enrollment(student_id=alex.id, module_id=se.id), m.Enrollment(student_id=alex.id, module_id=ds.id)])

    # Alex's earlier Assignment 1 - genuinely assessed by the offline simulator at seed time.
    text = sample_text("a1_requirements_report.txt")
    draft = m.Draft(assignment_id=a1.id, student_id=alex.id, round_number=1, text=text, filename="a1_requirements_report.txt",
                    source="demo_sample", word_count=word_count(text), is_demo=True)
    db.add(draft)
    db.flush()
    db.refresh(draft)
    res = run_assessment(db, draft, force_offline=True, is_demo=True)
    earlier = res.created_at - timedelta(days=42)
    res.created_at = earlier
    draft.created_at = earlier

    # Synthetic, anonymised cohort for the lecturer dashboard (clearly labelled demonstration data).
    base_time = res.created_at
    for i in range(40):
        s = m.User(display_name=f"Synthetic student {i + 1:03d}", role="student", is_demo=True, is_synthetic=True)
        s.student_profile = m.StudentProfile(consent_aggregate_analytics=(i % 13 != 0))
        db.add(s)
        db.flush()
        db.add(m.Enrollment(student_id=s.id, module_id=se.id))
        for asg_obj, offset in ((a1, 0), (a2, 21), (a3, 35)):
            scores = {q.id: rng.choices([1, 2, 3, 4, 5], DIST.get(q.category, DEFAULT_DIST))[0] for q in asg_obj.rubric.questions}
            when = base_time + timedelta(days=offset, hours=rng.randint(0, 48))
            _synthetic_assessment(db, rng, s, asg_obj, 1, scores, when)
            if asg_obj is a2 and rng.random() < 0.6:
                better = {k: min(5, v + (1 if rng.random() < 0.55 else 0)) for k, v in scores.items()}
                _synthetic_assessment(db, rng, s, asg_obj, 2, better, when + timedelta(days=4))
    for i in range(3):  # tiny cohort -> results must be suppressed
        s = m.User(display_name=f"Synthetic DS student {i + 1}", role="student", is_demo=True, is_synthetic=True)
        s.student_profile = m.StudentProfile()
        db.add(s)
        db.flush()
        db.add(m.Enrollment(student_id=s.id, module_id=ds.id))
        _synthetic_assessment(db, rng, s, d1, 1, {q.id: rng.randint(2, 5) for q in d1.rubric.questions}, base_time)
    db.commit()


def init_db(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if settings.AUTO_SEED and db.scalar(select(m.User).limit(1)) is None:
            seed(db)
        purge_expired(db)


def purge_expired(db) -> int:
    """Delete non-demo drafts older than RETENTION_DAYS (assessments cascade)."""
    from models.models import now

    cutoff = now() - timedelta(days=settings.RETENTION_DAYS)
    ids = db.scalars(select(m.Draft.id).where(m.Draft.is_demo.is_(False), m.Draft.created_at < cutoff)).all()
    if ids:
        db.execute(delete(m.Draft).where(m.Draft.id.in_(ids)))
        db.commit()
    return len(ids)


if __name__ == "__main__":
    do_reset = "--reset" in sys.argv
    init_db(reset=do_reset)
    print("Database reset and demo data seeded." if do_reset else "Database ready.")
