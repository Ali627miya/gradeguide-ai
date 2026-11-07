"""Shared helpers for routers: ownership checks."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.models import Assessment, Assignment, Draft, Enrollment, ImprovementArea, User


def student_can_use_assignment(db: Session, user: User, asg: Assignment | None) -> Assignment:
    if not asg:
        raise HTTPException(404, "Assignment not found.")
    if asg.created_by == user.id:
        return asg
    if asg.published and asg.module_id and db.query(Enrollment).filter_by(student_id=user.id, module_id=asg.module_id).first():
        return asg
    raise HTTPException(403, "You do not have access to this assignment.")


def own_draft(db: Session, user: User, draft_id: int) -> Draft:
    d = db.get(Draft, draft_id)
    if not d or d.student_id != user.id:
        raise HTTPException(404, "Draft not found.")
    return d


def own_assessment(db: Session, user: User, assessment_id: int) -> Assessment:
    a = db.get(Assessment, assessment_id)
    if not a or a.student_id != user.id:
        raise HTTPException(404, "Assessment not found.")
    return a


def own_area(db: Session, user: User, area_id: int) -> ImprovementArea:
    a = db.get(ImprovementArea, area_id)
    if not a or a.student_id != user.id:
        raise HTTPException(404, "Improvement area not found.")
    return a


def professor_can_view(db: Session, prof: User, a: Assessment) -> bool:
    asg = a.assignment
    return bool(a.shared_with_lecturer and asg.module and asg.module.professor_id == prof.id)
