"""Assessment, comparison, feedback-quality, integrity and coaching endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from agents import coach_agent, integrity_agent
from database.db import get_db
from models.models import Assessment, CoachingConversation, CoachingMessage, User
from routers.common import own_area, own_assessment, own_draft
from schemas.schemas import AnalyseIn, CoachIn, CompareIn, FeedbackQualityIn, IntegrityCheckIn
from services import assessment_service, progress_service
from services.auth_service import current_user, require_student

router = APIRouter(prefix="/api", tags=["assessment"])


@router.post("/assessment/analyse")
def analyse(body: AnalyseIn, user: User = Depends(require_student), db: Session = Depends(get_db)):
    d = own_draft(db, user, body.draft_id)
    existing = db.scalar(select(Assessment).where(Assessment.draft_id == d.id))
    if existing:
        return assessment_service.serialize_assessment(db, existing)
    a = assessment_service.run_assessment(db, d, force_offline=body.force_offline)
    return assessment_service.serialize_assessment(db, a)


@router.get("/assessment/{assessment_id}")
def get_assessment(assessment_id: int, user: User = Depends(require_student), db: Session = Depends(get_db)):
    return assessment_service.serialize_assessment(db, own_assessment(db, user, assessment_id))


@router.post("/assessment/{assessment_id}/share")
def share(assessment_id: int, user: User = Depends(require_student), db: Session = Depends(get_db)):
    a = own_assessment(db, user, assessment_id)
    if not a.assignment.module_id:
        raise HTTPException(422, "Only assignments published by a lecturer in GradeGuide can be shared for review.")
    a.shared_with_lecturer = not a.shared_with_lecturer
    db.commit()
    return {"shared_with_lecturer": a.shared_with_lecturer}


@router.post("/assessment/compare")
def compare(body: CompareIn, user: User = Depends(require_student), db: Session = Depends(get_db)):
    a_from = own_assessment(db, user, body.from_assessment_id)
    a_to = own_assessment(db, user, body.to_assessment_id)
    return progress_service.compare(db, a_from, a_to)


@router.post("/feedback-quality/evaluate")
def evaluate_quality(body: FeedbackQualityIn, user: User = Depends(require_student), db: Session = Depends(get_db)):
    a = own_assessment(db, user, body.assessment_id)
    assessment_service.recompute_quality(db, a)
    db.refresh(a)
    return assessment_service.serialize_assessment(db, a, include_text=False)["quality"]


@router.get("/integrity/policy")
def policy():
    return integrity_agent.POLICY


@router.post("/integrity/check")
def integrity_check(body: IntegrityCheckIn, _u: User = Depends(current_user)):
    req = integrity_agent.screen_request(body.text)
    out = integrity_agent.check_output(body.text, body.source_text, body.kind)
    return {"request_screen": req, "output_check": out,
            "safe_response": integrity_agent.safe_response() if (req["blocked"] or not out["passed"]) else None}


def _area_context(db: Session, area) -> tuple[dict, str]:
    a = db.get(Assessment, area.assessment_id)
    r = next(r for r in a.ratings if r.id == area.rating_id)
    ctx = {"criterion_name": r.criterion_name, "criterion_text": r.criterion_text, "category": r.category,
           "weight": r.weight, "rating": r.rating, "score": r.score, "explanation": r.explanation,
           "missing": r.missing, "evidence_quote": r.evidence_quote, "quote_status": r.quote_status,
           "coaching_question": r.coaching_question}
    return ctx, a.draft.text


def _conversation_json(convo: CoachingConversation, area, ctx) -> dict:
    return {"conversation_id": convo.id, "improvement_area_id": area.id, "status": area.status,
            "student_plan": area.student_plan, "criterion": ctx,
            "messages": [{"id": m.id, "role": m.role, "content": m.content, "questions": m.questions, "mode": m.mode,
                          "integrity_action": m.integrity_action, "created_at": m.created_at.isoformat()}
                         for m in convo.messages]}


@router.get("/coach/{area_id}")
def get_conversation(area_id: int, user: User = Depends(require_student), db: Session = Depends(get_db)):
    area = own_area(db, user, area_id)
    ctx, _ = _area_context(db, area)
    convo = db.scalar(select(CoachingConversation).where(CoachingConversation.improvement_area_id == area.id))
    if not convo:
        convo = CoachingConversation(improvement_area_id=area.id, student_id=user.id)
        db.add(convo)
        db.flush()
        op = coach_agent.opening(ctx)
        db.add(CoachingMessage(conversation_id=convo.id, role="coach", content=op["reply"], questions=op["questions"],
                               mode="template"))
        db.commit()
        db.refresh(convo)
    return _conversation_json(convo, area, ctx)


@router.post("/coach/question")
def coach_question(body: CoachIn, user: User = Depends(require_student), db: Session = Depends(get_db)):
    area = own_area(db, user, body.improvement_area_id)
    ctx, source = _area_context(db, area)
    convo = db.scalar(select(CoachingConversation).where(CoachingConversation.improvement_area_id == area.id))
    if not convo:
        get_conversation(area.id, user, db)
        convo = db.scalar(select(CoachingConversation).where(CoachingConversation.improvement_area_id == area.id))
    history = [{"role": m.role, "content": m.content, "questions": m.questions} for m in convo.messages]
    out = coach_agent.respond(ctx, history, body.message, source)
    db.add(CoachingMessage(conversation_id=convo.id, role="student", content=body.message))
    db.add(CoachingMessage(conversation_id=convo.id, role="coach", content=out["reply"], questions=out.get("questions", []),
                           mode=out["mode"], integrity_action=out["integrity"].get("action")))
    if area.status == "open":
        area.status = "in_progress"
    db.commit()
    db.refresh(convo)
    res = _conversation_json(convo, area, ctx)
    res["notice"] = out.get("notice")
    return res
