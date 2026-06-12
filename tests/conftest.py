"""Pytest bootstrap: MOCK_MODE + shared SQLite file DB (see README note about dual-import)."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("LIGHTGUARD_TESTING", "1")
os.environ.setdefault("MOCK_MODE", "true")

# Single file URL consumed by BOTH `database` and `backend.database` module executions.
tmpdir = tempfile.mkdtemp(prefix="lightguard_pytest_")
_dbfile = Path(tmpdir) / "lightguard.sqlite"
os.environ.setdefault("LIGHTGUARD_TEST_DATABASE_URL", f"sqlite:///{_dbfile.resolve().as_posix()}")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
