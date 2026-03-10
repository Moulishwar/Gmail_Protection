# routes/email_routes.py — POST /email

import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, field_validator

from security.validation import sanitize_text, validate_text_size
from security.rate_limit import check_rate_limit

router = APIRouter()
logger = logging.getLogger("backend")

BASE_DIR     = Path(__file__).resolve().parent.parent
STORAGE_DIR  = BASE_DIR / "storage"


# ── Request model ──────────────────────────────────────────────────────────
class EmailPayload(BaseModel):
    subject: str = ""
    body:    str = ""
    urls:    list[str] = []

    @field_validator("subject", "body", mode="before")
    @classmethod
    def coerce_str(cls, v):
        return str(v) if v is not None else ""

    @field_validator("urls", mode="before")
    @classmethod
    def coerce_list(cls, v):
        return v if isinstance(v, list) else []


# ── Endpoint ───────────────────────────────────────────────────────────────
@router.post("/email", dependencies=[Depends(check_rate_limit)])
async def receive_email(request: Request, payload: EmailPayload):
    """
    Accept subject + body + optional URL list from the extension.
    Creates an isolated session folder and writes email.txt.
    """
    # Validate sizes (raises HTTP 413 if exceeded)
    validate_text_size(payload.subject, "subject")
    validate_text_size(payload.body,    "body")

    # Sanitize all text fields
    subject = sanitize_text(payload.subject)
    body    = sanitize_text(payload.body)

    # Sanitize and cap URL list
    clean_urls: list[str] = []
    for u in payload.urls[:500]:
        if isinstance(u, str) and u.startswith(("http://", "https://")):
            clean_urls.append(u.strip()[:2048])

    # Create isolated session directory
    session_id   = f"session_{uuid.uuid4()}"
    session_path = STORAGE_DIR / session_id / "email"
    session_path.mkdir(parents=True, exist_ok=True)

    # Write email.txt
    email_content = f"Subject: {subject}\n\n{body}"
    (session_path / "email.txt").write_text(email_content, encoding="utf-8")

    # Write urls.json alongside email if URLs were included
    if clean_urls:
        import json
        urls_path = STORAGE_DIR / session_id / "urls"
        urls_path.mkdir(parents=True, exist_ok=True)
        (urls_path / "urls.json").write_text(
            json.dumps(clean_urls, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    # Log (no email content in logs per threat_model.md)
    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "session=%s | type=email | subject_len=%d | body_len=%d | "
        "url_count=%d | ip=%s",
        session_id, len(subject), len(body), len(clean_urls), client_ip,
    )

    return {
        "status":     "ok",
        "session_id": session_id,
        "urls_saved": len(clean_urls),
    }
