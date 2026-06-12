#!/usr/bin/env python3
"""Run LightGuard's SQLite compatibility migrations.

Use this before a demo when an existing lightguard.db is already present.
It creates new tables and adds missing columns without deleting data.
"""
from __future__ import annotations

import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from backend.database import SQLALCHEMY_DATABASE_URL, init_db  # noqa: E402


def main() -> None:
    init_db()
    print(f"[migration] SQLite schema is ready: {SQLALCHEMY_DATABASE_URL}")


if __name__ == "__main__":
    main()
