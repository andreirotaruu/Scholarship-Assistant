from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from backend.api.helpers import row_to_experience, verified_profile_map
from backend.database.db import connection, now_iso
from backend.models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    ApprovalUpdate,
    ClassifiedField,
    FieldAction,
)
from backend.services.confidence import generated_confidence, profile_confidence
from backend.services.essay_generator import draft_from_verified_experiences
from backend.services.field_classifier import classify


router = APIRouter(prefix="/api", tags=["applications"])


def render_profile_value(value: object) -> str:
    if isinstance(value, list):
        return " and ".join(str(item) for item in value)
    if value is None:
        return ""
    return str(value)


@router.post("/applications/analyze", response_model=AnalyzeResponse)
def analyze_application(payload: AnalyzeRequest) -> AnalyzeResponse:
    timestamp = now_iso()
    with connection() as db:
        profile = verified_profile_map(db)
        experiences = [row_to_experience(row) for row in db.execute("SELECT * FROM experiences WHERE verified = 1").fetchall()]
        scholarship = db.execute("SELECT id FROM scholarships WHERE url = ?", (payload.url,)).fetchone()
        if scholarship:
            scholarship_id = scholarship["id"]
            db.execute("UPDATE scholarships SET name = ?, deadline = ? WHERE id = ?", (payload.scholarship_name, payload.deadline, scholarship_id))
        else:
            scholarship_id = db.execute(
                "INSERT INTO scholarships(name, url, deadline, created_at) VALUES(?, ?, ?, ?)",
                (payload.scholarship_name, payload.url, payload.deadline, timestamp),
            ).lastrowid
        application_id = db.execute(
            """
            INSERT INTO applications(user_id, scholarship_id, status, fields_total, updated_at)
            VALUES(1, ?, 'started', ?, ?)
            """,
            (scholarship_id, len(payload.fields), timestamp),
        ).lastrowid

        classified_fields: list[ClassifiedField] = []
        for field in payload.fields:
            result = classify(field)
            answer = ""
            source = None
            confidence = 0.0
            facts_used: list[str] = []
            experiences_used: list[str] = []

            if result.action == FieldAction.PROFILE_AUTOFILL and result.profile_path:
                profile_field = profile.get(result.profile_path)
                if profile_field:
                    answer = render_profile_value(profile_field["value"])
                    source = result.profile_path
                    confidence = profile_confidence(
                        exact_match=result.exact_match,
                        verified=profile_field["verified"],
                        missing=not bool(answer),
                    )
                else:
                    confidence = profile_confidence(exact_match=result.exact_match, verified=False, missing=True)
            elif result.action == FieldAction.DRAFT_FOR_REVIEW:
                draft = draft_from_verified_experiences(
                    field.label,
                    experiences,
                    max_characters=field.max_length,
                )
                answer = "" if draft.draft == "MISSING_INFORMATION" else draft.draft
                facts_used = draft.facts_used
                experiences_used = draft.experiences_used
                source = ", ".join(experiences_used) or None
                confidence = generated_confidence(
                    facts_count=len(facts_used),
                    prompt_match=bool(experiences_used),
                    constrained=field.max_length is not None,
                )
            elif result.action in {FieldAction.SENSITIVE, FieldAction.MANUAL_ONLY, FieldAction.IGNORE}:
                confidence = 1.0
            else:
                confidence = 0.4

            if result.action == FieldAction.PROFILE_AUTOFILL and (not answer or confidence < 0.7):
                action = FieldAction.ASK_USER
                reason = "A matching profile field exists but is missing or unverified"
            else:
                action = result.action
                reason = result.reason

            suggestion = ClassifiedField(
                **field.model_dump(),
                action=action,
                answer=answer,
                confidence=confidence,
                source=source,
                requires_review=True,
                reason=reason,
                approved=False,
                facts_used=facts_used,
                experiences_used=experiences_used,
            )
            classified_fields.append(suggestion)
            cursor = db.execute(
                """
                INSERT INTO application_fields(
                    application_id, field_id, label, field_type, required, options_json,
                    max_length, selector, action, confidence, source, answer, approved, reason
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    application_id, field.field_id, field.label, field.type, int(field.required),
                    json.dumps(field.options), field.max_length, field.selector, action.value,
                    confidence, source, answer, reason,
                ),
            )
            if action == FieldAction.DRAFT_FOR_REVIEW and answer:
                db.execute(
                    """
                    INSERT INTO generated_answers(
                        application_field_id, draft, experiences_used_json,
                        facts_used_json, requires_review, created_at
                    ) VALUES(?, ?, ?, ?, 1, ?)
                    """,
                    (cursor.lastrowid, answer, json.dumps(experiences_used), json.dumps(facts_used), timestamp),
                )

        ready = sum(1 for field in classified_fields if field.action == FieldAction.PROFILE_AUTOFILL and field.confidence >= 0.9)
        review = sum(1 for field in classified_fields if field.action == FieldAction.DRAFT_FOR_REVIEW or 0.7 <= field.confidence < 0.9)
        missing = sum(1 for field in classified_fields if field.action in {FieldAction.ASK_USER, FieldAction.SENSITIVE, FieldAction.MANUAL_ONLY})
        status = "needs_information" if missing else "ready_for_review"
        db.execute(
            "UPDATE applications SET status = ?, fields_completed = ?, missing_fields = ? WHERE id = ?",
            (status, ready, missing, application_id),
        )

    return AnalyzeResponse(
        application_id=application_id,
        scholarship_name=payload.scholarship_name,
        status=status,
        fields=classified_fields,
        fields_total=len(classified_fields),
        ready_count=ready,
        review_count=review,
        missing_count=missing,
    )


@router.patch("/applications/{application_id}/fields/{field_id}/approval")
def update_approval(application_id: int, field_id: str, payload: ApprovalUpdate) -> dict:
    with connection() as db:
        row = db.execute(
            "SELECT id, action FROM application_fields WHERE application_id = ? AND field_id = ?",
            (application_id, field_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Application field not found")
        if row["action"] in {FieldAction.SENSITIVE.value, FieldAction.MANUAL_ONLY.value, FieldAction.IGNORE.value} and payload.approved:
            raise HTTPException(status_code=400, detail="Manual and ignored fields cannot be approved for filling")
        db.execute(
            "UPDATE application_fields SET answer = ?, approved = ? WHERE id = ?",
            (payload.answer, int(payload.approved), row["id"]),
        )
        counts = db.execute(
            """
            SELECT
                SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END) AS approved_count,
                SUM(CASE
                    WHEN action IN ('sensitive', 'manual_only') THEN 1
                    WHEN action = 'ask_user' AND (approved = 0 OR answer = '') THEN 1
                    ELSE 0
                END) AS missing_count
            FROM application_fields
            WHERE application_id = ? AND action != 'ignore'
            """,
            (application_id,),
        ).fetchone()
        status = "needs_information" if counts["missing_count"] else "ready_for_review"
        db.execute(
            "UPDATE applications SET fields_completed = ?, missing_fields = ?, status = ?, updated_at = ? WHERE id = ?",
            (counts["approved_count"], counts["missing_count"], status, now_iso(), application_id),
        )
    return {"field_id": field_id, "approved": payload.approved, "answer": payload.answer}


@router.get("/applications")
def list_applications() -> list[dict]:
    with connection() as db:
        rows = db.execute(
            """
            SELECT applications.*, scholarships.name, scholarships.url, scholarships.deadline
            FROM applications
            JOIN scholarships ON scholarships.id = applications.scholarship_id
            ORDER BY applications.updated_at DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


