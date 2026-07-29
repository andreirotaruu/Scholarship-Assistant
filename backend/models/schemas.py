from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class FieldAction(StrEnum):
    PROFILE_AUTOFILL = "profile_autofill"
    DRAFT_FOR_REVIEW = "draft_for_review"
    ASK_USER = "ask_user"
    SENSITIVE = "sensitive"
    MANUAL_ONLY = "manual_only"
    IGNORE = "ignore"


class ExtractedField(BaseModel):
    field_id: str
    label: str = ""
    type: str = "text"
    required: bool = False
    options: list[str] = Field(default_factory=list)
    max_length: int | None = None
    selector: str | None = None
    placeholder: str | None = None


class ClassifiedField(ExtractedField):
    action: FieldAction
    answer: str = ""
    confidence: float
    source: str | None = None
    requires_review: bool = True
    reason: str
    approved: bool = False
    facts_used: list[str] = Field(default_factory=list)
    experiences_used: list[str] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    scholarship_name: str = "Untitled scholarship"
    url: str
    deadline: str | None = None
    fields: list[ExtractedField]


class AnalyzeResponse(BaseModel):
    application_id: int
    scholarship_name: str
    status: str
    fields: list[ClassifiedField]
    fields_total: int
    ready_count: int
    review_count: int
    missing_count: int


class ProfileFieldValue(BaseModel):
    path: str
    label: str
    value: Any = None
    verified: bool = False
    source: str = "Student-entered"
    updated_at: str | None = None


class ProfileResponse(BaseModel):
    fields: list[ProfileFieldValue]


class ProfileUpdate(BaseModel):
    fields: list[ProfileFieldValue]


class ExperienceCreate(BaseModel):
    title: str
    situation: str
    actions: list[str]
    results: list[str]
    themes: list[str]
    verified: bool = False
    source: str = "Student-entered"


class Experience(ExperienceCreate):
    id: int
    updated_at: str


class ApprovalUpdate(BaseModel):
    answer: str
    approved: bool


class DraftRequest(BaseModel):
    prompt: str
    max_words: int | None = None
    max_characters: int | None = None
    scholarship_information: str | None = None


class DraftResponse(BaseModel):
    draft: str
    experiences_used: list[str]
    facts_used: list[str]
    missing_information: list[str]
    requires_review: bool = True
