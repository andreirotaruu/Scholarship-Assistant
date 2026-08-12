from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from backend.database.db import database_path


def create_backup(output_directory: Path) -> Path:
    source_path = database_path()
    if not source_path.is_file():
        raise FileNotFoundError(f"ScholarSafe database does not exist: {source_path}")

    output_directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    destination = output_directory / f"scholarsafe-{timestamp}.db"
    temporary = output_directory / f".{destination.name}.{os.getpid()}.tmp"

    try:
        with sqlite3.connect(source_path, timeout=10) as source, sqlite3.connect(temporary) as target:
            source.backup(target)
            result = target.execute("PRAGMA integrity_check").fetchone()[0]
            if result != "ok":
                raise RuntimeError(f"Backup integrity check failed: {result}")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)

    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="Create and verify an online ScholarSafe SQLite backup.")
    parser.add_argument(
        "--output-directory",
        type=Path,
        default=Path("/backups"),
        help="Directory on a separate backup volume or mounted backup destination.",
    )
    args = parser.parse_args()
    print(create_backup(args.output_directory))


if __name__ == "__main__":
    main()
