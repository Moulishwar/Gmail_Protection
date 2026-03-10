# routes/manual_input_routes.py — POST /manual-input

import uuid
import json
import logging
from pathlib import Path
from enum import Enum

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, field_validator

from security.validation import (
    sanitize_text,
    validate_text_size,
    extract_urls_from_text,
    validate_urls_list,
)
from security.rate_limit import check_rate_limit

router = APIRouter()
logger = logging.getLogger("backend")

BASE_DIR    = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"


class InputType(str, Enum):
    urls = "urls"
    text = "text"


# ── Request model ──────────────────────────────────────────────────────────
class ManualInputPayload(BaseModel):
    input_type: InputType
    content:    str

    @field_validator("content", mode="before")
    @classmethod
    def coerce_str(cls, v):
        return str(v) if v is not None else ""


# ── Endpoint ───────────────────────────────────────────────────────────────
@router.post("/manual-input", dependencies=[Depends(check_rate_limit)])
async def receive_manual_input(request: Request, payload: ManualInputPayload):
    """
    Accept manually pasted content from the sidebar.

    input_type == 'urls'  → extract all URLs from the text, store as urls.json
    input_type == 'text'  → sanitize and store as manual_input.txt
    """
    validate_text_size(payload.content, "content")

    session_id = f"session_{uuid.uuid4()}"
    client_ip  = request.client.host if request.client else "unknown"

    if payload.input_type == InputType.urls:
        # Extract URLs from the pasted text
        extracted = extract_urls_from_text(payload.content)

        if not extracted:
            raise HTTPException(
                status_code=400,
                detail="No valid http/https URLs found in the submitted text.",
            )

        session_path = STORAGE_DIR / session_id / "urls"
        session_path.mkdir(parents=True, exist_ok=True)

        (session_path / "urls.json").write_text(
            json.dumps(extracted, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        logger.info(
            "session=%s | type=manual_urls | url_count=%d | ip=%s",
            session_id, len(extracted), client_ip,
        )

        return {
            "status":     "ok",
            "session_id": session_id,
            "input_type": "urls",
            "url_count":  len(extracted),
        }

    else:  # input_type == 'text'
        safe_content = sanitize_text(payload.content)

        session_path = STORAGE_DIR / session_id / "manual"
        session_path.mkdir(parents=True, exist_ok=True)

        (session_path / "manual_input.txt").write_text(safe_content, encoding="utf-8")

        logger.info(
            "session=%s | type=manual_text | size=%d | ip=%s",
            session_id, len(safe_content), client_ip,
        )

        return {
            "status":     "ok",
            "session_id": session_id,
            "input_type": "text",
            "size":       len(safe_content),
        }
