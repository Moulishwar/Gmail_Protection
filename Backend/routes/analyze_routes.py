# routes/analyze_routes.py — POST /analyze
# Runs both phishing detection models and returns a structured verdict.

import os
import json
import shutil
import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, field_validator

from security.validation import sanitize_text, validate_text_size
from security.rate_limit import check_rate_limit
from models.email_detector import analyze_email
from models.url_detector import analyze_url

router = APIRouter()
logger = logging.getLogger("backend")

BASE_DIR    = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"



_VALID_MODES = {"full", "urls_only", "text_only"}

class AnalyzePayload(BaseModel):
    subject: str       = ""
    body:    str       = ""
    urls:    list[str] = []
    mode:    str       = "full"

    @field_validator("subject", "body", mode="before")
    @classmethod
    def coerce_str(cls, v):
        return str(v) if v is not None else ""

    @field_validator("urls", mode="before")
    @classmethod
    def coerce_list(cls, v):
        return v if isinstance(v, list) else []

    @field_validator("mode", mode="before")
    @classmethod
    def coerce_mode(cls, v):
        return v if v in _VALID_MODES else "full"


# ── Endpoint ────────────────────────────────────────────────────────────────
@router.post("/analyze", dependencies=[Depends(check_rate_limit)])
async def analyze(request: Request, payload: AnalyzePayload):
    """
    Accept subject + body + URL list, run both phishing detection models,
    and return a structured verdict.

    Controlled by Delete_after_analysis env variable:
      Yes → session data is purged from disk once the result is returned.
      No  → session data is kept for debugging.
    """
    # ── Input validation ────────────────────────────────────────────────────
    validate_text_size(payload.subject, "subject")
    validate_text_size(payload.body,    "body")

    subject    = sanitize_text(payload.subject)
    body       = sanitize_text(payload.body)
    clean_urls: list[str] = []
    for u in payload.urls[:500]:
        if isinstance(u, str) and u.startswith(("http://", "https://")):
            clean_urls.append(u.strip()[:2048])

    # ── Session storage ─────────────────────────────────────────────────────
    session_id   = f"session_{uuid.uuid4()}"
    session_path = STORAGE_DIR / session_id
    email_path   = session_path / "email"
    email_path.mkdir(parents=True, exist_ok=True)

    email_content = f"Subject: {subject}\n\n{body}"
    (email_path / "email.txt").write_text(email_content, encoding="utf-8")

    if clean_urls:
        urls_path = session_path / "urls"
        urls_path.mkdir(parents=True, exist_ok=True)
        (urls_path / "urls.json").write_text(
            json.dumps(clean_urls, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    mode = payload.mode   # "full" | "urls_only" | "text_only"

 
    run_email = mode in ("full", "text_only")
    run_urls  = mode in ("full", "urls_only") and bool(clean_urls)

    logger.info(
        "session=%s | mode=%s run_email=%s run_urls=%s "
        "(subject_len=%d body_len=%d url_count=%d)",
        session_id, mode, run_email, run_urls,
        len(subject), len(body), len(clean_urls),
    )

    # ── Model inference ─────────────────────────────────────────────────────
    if run_email:
        email_result = analyze_email(email_content)
    else:
        email_result = {"type": "email", "score": 0.0, "confidence": 0.0, "label": "safe"}

    url_results = [analyze_url(url) for url in clean_urls] if run_urls else []

    # ── Verdict aggregation ─────────────────────────────────────────────────
    email_phishing_score = email_result["score"] if run_email else 0.0
    url_phishing_scores  = [r["score"] for r in url_results]
    highest_url_score    = max(url_phishing_scores) if url_phishing_scores else 0.0
    final_score          = max(email_phishing_score, highest_url_score)
    verdict              = "phishing" if final_score >= 0.5 else "safe"

    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "session=%s | type=analyze | verdict=%s | final_score=%.4f | url_count=%d | ip=%s",
        session_id, verdict, final_score, len(clean_urls), client_ip,
    )

    # ── Conditional data deletion ───────────────────────────────────────────
    delete_after = os.getenv("Delete_after_analysis", "No").strip().lower() == "yes"
    if delete_after:
        shutil.rmtree(session_path, ignore_errors=True)
        logger.info("session=%s | data deleted after analysis", session_id)

    return {
        "verdict":        verdict,
        "final_score":    round(final_score, 4),
        "email_analysis": email_result,
        "url_analysis":   url_results,
        "session_id":     session_id,
    }
