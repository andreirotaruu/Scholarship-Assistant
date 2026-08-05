from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator


DEFAULT_DATABASE = Path(__file__).resolve().parents[1] / "scholarsafe.db"


def database_path() -> Path:
    return Path(os.getenv("SCHOLARSAFE_DATABASE", DEFAULT_DATABASE))


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    db = sqlite3.connect(database_path())
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS profile_fields (
        id INTEGER PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES profiles(id),
        path TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        value_json TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS experiences (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        situation TEXT NOT NULL,
        actions_json TEXT NOT NULL,
        results_json TEXT NOT NULL,
        themes_json TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS scholarships (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        deadline TEXT,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        scholarship_id INTEGER NOT NULL REFERENCES scholarships(id),
        status TEXT NOT NULL,
        fields_completed INTEGER NOT NULL DEFAULT 0,
        fields_total INTEGER NOT NULL DEFAULT 0,
        missing_fields INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS application_fields (
        id INTEGER PRIMARY KEY,
        application_id INTEGER NOT NULL REFERENCES applications(id),
        field_id TEXT NOT NULL,
        label TEXT NOT NULL,
        field_type TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 0,
        options_json TEXT NOT NULL,
        max_length INTEGER,
        selector TEXT,
        action TEXT NOT NULL,
        confidence REAL NOT NULL,
        source TEXT,
        answer TEXT NOT NULL DEFAULT '',
        approved INTEGER NOT NULL DEFAULT 0,
        reason TEXT NOT NULL,
        UNIQUE(application_id, field_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS generated_answers (
        id INTEGER PRIMARY KEY,
        application_field_id INTEGER REFERENCES application_fields(id),
        draft TEXT NOT NULL,
        experiences_used_json TEXT NOT NULL,
        facts_used_json TEXT NOT NULL,
        requires_review INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        storage_key TEXT,
        status TEXT NOT NULL DEFAULT 'manual_only',
        created_at TEXT NOT NULL
    )
    """,
)


PROFILE_SEED = (
    ("personal.first_name", "First name", "Andrei", 1, "Student-entered"),
    ("personal.last_name", "Last name", "Rotaru", 1, "Student-entered"),
    ("personal.email", "Email", "example@email.com", 1, "Student-entered"),
    ("personal.phone", "Phone", "", 0, "No source"),
    ("personal.address.street", "Street address", "", 0, "No source"),
    ("personal.address.city", "City", "", 0, "No source"),
    ("personal.address.state", "State or province", "", 0, "No source"),
    ("personal.address.postal_code", "Postal code", "", 0, "No source"),
    ("personal.address.country", "Country", "United States", 0, "Student-entered"),
    ("education.school", "School", "Marquette University", 1, "Enrollment record"),
    ("education.majors", "Majors", ["Computer Science", "Mathematics"], 1, "Student-entered"),
    ("education.year_in_school", "Year in school", "", 0, "No source"),
    ("education.graduation_date", "Graduation date", "May 2028", 1, "Enrollment record"),
    ("education.gpa", "GPA", None, 0, "No source"),
)


def initialize_database() -> None:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with connection() as db:
        for statement in SCHEMA:
            db.execute(statement)
        timestamp = now_iso()
        db.execute("INSERT OR IGNORE INTO users(id, email, created_at) VALUES(1, ?, ?)", ("example@email.com", timestamp))
        db.execute(
            "INSERT OR IGNORE INTO profiles(id, user_id, created_at, updated_at) VALUES(1, 1, ?, ?)",
            (timestamp, timestamp),
        )
        for path_name, label, value, verified, source in PROFILE_SEED:
            db.execute(
                """
                INSERT OR IGNORE INTO profile_fields(
                    profile_id, path, label, value_json, verified, source, updated_at
                ) VALUES(1, ?, ?, ?, ?, ?, ?)
                """,
                (path_name, label, json.dumps(value), verified, source, timestamp),
            )
        count = db.execute("SELECT COUNT(*) FROM experiences").fetchone()[0]
        if count == 0:
            db.executemany(
                """
                INSERT INTO experiences(
                    user_id, title, situation, actions_json, results_json,
                    themes_json, verified, source, updated_at
                ) VALUES(1, ?, ?, ?, ?, ?, 1, 'Student-entered', ?)
                """,
                (
                    (
                        "Building Price Intel",
                        "Resellers risk losing money when buying products without understanding market value.",
                        json.dumps(["Built a FastAPI backend", "Collected eBay listing data", "Calculated median prices and resale metrics", "Created filters for inaccurate comparables"]),
                        json.dumps(["Created a working MVP", "Improved understanding of backend architecture", "Learned how noisy marketplace data can be"]),
                        json.dumps(["entrepreneurship", "problem solving", "technology", "persistence"]),
                        timestamp,
                    ),
                    (
                        "Logistics engineering internship",
                        "Container tracking events needed to be collected and integrated into logistics workflows.",
                        json.dumps(["Built systems to collect container tracking events", "Worked with Python, Selenium, APIs, and XML", "Integrated data with CargoWise"]),
                        json.dumps(["Created a working tracking integration", "Improved understanding of logistics data systems"]),
                        json.dumps(["technology", "systems thinking", "persistence"]),
                        timestamp,
                    ),
                ),
            )
