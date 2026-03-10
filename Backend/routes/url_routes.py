# routes/url_routes.py — POST /urls

import uuid
import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, field_validator

from security.validation import validate_urls_list
from security.rate_limit import check_rate_limit

router = APIRouter()
logger = logging.getLogger("backend")

BASE_DIR    = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"


# ── Request model ──────────────────────────────────────────────────────────
class URLsPayload(BaseModel):
    urls: list[str] = []

    @field_validator("urls", mode="before")
    @classmethod
    def coerce_list(cls, v):
        return v if isinstance(v, list) else []


# ── Endpoint ───────────────────────────────────────────────────────────────
@router.post("/urls", dependencies=[Depends(check_rate_limit)])
async def receive_urls(request: Request, payload: URLsPayload):
    """
    Accept a list of URLs from the extension.
    Validates each URL and stores them in urls/urls.json inside a new session folder.
    """
    clean_urls = validate_urls_list(payload.urls)

    if not clean_urls:
        return {"status": "ok", "session_id": None, "message": "No valid URLs provided."}

    # Create isolated session directory
    session_id   = f"session_{uuid.uuid4()}"
    session_path = STORAGE_DIR / session_id / "urls"
    session_path.mkdir(parents=True, exist_ok=True)

    # Write urls.json
    (session_path / "urls.json").write_text(
        json.dumps(clean_urls, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "session=%s | type=urls | url_count=%d | ip=%s",
        session_id, len(clean_urls), client_ip,
    )

    return {
        "status":     "ok",
        "session_id": session_id,
        "url_count":  len(clean_urls),
    }
