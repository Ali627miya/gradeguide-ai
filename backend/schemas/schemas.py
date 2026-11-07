"""Pydantic request/response schemas for the API."""
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class DemoLoginIn(BaseModel):
    role: Literal["student", "professor"]


class QuestionIn(BaseModel):
    section: Literal["code", "report"]
    text: str = Field(min_length=5, max_length=300)
    weight: float = Field(gt=0, le=100)
    short_name: str | None = Field(default=None, max_length=60)
    category: str | None = None


class RubricIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    module_id: int | None = None
    questions: list[QuestionIn] = Field(min_length=1, max_length=12)


class RubricTextIn(BaseModel):
    text: str = Field(min_length=5, max_length=50_000)


class AssignmentIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    module_name: str = Field(min_length=2, max_length=120)
    number: int = Field(ge=1, le=20)
    description: str | None = Field(default=None, max_length=2000)
    rubric_id: int | None = None
    rubric: RubricIn | None = None


class ProfessorAssignmentIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    module_id: int
    number: int = Field(ge=1, le=20)
    description: str | None = Field(default=None, max_length=2000)
    rubric_id: int


class ModuleIn(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=120)
    min_cohort_size: int = Field(default=5, ge=3, le=100)


class ModulePatch(BaseModel):
    analytics_enabled: bool | None = None
    min_cohort_size: int | None = Field(default=None, ge=3, le=100)


class DraftIn(BaseModel):
    assignment_id: int
    text: str = Field(min_length=20, max_length=120_000)
    filename: str | None = Field(default=None, max_length=200)
    source: Literal["upload", "editor", "paste", "demo_sample"] = "upload"


class AnalyseIn(BaseModel):
    draft_id: int
    force_offline: bool = False


class CompareIn(BaseModel):
    from_assessment_id: int
    to_assessment_id: int


class CoachIn(BaseModel):
    improvement_area_id: int
    message: str = Field(min_length=1, max_length=2000)


class ImprovementPatch(BaseModel):
    status: Literal["open", "in_progress", "completed"] | None = None
    student_plan: str | None = Field(default=None, max_length=4000)


class IntegrityCheckIn(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    source_text: str = Field(default="", max_length=120_000)
    kind: Literal["coach", "marker"] = "coach"


class FeedbackQualityIn(BaseModel):
    assessment_id: int


class ReviewItemIn(BaseModel):
    rating_id: int
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=120)

    @field_validator("comment")
    @classmethod
    def max_ten_words(cls, v: str) -> str:
        v = v.strip()
        if len(re.findall(r"\S+", v)) > 10:
            raise ValueError("Comments must be 10 words or fewer.")
        return v


class ReviewIn(BaseModel):
    items: list[ReviewItemIn] = Field(min_length=1, max_length=12)
