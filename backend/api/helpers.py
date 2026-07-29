from __future__ import annotations

import json
import sqlite3


def row_to_experience(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "situation": row["situation"],
        "actions": json.loads(row["actions_json"]),
        "results": json.loads(row["results_json"]),
        "themes": json.loads(row["themes_json"]),
        "verified": bool(row["verified"]),
        "source": row["source"],
        "updated_at": row["updated_at"],
    }


def verified_profile_map(db: sqlite3.Connection) -> dict[str, dict]:
    rows = db.execute("SELECT * FROM profile_fields").fetchall()
    return {
        row["path"]: {
            "value": json.loads(row["value_json"]),
            "verified": bool(row["verified"]),
            "source": row["source"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    }
