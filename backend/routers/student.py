"""Student endpoints: uploads, assignments, drafts, dashboard, history, progress, improvement checklist, data deletion."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from database.db import get_db
from models.models import (
    Assessment, Assignment, Draft, Enrollment, ImprovementArea, Rubric, RubricQuestion, User, now,
)
from routers.common import own_area, own_draft, student_can_use_assignment
from schemas.schemas import AssignmentIn, DraftIn, ImprovementPatch, RubricIn, RubricTextIn
from services import progress_service
from services.auth_service import current_user, require_student
from services.document_service import ExtractionError, extract_text, word_count
from services.rubric_service import RubricError, make_question, parse_csv, parse_json, parse_rubric_text, validate_questions

router = APIRouter(prefix="/api", tags=["student"])


def rubric_json(r: Rubric) -> dict:
    return {"id": r.id, "name": r.name, "module_id": r.module_id, "is_template": r.is_template, "source": r.source,
            "is_demo": r.is_demo,
            "questions": [{"id": q.id, "section": q.section, "text": q.text, "short_name": q.short_name,
                           "category": q.category, "weight": q.weight, "position": q.position} for q in r.questions]}


def save_rubric(db: Session, body: RubricIn, owner: User, source: str) -> Rubric:
    qs = [make_question(q.text, q.weight, q.section, q.short_name, q.category) for q in body.questions]
    errors = validate_questions(qs)
    if errors:
        raise HTTPException(422, " ".join(errors))
    r = Rubric(name=body.name, owner_id=owner.id, module_id=body.module_id, source=source)
    for i, q in enumerate(qs):
        r.questions.append(RubricQuestion(position=i, **q))
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ---------------------------------------------------------------- uploads & rubric parsing (any logged-in user)

@router.post("/upload")
async def upload(file: UploadFile = File(...), kind: str = Form("draft"), _u: User = Depends(current_user)):
    data = await file.read()
    try:
        text, warnings = extract_text(file.filename or "upload.txt", data)
    except ExtractionError as exc:
        raise HTTPException(422, str(exc)) from exc
    out = {"filename": file.filename, "text": text, "word_count": word_count(text), "warnings": warnings}
    if kind == "rubric":
        try:
            name = (file.filename or "").lower()
            if name.endswith(".csv"):
                qs, w2 = parse_csv(text), []
            elif name.endswith(".json"):
                qs, w2 = parse_json(text)[1], []
            else:
                qs, w2 = parse_rubric_text(text)
        except RubricError as exc:
            raise HTTPException(422, str(exc)) from exc
        out.update({"questions": qs, "warnings": warnings + w2, "errors": validate_questions(qs)})
    return out


@router.post("/rubrics/parse-text")
def parse_text(body: RubricTextIn, _u: User = Depends(current_user)):
    try:
        qs, warnings = parse_rubric_text(body.text)
    except RubricError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"questions": qs, "warnings": warnings, "errors": validate_questions(qs)}


# ---------------------------------------------------------------- rubrics & assignments

@router.get("/student/rubrics")
def student_rubrics(user: User = Depends(require_student), db: Session = Depends(get_db)):
    mods = [e.module_id for e in db.scalars(select(Enrollment).where(Enrollment.student_id == user.id))]
    rs = db.scalars(select(Rubric).where(or_(Rubric.is_template.is_(True), Rubric.owner_id == user.id,
                                             Rubric.module_id.in_(mods or [-1]))).order_by(Rubric.id)).all()
    return [rubric_json(r) for r in rs]


@router.get("/rubrics/{rubric_id}")
def get_rubric(rubric_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(Rubric, rubric_id)
    if not r:
        raise HTTPException(404, "Rubric not found.")
    if user.role == "student" and not (r.is_template or r.owner_id == user.id or (
            r.module_id and db.query(Enrollment).filter_by(student_id=user.id, module_id=r.module_id).first())):
        raise HTTPException(403, "You do not have access to this rubric.")
    return rubric_json(r)


@router.post("/student/rubrics")
def create_student_rubric(body: RubricIn, user: User = Depends(require_student), db: Session = Depends(get_db)):
    body.module_id = None
    return rubric_json(save_rubric(db, body, user, "student_upload"))


def assignment_json(db: Session, a: Assignment, student_id: int) -> dict:
    ass = db.scalars(select(Assessment).where(Assessment.assignment_id == a.id, Assessment.student_id == student_id)
                     .order_by(Assessment.created_at)).all()
    drafts = db.scalars(select(Draft).where(Draft.assignment_id == a.id, Draft.student_id == student_id)
                        .order_by(Draft.round_number)).all()
    return {
        "id": a.id, "title": a.title, "module_name": a.module_name, "module_id": a.module_id, "number": a.number,
        "description": a.description, "rubric_id": a.rubric_id, "rubric_name": a.rubric.name, "published": a.published,
        "is_demo": a.is_demo,
        "drafts": [{"id": d.id, "round_number": d.round_number, "word_count": d.word_count, "source": d.source,
                    "created_at": d.created_at.isoformat(),
                    "assessment_id": next((x.id for x in ass if x.draft_id == d.id), None)} for d in drafts],
        "assessments": [{"id": x.id, "weighted_score": x.weighted_score, "round": x.draft.round_number, "mode": x.mode,
                         "created_at": x.created_at.isoformat()} for x in ass],
        "latest_score": ass[-1].weighted_score if ass else None,
    }


@router.get("/student/assignments")
def list_assignments(user: User = Depends(require_student), db: Session = Depends(get_db)):
    mods = [e.module_id for e in db.scalars(select(Enrollment).where(Enrollment.student_id == user.id))]
    rows = db.scalars(select(Assignment).where(or_(Assignment.created_by == user.id,
                                                   (Assignment.published.is_(True)) & Assignment.module_id.in_(mods or [-1])))
                      .order_by(Assignment.module_name, Assignment.number)).all()
    return [assignment_json(db, a, user.id) for a in rows]


@router.get("/student/assignments/{assignment_id}")
def get_assignment(assignment_id: int, user: User = Depends(require_student), db: Session = Depends(get_db)):
    a = student_can_use_assignment(db, user, db.get(Assignment, assignment_id))
    out = assignment_json(db, a, user.id)
    out["rubric"] = rubric_json(a.rubric)
    return out


@router.post("/student/assignments")
def create_assignment(body: AssignmentIn, user: User = Depends(require_student), db: Session = Depends(get_db)):
    if body.rubric_id:
        r = db.get(Rubric, body.rubric_id)
        get_rubric(body.rubric_id, user, db)  # access check
    elif body.rubric:
        r = save_rubric(db, body.rubric, user, "student_upload")
    else:
        raise HTTPException(422, "Choose a rubric or upload your lecturer's rubric.")
    a = Assignment(title=body.title, module_name=body.module_name, number=body.number, description=body.description,
                   rubric_id=r.id, created_by=user.id, published=False)
    db.add(a)
    db.commit()
    db.refresh(a)
    return assignment_json(db, a, user.id)


# ---------------------------------------------------------------- drafts

@router.post("/student/drafts")
def create_draft(body: DraftIn, user: User = Depends(require_student), db: Session = Depends(get_db)):
    a = student_can_use_assignment(db, user, db.get(Assignment, body.assignment_id))
    last = db.scalar(select(Draft).where(Draft.assignment_id == a.id, Draft.student_id == user.id)
                     .order_by(Draft.round_number.desc()))
    d = Draft(assignment_id=a.id, student_id=user.id, round_number=(last.round_number + 1) if last else 1,
              text=body.text.strip(), filename=body.filename, source=body.source, word_count=word_count(body.text),
              is_demo=a.is_demo and body.source == "demo_sample")
    db.add(d)
    db.commit()
    return {"id": d.id, "round_number": d.round_number, "word_count": d.word_count, "assignment_id": a.id}


@router.get("/student/drafts/{draft_id}")
def get_draft(draft_id: int, user: User = Depends(require_student), db: Session = Depends(get_db)):
    d = own_draft(db, user, draft_id)
    a = db.scalar(select(Assessment).where(Assessment.draft_id == d.id))
    return {"id": d.id, "assignment_id": d.assignment_id, "round_number": d.round_number, "text": d.text,
            "word_count": d.word_count, "source": d.source, "filename": d.filename, "is_demo": d.is_demo,
            "assessment_id": a.id if a else None, "assignment_title": d.assignment.title,
            "module_name": d.assignment.module_name}


# ---------------------------------------------------------------- dashboard, history, progress

@router.get("/student/dashboard")
def dashboard(user: User = Depends(require_student), db: Session = Depends(get_db)):
    all_a = db.scalars(select(Assessment).where(Assessment.student_id == user.id).order_by(Assessment.created_at)).all()
    latest = progress_service.latest_per_assignment(db, user.id)
    avg = round(sum(a.weighted_score for a in latest) / len(latest), 1) if latest else None
    improvements = []
    for asg_id in {a.assignment_id for a in all_a}:
        rounds = [a for a in all_a if a.assignment_id == asg_id]
        if len(rounds) > 1:
            improvements.append(rounds[-1].weighted_score - rounds[0].weighted_score)
    open_areas = db.scalars(select(ImprovementArea).where(ImprovementArea.student_id == user.id,
                                                          ImprovementArea.status != "completed")).all()
    latest_ids = {a.id for a in latest}
    outstanding = [{"id": x.id, "criterion_name": x.criterion_name, "status": x.status, "assessment_id": x.assessment_id,
                    "assignment_title": db.get(Assessment, x.assessment_id).assignment.title}
                   for x in open_areas if x.assessment_id in latest_ids]
    return {
        "user": {"display_name": user.display_name, "is_demo": user.is_demo},
        "total_assessed": len({a.assignment_id for a in all_a}), "total_assessments": len(all_a),
        "average_score": avg,
        "improvement_since_previous": round(sum(improvements) / len(improvements), 1) if improvements else None,
        "outstanding_areas": outstanding,
        "recent": [{"assessment_id": a.id, "assignment_id": a.assignment_id, "title": a.assignment.title,
                    "module_name": a.assignment.module_name, "number": a.assignment.number,
                    "round": a.draft.round_number, "weighted_score": a.weighted_score, "mode": a.mode,
                    "is_demo": a.is_demo, "created_at": a.created_at.isoformat()} for a in reversed(all_a[-6:])],
        "progress": [{"label": f"{a.assignment.title[:14]} A{a.assignment.number}·R{a.draft.round_number}", "score": a.weighted_score,
                      "title": a.assignment.title, "date": a.created_at.isoformat()} for a in all_a],
    }


@router.get("/student/history")
def history(user: User = Depends(require_student), db: Session = Depends(get_db)):
    all_a = db.scalars(select(Assessment).where(Assessment.student_id == user.id).order_by(Assessment.created_at.desc())).all()
    return [{"assessment_id": a.id, "assignment_id": a.assignment_id, "title": a.assignment.title,
             "module_name": a.assignment.module_name, "number": a.assignment.number, "round": a.draft.round_number,
             "weighted_score": a.weighted_score, "mode": a.mode, "is_demo": a.is_demo,
             "needs_human_review": a.needs_human_review, "created_at": a.created_at.isoformat(),
             "ratings": [{"criterion": r.criterion_name, "rating": r.rating, "score": r.score} for r in a.ratings]}
            for a in all_a]


@router.get("/student/progress")
def progress(user: User = Depends(require_student), db: Session = Depends(get_db)):
    return progress_service.module_progress(db, user.id)


# ---------------------------------------------------------------- improvement checklist

def area_json(db: Session, x: ImprovementArea) -> dict:
    a = db.get(Assessment, x.assessment_id)
    r = next((r for r in a.ratings if r.id == x.rating_id), None)
    return {"id": x.id, "criterion_name": x.criterion_name, "category": x.category, "status": x.status,
            "student_plan": x.student_plan, "assessment_id": x.assessment_id, "assignment_title": a.assignment.title,
            "assignment_id": a.assignment_id, "round": a.draft.round_number, "is_demo": a.is_demo,
            "rating": r.rating if r else None, "score": r.score if r else None,
            "coaching_question": r.coaching_question if r else "", "missing": r.missing if r else "",
            "created_at": x.created_at.isoformat(), "completed_at": x.completed_at.isoformat() if x.completed_at else None}


@router.get("/student/improvements")
def improvements(user: User = Depends(require_student), db: Session = Depends(get_db)):
    xs = db.scalars(select(ImprovementArea).where(ImprovementArea.student_id == user.id)
                    .order_by(ImprovementArea.created_at.desc())).all()
    return [area_json(db, x) for x in xs]


@router.patch("/student/improvements/{area_id}")
def update_improvement(area_id: int, body: ImprovementPatch, user: User = Depends(require_student),
                       db: Session = Depends(get_db)):
    x = own_area(db, user, area_id)
    if body.status:
        x.status = body.status
        x.completed_at = now() if body.status == "completed" else None
    if body.student_plan is not None:
        x.student_plan = body.student_plan
        if x.status == "open" and body.student_plan.strip():
            x.status = "in_progress"
    db.commit()
    return area_json(db, x)


# ---------------------------------------------------------------- privacy

@router.delete("/student/data")
def delete_my_data(user: User = Depends(require_student), db: Session = Depends(get_db)):
    """Delete every draft (and, by cascade, assessments, coaching and comparisons) and private rubrics/assignments."""
    n = db.query(Draft).filter(Draft.student_id == user.id).count()
    db.execute(delete(Draft).where(Draft.student_id == user.id))
    own_asg = db.scalars(select(Assignment).where(Assignment.created_by == user.id)).all()
    rubric_ids = {a.rubric_id for a in own_asg}
    for a in own_asg:
        db.delete(a)
    db.flush()
    for rid in rubric_ids:
        r = db.get(Rubric, rid)
        if r and r.owner_id == user.id and not db.scalar(select(Assignment).where(Assignment.rubric_id == rid)):
            db.delete(r)
    db.commit()
    return {"deleted_drafts": n, "message": "All your drafts, assessments, coaching conversations and private rubrics were deleted."}