@router.get("/applications/{application_id}", response_model=AnalyzeResponse)
def get_application(application_id: int) -> AnalyzeResponse:
    with connection() as db:
        application = db.execute(
            """
            SELECT applications.*, scholarships.name
            FROM applications
            JOIN scholarships ON scholarships.id = applications.scholarship_id
            WHERE applications.id = ? AND applications.user_id = 1
            """,
            (application_id,),
        ).fetchone()
        if not application:
            raise HTTPException(status_code=404, detail="Application not found")
        rows = db.execute(
            """
            SELECT application_fields.*, generated_answers.experiences_used_json,
                   generated_answers.facts_used_json
            FROM application_fields
            LEFT JOIN generated_answers ON generated_answers.application_field_id = application_fields.id
            WHERE application_fields.application_id = ?
            ORDER BY application_fields.id
            """,
            (application_id,),
        ).fetchall()

    fields = [
        ClassifiedField(
            field_id=row["field_id"],
            label=row["label"],
            type=row["field_type"],
            required=bool(row["required"]),
            options=json.loads(row["options_json"]),
            max_length=row["max_length"],
            selector=row["selector"],
            action=FieldAction(row["action"]),
            confidence=row["confidence"],
            source=row["source"],
            answer=row["answer"],
            approved=bool(row["approved"]),
            reason=row["reason"],
            facts_used=json.loads(row["facts_used_json"] or "[]"),
            experiences_used=json.loads(row["experiences_used_json"] or "[]"),
        )
        for row in rows
    ]
    ready = sum(1 for field in fields if field.approved)
    review = sum(1 for field in fields if field.action == FieldAction.DRAFT_FOR_REVIEW and not field.approved)
    missing = sum(1 for field in fields if field.action in {FieldAction.ASK_USER, FieldAction.SENSITIVE, FieldAction.MANUAL_ONLY})
    return AnalyzeResponse(
        application_id=application["id"],
        scholarship_name=application["name"],
        status=application["status"],
        fields=fields,
        fields_total=len(fields),
        ready_count=ready,
        review_count=review,
        missing_count=missing,
    )
