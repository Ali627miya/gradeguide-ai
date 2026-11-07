"""Health, configuration, demo-login and demo-mode endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from config import settings
from database.db import get_db
from database.seed import init_db, sample_text
from models.models import Assignment, Draft, User
from schemas.schemas import DemoLoginIn
from services.auth_service import current_user, make_token
from services.document_service import word_count

router = APIRouter(prefix="/api", tags=["system"])


def user_json(u: User) -> dict:
    return {"id": u.id, "display_name": u.display_name, "role": u.role, "is_demo": u.is_demo}


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/config")
def config():
    return {
        "ai_mode": "live" if settings.live_ai_available else "simulated",
        "model": settings.OPENAI_MODEL if settings.live_ai_available else "offline-rule-simulator-v1",
        "max_questions_per_section": settings.MAX_QUESTIONS_PER_SECTION,
        "min_cohort_size": settings.MIN_COHORT_SIZE,
        "retention_days": settings.RETENTION_DAYS,
        "max_upload_mb": settings.MAX_UPLOAD_MB,
    }


@router.post("/auth/demo-login")
def demo_login(body: DemoLoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.role == body.role, User.is_demo.is_(True), User.is_synthetic.is_(False)))
    if not u:
        db.close()
        init_db(reset=True)
        u = db.scalar(select(User).where(User.role == body.role, User.is_demo.is_(True), User.is_synthetic.is_(False)))
    return {"token": make_token(u), "user": user_json(u)}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return user_json(user)


@router.get("/demo/samples")
def demo_samples():
    return {
        "label": "DEMONSTRATION DATA - fictional sample coursework",
        "weak_essay": sample_text("a2_testing_report_draft1_WEAK.txt"),
        "improved_essay": sample_text("a2_testing_report_draft2_IMPROVED.txt"),
        "rubric": sample_text("a2_marking_rubric.txt"),
        "code": sample_text("sample_code_submission.py"),
    }


@router.post("/demo/start")
def demo_start(db: Session = Depends(get_db)):
    """Log in as the demo student and open a fresh round-1 draft of the weak sample essay (Assignment 2)."""
    u = db.scalar(select(User).where(User.role == "student", User.is_demo.is_(True), User.is_synthetic.is_(False)))
    if not u:
        db.close()
        init_db(reset=True)
        u = db.scalar(select(User).where(User.role == "student", User.is_demo.is_(True), User.is_synthetic.is_(False)))
    asg = db.scalar(select(Assignment).where(Assignment.is_demo.is_(True), Assignment.title == "Testing Strategy Report"))
    # remove previous demo runs of Assignment 2 so the walkthrough always starts from round 1
    db.execute(delete(Draft).where(Draft.student_id == u.id, Draft.assignment_id == asg.id))
    db.commit()
    text = sample_text("a2_testing_report_draft1_WEAK.txt")
    d = Draft(assignment_id=asg.id, student_id=u.id, round_number=1, text=text, source="demo_sample",
              filename="a2_testing_report_draft1_WEAK.txt", word_count=word_count(text), is_demo=True)
    db.add(d)
    db.commit()
    return {"token": make_token(u), "user": user_json(u), "assignment_id": asg.id, "draft_id": d.id}


@router.post("/demo/reset")
def demo_reset(_user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.close()  # release SQLite locks before dropping tables
    init_db(reset=True)
    return {"status": "reset", "message": "Demo database deleted and re-seeded."}

