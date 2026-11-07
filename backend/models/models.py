"""Database models. Only pseudonymous display names are stored - no emails or student IDs."""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.db import Base


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(16))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)  # seeded cohort for analytics
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint("role in ('student','professor')", name="ck_user_role"),)

    student_profile = relationship("StudentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    professor_profile = relationship("ProfessorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")


class StudentProfile(Base):
    __tablename__ = "student_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    programme: Mapped[str | None] = mapped_column(String(120), nullable=True)
    consent_aggregate_analytics: Mapped[bool] = mapped_column(Boolean, default=True)
    user = relationship("User", back_populates="student_profile")


class ProfessorProfile(Base):
    __tablename__ = "professor_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    user = relationship("User", back_populates="professor_profile")


class Module(Base):
    __tablename__ = "modules"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(120))
    professor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    analytics_enabled: Mapped[bool] = mapped_column(Boolean, default=False)  # lecturer consent
    min_cohort_size: Mapped[int] = mapped_column(Integer, default=5)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint("min_cohort_size >= 3", name="ck_min_cohort"),)
    assignments = relationship("Assignment", back_populates="module")


class Enrollment(Base):
    __tablename__ = "enrollments"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    __table_args__ = (UniqueConstraint("student_id", "module_id", name="uq_enrollment"),)


class Rubric(Base):
    __tablename__ = "rubrics"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    module_id: Mapped[int | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="professor")  # professor | student_upload | template
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    questions = relationship(
        "RubricQuestion", back_populates="rubric", cascade="all, delete-orphan", order_by="RubricQuestion.position"
    )


class RubricQuestion(Base):
    __tablename__ = "rubric_questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    rubric_id: Mapped[int] = mapped_column(ForeignKey("rubrics.id", ondelete="CASCADE"))
    section: Mapped[str] = mapped_column(String(10))  # code | report
    short_name: Mapped[str] = mapped_column(String(60))
    text: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40))
    weight: Mapped[float] = mapped_column(Float)
    position: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (
        CheckConstraint("section in ('code','report')", name="ck_question_section"),
        CheckConstraint("weight >= 0 AND weight <= 100", name="ck_question_weight"),
    )
    rubric = relationship("Rubric", back_populates="questions")


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    module_id: Mapped[int | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    module_name: Mapped[str] = mapped_column(String(120))
    number: Mapped[int] = mapped_column(Integer, default=1)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rubric_id: Mapped[int] = mapped_column(ForeignKey("rubrics.id", ondelete="RESTRICT"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    published: Mapped[bool] = mapped_column(Boolean, default=False)  # True = lecturer-published for module
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint("number >= 1", name="ck_assignment_number"),)
    module = relationship("Module", back_populates="assignments")
    rubric = relationship("Rubric")


class Draft(Base):
    __tablename__ = "drafts"
    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"))
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    round_number: Mapped[int] = mapped_column(Integer, default=1)
    text: Mapped[str] = mapped_column(Text)  # extracted text only; raw uploaded files are never stored
    filename: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="upload")  # upload | editor | paste | demo_sample
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    assignment = relationship("Assignment")


class Assessment(Base):
    __tablename__ = "assessments"
    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"))
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"))
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    mode: Mapped[str] = mapped_column(String(12))  # live | simulated
    model_name: Mapped[str] = mapped_column(String(80))
    weighted_score: Mapped[float] = mapped_column(Float)
    overall_summary: Mapped[str] = mapped_column(Text, default="")
    needs_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    shared_with_lecturer: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    pipeline_log: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (
        CheckConstraint("mode in ('live','simulated')", name="ck_assessment_mode"),
        CheckConstraint("weighted_score >= 0 AND weighted_score <= 100", name="ck_weighted_score"),
    )
    draft = relationship("Draft")
    assignment = relationship("Assignment")
    ratings = relationship(
        "CriterionRating", back_populates="assessment", cascade="all, delete-orphan", order_by="CriterionRating.position"
    )
    quality = relationship("FeedbackQualityScore", back_populates="assessment", uselist=False, cascade="all, delete-orphan")


class CriterionRating(Base):
    __tablename__ = "criterion_ratings"
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    question_id: Mapped[int | None] = mapped_column(ForeignKey("rubric_questions.id", ondelete="SET NULL"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    criterion_name: Mapped[str] = mapped_column(String(80))
    criterion_text: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40))
    section: Mapped[str] = mapped_column(String(10))
    weight: Mapped[float] = mapped_column(Float)
    rating: Mapped[str] = mapped_column(String(8))  # STRONG | OKAY | WEAK
    score: Mapped[int] = mapped_column(Integer)
    evidence_quote: Mapped[str] = mapped_column(Text, default="")
    quote_status: Mapped[str] = mapped_column(String(12), default="none")  # verified | near | unverified | none
    explanation: Mapped[str] = mapped_column(Text)
    missing: Mapped[str] = mapped_column(Text, default="")
    issue_type: Mapped[str] = mapped_column(String(16))  # missing | incorrect | unsupported | good | ambiguous
    coaching_question: Mapped[str] = mapped_column(Text)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reasons: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = (
        CheckConstraint("score between 1 and 5", name="ck_rating_score"),
        CheckConstraint("rating in ('STRONG','OKAY','WEAK')", name="ck_rating_label"),
    )
    assessment = relationship("Assessment", back_populates="ratings")


class FeedbackQualityScore(Base):
    __tablename__ = "feedback_quality_scores"
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), unique=True)
    evidence_accuracy: Mapped[int] = mapped_column(Integer)
    rubric_alignment: Mapped[int] = mapped_column(Integer)
    reasoning_quality: Mapped[int] = mapped_column(Integer)
    feedback_relevance: Mapped[int] = mapped_column(Integer)
    integrity_compliance: Mapped[int] = mapped_column(Integer)
    overall: Mapped[float] = mapped_column(Float)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    assessment = relationship("Assessment", back_populates="quality")


class ImprovementArea(Base):
    __tablename__ = "improvement_areas"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    rating_id: Mapped[int] = mapped_column(ForeignKey("criterion_ratings.id", ondelete="CASCADE"))
    criterion_name: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(12), default="open")  # open | in_progress | completed
    student_plan: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    __table_args__ = (CheckConstraint("status in ('open','in_progress','completed')", name="ck_area_status"),)


class CoachingConversation(Base):
    __tablename__ = "coaching_conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    improvement_area_id: Mapped[int] = mapped_column(ForeignKey("improvement_areas.id", ondelete="CASCADE"), unique=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    messages = relationship("CoachingMessage", cascade="all, delete-orphan", order_by="CoachingMessage.id")


class CoachingMessage(Base):
    __tablename__ = "coaching_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("coaching_conversations.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(10))  # student | coach
    content: Mapped[str] = mapped_column(Text)
    questions: Mapped[list] = mapped_column(JSON, default=list)
    mode: Mapped[str] = mapped_column(String(12), default="simulated")
    integrity_action: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AssignmentComparison(Base):
    __tablename__ = "assignment_comparisons"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    from_assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    to_assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(12))  # draft | assignment
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class LecturerReview(Base):
    """Optional human review, only possible when the student explicitly shares an assessment."""
    __tablename__ = "lecturer_reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), unique=True)
    professor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    items: Mapped[list] = mapped_column(JSON, default=list)  # [{rating_id, rating 1-5, comment<=10 words}]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
