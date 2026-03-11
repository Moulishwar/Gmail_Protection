# routes/attachment_routes.py — POST /attachments

import uuid
import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Request, File, UploadFile, Form
from fastapi import HTTPException
from pydantic import BaseModel, field_validator

from security.validation import sanitize_filename, validate_text_size
from security.rate_limit import check_rate_limit
from security.file_checker import (
    is_allowed_type,
    validate_file_size,
    compute_sha256_bytes,
    compute_sha256_string,
    parse_size_to_bytes,
    MAX_FILE_SIZE_BYTES,
    ALLOWED_EXTENSIONS,
)

router = APIRouter()
logger = logging.getLogger("backend")

BASE_DIR    = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"


# ── Models ─────────────────────────────────────────────────────────────────
class AttachmentMeta(BaseModel):
    """Single attachment metadata entry from DOM scraping."""
    filename:  str = "unknown"
    extension: str = ""
    size:      str = "unknown"

    @field_validator("filename", "extension", "size", mode="before")
    @classmethod
    def coerce_str(cls, v):
        return str(v) if v is not None else ""


class AttachmentsPayload(BaseModel):
    attachments: list[AttachmentMeta] = []

    @field_validator("attachments", mode="before")
    @classmethod
    def coerce_list(cls, v):
        return v if isinstance(v, list) else []


# ── Shared: create session dirs ────────────────────────────────────────────
def _make_session(session_id: str) -> tuple[Path, Path]:
    """
    Create storage/session_<uuid>/attachments/files/
    Returns (attachments_dir, files_dir).
    """
    attach_dir = STORAGE_DIR / session_id / "attachments"
    files_dir  = attach_dir / "files"
    attach_dir.mkdir(parents=True, exist_ok=True)
    files_dir.mkdir(parents=True, exist_ok=True)
    return attach_dir, files_dir


# ── Endpoint 1: JSON metadata list (DOM-scraped) ──────────────────────────
@router.post("/attachments", dependencies=[Depends(check_rate_limit)])
async def receive_attachments(request: Request, payload: AttachmentsPayload):
    """
    Accept attachment metadata list scraped from the Gmail DOM.

    Allowed types  → stored in metadata.json as-is.
    Restricted types → stored with SHA-256 fingerprint
                       (hash of 'filename:size' since actual bytes are unavailable).
    """
    if not payload.attachments:
        return {"status": "ok", "session_id": None, "message": "No attachments provided."}

    session_id = f"session_{uuid.uuid4()}"
    attach_dir, _files_dir = _make_session(session_id)

    metadata_list: list[dict] = []
    allowed_count  = 0
    blocked_count  = 0

    for item in payload.attachments[:50]:  # cap at 50 entries
        safe_name = sanitize_filename(item.filename)
        ext       = safe_name.split(".")[-1].lower() if "." in safe_name else item.extension.lower()

        entry: dict = {
            "filename": safe_name,
            "size":     item.size,
            "type":     ext,
        }

        if is_allowed_type(safe_name):
            entry["status"] = "allowed"
            # No actual file bytes available; note this is DOM metadata
            entry["note"] = "DOM metadata only — file not uploaded"
            allowed_count += 1
        else:
            # Compute a fingerprint from the available metadata
            fingerprint_src = f"{safe_name}:{item.size}"
            entry["status"] = "restricted"
            entry["hash"]   = compute_sha256_string(fingerprint_src)
            entry["note"]   = (
                f"Restricted file type (.{ext}). "
                "Full file not stored. SHA-256 fingerprint of metadata recorded."
            )
            blocked_count += 1

        metadata_list.append(entry)

    # Write metadata.json
    (attach_dir / "metadata.json").write_text(
        json.dumps(metadata_list, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "session=%s | type=attachments_meta | total=%d | allowed=%d | blocked=%d | ip=%s",
        session_id, len(metadata_list), allowed_count, blocked_count, client_ip,
    )

    return {
        "status":        "ok",
        "session_id":    session_id,
        "total":         len(metadata_list),
        "allowed":       allowed_count,
        "blocked":       blocked_count,
        "allowed_types": sorted(ALLOWED_EXTENSIONS),
    }


# ── Endpoint 2: Actual file upload (multipart/form-data) ──────────────────
@router.post("/attachments/upload", dependencies=[Depends(check_rate_limit)])
async def upload_attachment(
    request: Request,
    file: UploadFile = File(...),
):
    """
    Accept an actual file upload.

    Allowed types  → saved in attachments/files/<safe_name>
    Restricted types → only metadata + SHA-256 of file content stored.
    Never executed, never written outside storage/.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    safe_name = sanitize_filename(file.filename)
    if not safe_name or safe_name == "unknown":
        raise HTTPException(status_code=400, detail="Invalid filename.")

    # Read file content (capped at MAX_FILE_SIZE_BYTES + 1 to detect oversize)
    content = await file.read(MAX_FILE_SIZE_BYTES + 1)
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the 5 MB limit. Received {len(content)} bytes.",
        )

    session_id = f"session_{uuid.uuid4()}"
    attach_dir, files_dir = _make_session(session_id)

    sha256_hash = compute_sha256_bytes(content)

    if is_allowed_type(safe_name):
        # Store the actual file
        dest = files_dir / safe_name
        dest.write_bytes(content)
        status = "uploaded"
        note   = f"File stored at attachments/files/{safe_name}"
    else:
        # Restricted: store only metadata + hash; do NOT write file bytes
        status = "restricted"
        note   = "File type not allowed. Metadata and hash stored only."

    metadata = {
        "filename": safe_name,
        "size":     f"{len(content)} bytes",
        "type":     safe_name.split(".")[-1].lower() if "." in safe_name else "unknown",
        "hash":     sha256_hash,
        "status":   status,
        "note":     note,
    }

    (attach_dir / "metadata.json").write_text(
        json.dumps([metadata], indent=2, ensure_ascii=False), encoding="utf-8"
    )

    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "session=%s | type=file_upload | filename=%s | size=%d | status=%s | ip=%s",
        session_id, safe_name, len(content), status, client_ip,
    )

    return {
        "status":     "ok",
        "session_id": session_id,
        "file":       safe_name,
        "file_status": status,
        "hash":       sha256_hash,
    }
