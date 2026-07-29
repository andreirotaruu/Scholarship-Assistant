from backend.models.schemas import ExtractedField, FieldAction
from backend.services.field_classifier import classify


def field(label: str, field_type: str = "text", max_length: int | None = None) -> ExtractedField:
    return ExtractedField(field_id="test", label=label, type=field_type, max_length=max_length)


def test_exact_profile_match() -> None:
    result = classify(field("First name"))
    assert result.action == FieldAction.PROFILE_AUTOFILL
    assert result.profile_path == "personal.first_name"
    assert result.exact_match is True


def test_sensitive_fields_are_manual() -> None:
    assert classify(field("Annual household income")).action == FieldAction.SENSITIVE


def test_signature_is_manual_only() -> None:
    assert classify(field("Electronic signature")).action == FieldAction.MANUAL_ONLY


def test_essay_is_drafted_for_review() -> None:
    result = classify(field("Describe a technical challenge you overcame", "textarea", 2000))
    assert result.action == FieldAction.DRAFT_FOR_REVIEW


def test_submit_controls_are_ignored() -> None:
    assert classify(field("Submit", "submit")).action == FieldAction.IGNORE
