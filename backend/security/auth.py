from __future__ import annotations

import hmac
import json
import os
from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from backend.database.db import connection, now_iso


DEVELOPMENT_TOKEN = "dev-scholar-token"
DEVELOPMENT_EMAIL = "example@email.com"


@dataclass(frozen=True)
class AuthenticatedUser:
    id: int
    email: str
    profile_id: int


def configured_tokens() -> dict[str, str]:
    raw = os.getenv("SCHOLARSAFE_API_TOKENS")
    environment = os.getenv("SCHOLARSAFE_ENV", "development").lower()
    if not raw:
        if environment == "production":
            raise RuntimeError("SCHOLARSAFE_API_TOKENS is required in production")
        return {DEVELOPMENT_TOKEN: DEVELOPMENT_EMAIL}
    try:
        tokens = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError("SCHOLARSAFE_API_TOKENS must be a JSON object") from error
    if not isinstance(tokens, dict) or not tokens or not all(isinstance(token, str) and isinstance(email, str) for token, email in tokens.items()):
        raise RuntimeError("SCHOLARSAFE_API_TOKENS must map non-empty tokens to email addresses")
    if any(not token.strip() or "@" not in email for token, email in tokens.items()):
        raise RuntimeError("SCHOLARSAFE_API_TOKENS contains an invalid token or email")
    return {token: email.strip().lower() for token, email in tokens.items()}


def validate_auth_configuration() -> None:
    configured_tokens()


def email_for_token(candidate: str) -> str | None:
    for token, email in configured_tokens().items():
        if hmac.compare_digest(candidate, token):
            return email
    return None


def ensure_user(email: str) -> AuthenticatedUser:
    timestamp = now_iso()
    with connection() as db:
        row = db.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            user_id = row["id"]
        else:
            user_id = db.execute(
                "INSERT INTO users(email, created_at) VALUES(?, ?)",
                (email, timestamp),
            ).lastrowid
        profile = db.execute("SELECT id FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
        if profile:
            profile_id = profile["id"]
        else:
            profile_id = db.execute(
                "INSERT INTO profiles(user_id, created_at, updated_at) VALUES(?, ?, ?)",
                (user_id, timestamp, timestamp),
            ).lastrowid
    return AuthenticatedUser(id=user_id, email=email, profile_id=profile_id)


def current_user(authorization: str | None = Header(default=None)) -> AuthenticatedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    candidate = authorization.removeprefix("Bearer ").strip()
    email = email_for_token(candidate)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token")
    return ensure_user(email)
