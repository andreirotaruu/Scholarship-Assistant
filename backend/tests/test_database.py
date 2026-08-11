import sqlite3

from backend.database.db import initialize_database


def test_legacy_profile_fields_migrate_to_per_profile_uniqueness(tmp_path, monkeypatch) -> None:
    database = tmp_path / "legacy.db"
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, created_at TEXT NOT NULL)")
        db.execute("CREATE TABLE profiles (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
        db.execute("INSERT INTO users VALUES(1, 'existing@example.edu', '2026-01-01')")
        db.execute("INSERT INTO profiles VALUES(1, 1, '2026-01-01', '2026-01-01')")
        db.execute(
            """
            CREATE TABLE profile_fields (
                id INTEGER PRIMARY KEY,
                profile_id INTEGER NOT NULL,
                path TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                value_json TEXT,
                verified INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            "INSERT INTO profile_fields VALUES(1, 1, 'personal.first_name', 'First name', '\"Existing\"', 1, 'Student-entered', '2026-01-01')"
        )

    monkeypatch.setenv("SCHOLARSAFE_DATABASE", str(database))
    initialize_database()

    with sqlite3.connect(database) as db:
        table_sql = db.execute("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'profile_fields'").fetchone()[0]
        indexes = {row[1] for row in db.execute("PRAGMA index_list('profile_fields')").fetchall()}
        value = db.execute("SELECT value_json FROM profile_fields WHERE id = 1").fetchone()[0]
    assert "path TEXT NOT NULL UNIQUE" not in table_sql
    assert "idx_profile_fields_profile_path" in indexes
    assert value == '"Existing"'
