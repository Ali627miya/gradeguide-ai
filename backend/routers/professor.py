"""Lecturer endpoints: modules, assignments, rubric import/config, anonymised analytics, shared-review queue."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import settings
from database.db import get_db
from models.models import (
    Assessment, Assignment, LecturerReview, Module, Rubric, RubricQuestion, User,
)
from routers.common import professor_can_view
from routers.student import rubric_json, save_rubric
from schemas.schemas import ModuleIn, ModulePatch, ProfessorAssignmentIn, RubricIn, ReviewIn
from services import analytics_service
from services.auth_service import require_professor
from services.document_service import ExtractionError, extract_text
from services.rubric_service import (
    RubricError, make_question, parse_csv, parse_json, parse_rubric_text, validate_questions,
)

router = APIRouter(prefix="/api/professor", tags=["professor"])


def _own_module(db: Session, prof: User, module_id: int) -> Module:
    m = db.get(Module, module_id)
    if not m or m.professor_id != prof.id:
        raise HTTPException(404, "Module not found.")
    return m


def _module_json(db: Session, m: Module) -> dict:
    asg = db.scalars(select(Assignment).where(Assignment.module_id == m.id).order_by(Assignment.number)).all()
    return {"id": m.id, "code": m.code, "name": m.name, "analytics_enabled": m.analytics_enabled,
            "min_cohort_size": m.min_cohort_size, "is_demo": m.is_demo,
            "assignments": [{"id": a.id, "title": a.title, "number": a.number, "rubric_id": a.rubric_id,
                             "rubric_name": a.rubric.name, "published": a.published, "description": a.description}
                            for a in asg]}


@router.get("/dashboard")
def dashboard(prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    mods = db.scalars(select(Module).where(Module.professor_id == prof.id).order_by(Module.id)).all()
    summaries = []
    for m in mods:
        an = analytics_service.module_analytics(db, m)
        summaries.append({"module": _module_json(db, m), "status": an["status"],
                          "students_assessed": an.get("students_assessed"),
                          "insights": an.get("insights", []), "teaching_focus": an.get("teaching_focus"),
                          "message": an.get("message")})
    pending = sum(1 for a in db.scalars(select(Assessment).where(Assessment.shared_with_lecturer.is_(True)))
                  if professor_can_view(db, prof, a) and not db.scalar(select(LecturerReview).where(LecturerReview.assessment_id == a.id)))
    return {"user": {"display_name": prof.display_name}, "modules": summaries,
            "rubric_count": db.query(Rubric).filter(Rubric.owner_id == prof.id).count(), "pending_reviews": pending}


# ---------------------------------------------------------------- modules & assignments

@router.get("/modules")
def modules(prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    return [_module_json(db, m) for m in db.scalars(select(Module).where(Module.professor_id == prof.id).order_by(Module.id))]


@router.post("/modules")
def create_module(body: ModuleIn, prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    m = Module(code=body.code.upper(), name=body.name, professor_id=prof.id, min_cohort_size=body.min_cohort_size)
    db.add(m)
    db.commit()
    return _module_json(db, m)


@router.patch("/modules/{module_id}")
def patch_module(module_id: int, body: ModulePatch, prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    m = _own_module(db, prof, module_id)
    if body.analytics_enabled is not None:
        m.analytics_enabled = body.analytics_enabled
    if body.min_cohort_size is not None:
        m.min_cohort_size = body.min_cohort_size
    db.commit()
    return _module_json(db, m)


@router.post("/assignments")
def create_assignment(body: ProfessorAssignmentIn, prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    m = _own_module(db, prof, body.module_id)
    r = db.get(Rubric, body.rubric_id)
    if not r or not (r.owner_id == prof.id or r.is_template):
        raise HTTPException(404, "Rubric not found.")
    a = Assignment(title=body.title, module_id=m.id, module_name=f"{m.code} {m.name}", number=body.number,
                   description=body.description, rubric_id=r.id, created_by=prof.id, published=True)
    db.add(a)
    db.commit()
    return _module_json(db, m)


# ---------------------------------------------------------------- rubrics

@router.get("/rubrics")
def rubrics(prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    rs = db.scalars(select(Rubric).where((Rubric.owner_id == prof.id) | (Rubric.is_template.is_(True))).order_by(Rubric.id)).all()
    return [rubric_json(r) for r in rs]


@router.post("/rubrics")
def create_rubric(body: RubricIn, prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    if body.module_id:
        _own_module(db, prof, body.module_id)
    return rubric_json(save_rubric(db, body, prof, "professor"))


@router.put("/rubrics/{rubric_id}")
def update_rubric(rubric_id: int, body: RubricIn, prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    r = db.get(Rubric, rubric_id)
    if not r or r.owner_id != prof.id:
        raise HTTPException(404, "Rubric not found (templates cannot be edited - save a copy instead).")
    in_use = db.scalar(select(Assessment).join(Assignment, Assessment.assignment_id == Assignment.id)
                       .where(Assignment.rubric_id == r.id).limit(1))
    if in_use:
        raise HTTPException(409, "Students have already been assessed with this rubric. Save your changes as a new rubric "
                                 "so earlier feedback stays consistent.")
    qs = [make_question(q.text, q.weight, q.section, q.short_name, q.category) for q in body.questions]
    errors = validate_questions(qs)
    if errors:
        raise HTTPException(422, " ".join(errors))
    r.name = body.name
    r.questions.clear()
    db.flush()
    for i, q in enumerate(qs):
        r.questions.append(RubricQuestion(position=i, **q))
    db.commit()
    db.refresh(r)
    return rubric_json(r)


@router.post("/rubric/import")
async def import_rubric(file: UploadFile = File(...), section: str = Form(""), _p: User = Depends(require_professor)):
    """Parse a CSV/JSON (or PDF/DOCX/TXT) question file and return a preview. Nothing is saved until the lecturer confirms."""
    name = (file.filename or "").lower()
    data = await file.read()
    sec = section if section in ("code", "report") else None
    try:
        if name.endswith(".csv") or name.endswith(".json"):
            if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
                raise HTTPException(413, "File too large.")
            text = data.decode("utf-8-sig", errors="replace")
            rubric_name, warnings = None, []
            if name.endswith(".csv"):
                qs = parse_csv(text, sec)
            else:
                rubric_name, qs = parse_json(text, sec)
        else:
            text, warnings = extract_text(file.filename or "rubric.txt", data)
            qs, w2 = parse_rubric_text(text)
            warnings += w2
            rubric_name = None
    except (RubricError, ExtractionError) as exc:
        raise HTTPException(422, str(exc)) from exc
    if sec:
        dropped = [q for q in qs if q["section"] != sec]
        qs = [q for q in qs if q["section"] == sec]
        if dropped:
            warnings.append(f"{len(dropped)} question(s) from the other section were ignored.")
    if len([q for q in qs if q["section"] == "code"]) > settings.MAX_QUESTIONS_PER_SECTION or \
            len([q for q in qs if q["section"] == "report"]) > settings.MAX_QUESTIONS_PER_SECTION:
        warnings.append(f"More than {settings.MAX_QUESTIONS_PER_SECTION} questions in a section - remove some before saving.")
    return {"name": rubric_name, "questions": qs, "warnings": warnings, "errors": validate_questions(qs)}


# ---------------------------------------------------------------- analytics

@router.get("/analytics")
def analytics(module_id: int, prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    return analytics_service.module_analytics(db, _own_module(db, prof, module_id))


# ---------------------------------------------------------------- shared reviews (student opt-in only)

@router.get("/reviews")
def reviews(prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    out = []
    for a in db.scalars(select(Assessment).where(Assessment.shared_with_lecturer.is_(True)).order_by(Assessment.created_at.desc())):
        if not professor_can_view(db, prof, a):
            continue
        rv = db.scalar(select(LecturerReview).where(LecturerReview.assessment_id == a.id))
        out.append({
            "assessment_id": a.id, "student": a.student_id and f"Student #{a.student_id:04d}",
            "assignment": f"A{a.assignment.number}: {a.assignment.title}", "module_name": a.assignment.module_name,
            "round": a.draft.round_number, "weighted_score": a.weighted_score, "mode": a.mode,
            "needs_human_review": a.needs_human_review, "draft_text": a.draft.text,
            "ratings": [{"id": r.id, "criterion_name": r.criterion_name, "criterion_text": r.criterion_text,
                         "score": r.score, "rating": r.rating, "evidence_quote": r.evidence_quote,
                         "quote_status": r.quote_status, "explanation": r.explanation, "flagged": r.flagged}
                        for r in a.ratings],
            "review": rv.items if rv else None,
        })
    return out


@router.post("/reviews/{assessment_id}")
def submit_review(assessment_id: int, body: ReviewIn, prof: User = Depends(require_professor), db: Session = Depends(get_db)):
    a = db.get(Assessment, assessment_id)
    if not a or not professor_can_view(db, prof, a):
        raise HTTPException(404, "This submission has not been shared with you.")
    valid = {r.id for r in a.ratings}
    if any(i.rating_id not in valid for i in body.items):
        raise HTTPException(422, "Review items must match this assessment's criteria.")
    rv = db.scalar(select(LecturerReview).where(LecturerReview.assessment_id == a.id)) or \
        LecturerReview(assessment_id=a.id, professor_id=prof.id)
    rv.items = [i.model_dump() for i in body.items]
    db.add(rv)
    db.commit()
    return {"status": "saved", "items": rv.items}
