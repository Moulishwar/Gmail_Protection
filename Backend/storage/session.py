# storage/session.py
# UUID-based session directory creation.
# All data must be stored inside STORAGE_ROOT to prevent path traversal.

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Tuple

# ─── Storage Root ─────────────────────────────────────────────────────────────
# Resolved to an absolute path at import time; user input never influences this.

STORAGE_ROOT = Path(__file__).parent.parent / "storage" / "sessions"


def create_session_dir() -> Tuple[str, Path]:
    """
    Create a new isolated session directory and return (session_id, path).

    Session format: session_<uuid4>
    All writes MUST happen inside STORAGE_ROOT to satisfy path traversal rules.
    """
    session_id = f"session_{uuid.uuid4().hex}"
    session_dir = STORAGE_ROOT / session_id

    # Verify the resolved path is still inside STORAGE_ROOT (defense in depth)
    resolved = session_dir.resolve()
    root_resolved = STORAGE_ROOT.resolve()
    if not str(resolved).startswith(str(root_resolved)):
        raise PermissionError(
            "Session directory path escaped storage root – aborting."
        )

    session_dir.mkdir(parents=True, exist_ok=False)
    return session_id, session_dir


def get_session_dir(session_id: str) -> Path:
    """
    Return the Path for an existing session directory.
    Validates that the session_id is safe before building the path.
    """
    # Only allow hex characters after 'session_' prefix
    if not session_id.startswith("session_"):
        raise ValueError("Invalid session_id format")

    suffix = session_id[len("session_"):]
    if not all(c in "0123456789abcdef" for c in suffix):
        raise ValueError("Invalid session_id characters")

    session_dir = (STORAGE_ROOT / session_id).resolve()
    root_resolved = STORAGE_ROOT.resolve()

    if not str(session_dir).startswith(str(root_resolved)):
        raise ValueError("Session path traversal detected")

    if not session_dir.exists():
        raise FileNotFoundError(f"Session '{session_id}' not found")

    return session_dir
