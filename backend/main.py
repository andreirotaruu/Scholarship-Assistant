from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.applications import router as applications_router
from backend.api.generation import router as generation_router
from backend.api.profile import router as profile_router
from backend.database.db import initialize_database
from backend.security.auth import validate_auth_configuration


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_auth_configuration()
    initialize_database()
    yield


app = FastAPI(
    title="ScholarSafe API",
    description="Human-reviewed scholarship application preparation. This API never submits applications.",
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("SCHOLARSAFE_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(profile_router)
app.include_router(applications_router)
app.include_router(generation_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "submission_enabled": False}
