from fastapi import APIRouter

from backend.api.helpers import row_to_experience
from backend.database.db import connection
from backend.models.schemas import DraftRequest, DraftResponse
from backend.services.essay_generator import draft_from_verified_experiences


router = APIRouter(prefix="/api", tags=["generation"])


@router.post("/draft", response_model=DraftResponse)
def draft_answer(payload: DraftRequest) -> DraftResponse:
    with connection() as db:
        rows = db.execute("SELECT * FROM experiences WHERE verified = 1").fetchall()
    experiences = [row_to_experience(row) for row in rows]
    return draft_from_verified_experiences(
        payload.prompt,
        experiences,
        max_words=payload.max_words,
        max_characters=payload.max_characters,
    )
