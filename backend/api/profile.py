from __future__ import annotations

import json

from fastapi import APIRouter

from backend.api.helpers import row_to_experience
from backend.database.db import connection, now_iso
from backend.models.schemas import Experience, ExperienceCreate, ProfileFieldValue, ProfileResponse, ProfileUpdate


router = APIRouter(prefix="/api", tags=["profile"])


@router.get("/profile", response_model=ProfileResponse)
def get_profile() -> ProfileResponse:
    with connection() as db:
        rows = db.execute("SELECT * FROM profile_fields ORDER BY id").fetchall()
    return ProfileResponse(fields=[
        ProfileFieldValue(
            path=row["path"],
            label=row["label"],
            value=json.loads(row["value_json"]),
            verified=bool(row["verified"]),
            source=row["source"],
            updated_at=row["updated_at"],
        )
        for row in rows
    ])


@router.put("/profile", response_model=ProfileResponse)
def update_profile(payload: ProfileUpdate) -> ProfileResponse:
    timestamp = now_iso()
    with connection() as db:
        for field in payload.fields:
            db.execute(
                """
                INSERT INTO profile_fields(profile_id, path, label, value_json, verified, source, updated_at)
                VALUES(1, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    label=excluded.label,
                    value_json=excluded.value_json,
                    verified=excluded.verified,
                    source=excluded.source,
                    updated_at=excluded.updated_at
                """,
                (field.path, field.label, json.dumps(field.value), int(field.verified), field.source, timestamp),
            )
    return get_profile()


@router.get("/experiences", response_model=list[Experience])
def get_experiences(verified_only: bool = False) -> list[Experience]:
    query = "SELECT * FROM experiences"
    params: tuple = ()
    if verified_only:
        query += " WHERE verified = 1"
    query += " ORDER BY updated_at DESC"
    with connection() as db:
        rows = db.execute(query, params).fetchall()
    return [Experience(**row_to_experience(row)) for row in rows]


@router.post("/experiences", response_model=Experience, status_code=201)
def create_experience(payload: ExperienceCreate) -> Experience:
    timestamp = now_iso()
    with connection() as db:
        cursor = db.execute(
            """
            INSERT INTO experiences(
                user_id, title, situation, actions_json, results_json,
                themes_json, verified, source, updated_at
            ) VALUES(1, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.title,
                payload.situation,
                json.dumps(payload.actions),
                json.dumps(payload.results),
                json.dumps(payload.themes),
                int(payload.verified),
                payload.source,
                timestamp,
            ),
        )
        row = db.execute("SELECT * FROM experiences WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return Experience(**row_to_experience(row))
