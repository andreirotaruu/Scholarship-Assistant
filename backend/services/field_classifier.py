from __future__ import annotations

import re
from dataclasses import dataclass

from backend.models.schemas import ExtractedField, FieldAction


PROFILE_FIELD_MAP = {
    "first name": "personal.first_name",
    "given name": "personal.first_name",
    "last name": "personal.last_name",
    "family name": "personal.last_name",
    "surname": "personal.last_name",
    "email": "personal.email",
    "email address": "personal.email",
    "phone": "personal.phone",
    "phone number": "personal.phone",
    "university": "education.school",
    "college": "education.school",
    "school": "education.school",
    "major": "education.majors",
    "majors": "education.majors",
    "graduation date": "education.graduation_date",
    "expected graduation": "education.graduation_date",
    "gpa": "education.gpa",
}

SENSITIVE_TERMS = {
    "household income", "income", "social security", "ssn", "tax", "financial need",
    "bank account", "routing number", "medical", "disability", "citizenship status",
}
MANUAL_TERMS = {
    "signature", "electronic signature", "upload", "transcript", "recommendation",
    "captcha", "recaptcha", "proof of", "attach file",
}
ESSAY_TERMS = {
    "describe", "explain", "essay", "why", "tell us", "challenge", "leadership",
    "goals", "community", "experience", "deserve", "impact", "statement",
}


@dataclass(frozen=True)
class Classification:
    action: FieldAction
    profile_path: str | None
    exact_match: bool
    reason: str


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def classify(field: ExtractedField) -> Classification:
    primary_label = normalize(field.label or field.placeholder or field.field_id)
    label = normalize(" ".join(filter(None, [field.label, field.placeholder or "", field.field_id])))
    field_type = normalize(field.type)

    if field_type in {"hidden", "submit", "button", "reset", "image"}:
        return Classification(FieldAction.IGNORE, None, False, "Non-answer control")
    if field_type in {"file"} or any(term in label for term in MANUAL_TERMS):
        return Classification(FieldAction.MANUAL_ONLY, None, False, "Uploads, signatures, and verification controls require manual handling")
    if any(term in label for term in SENSITIVE_TERMS):
        return Classification(FieldAction.SENSITIVE, None, False, "Sensitive information is never stored or suggested")

    if primary_label in PROFILE_FIELD_MAP:
        return Classification(FieldAction.PROFILE_AUTOFILL, PROFILE_FIELD_MAP[primary_label], True, "Exact deterministic profile match")

    matches = [(key, path) for key, path in PROFILE_FIELD_MAP.items() if key in label]
    unique_paths = {path for _, path in matches}
    if len(unique_paths) == 1:
        return Classification(FieldAction.PROFILE_AUTOFILL, next(iter(unique_paths)), False, "Deterministic profile keyword match")

    is_long_text = field_type == "textarea" or (field.max_length is not None and field.max_length >= 200)
    if is_long_text and any(term in label for term in ESSAY_TERMS):
        return Classification(FieldAction.DRAFT_FOR_REVIEW, None, False, "Long-form prompt eligible for evidence-only drafting")
    if field_type in {"checkbox", "radio"} and not field.options:
        return Classification(FieldAction.ASK_USER, None, False, "Choice requires user confirmation")
    return Classification(FieldAction.ASK_USER, None, False, "No confident deterministic match")
