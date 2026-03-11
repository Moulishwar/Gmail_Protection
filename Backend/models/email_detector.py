# models/email_detector.py — Phishing analysis for email text content.

import re
import logging

import torch
from models.model_loader import get_email_model, DEVICE

logger = logging.getLogger("backend")

_SAFE_IDX     = 0
_PHISHING_IDX = 1


_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)


def _strip_urls(text: str) -> str:
    """Remove all HTTP/HTTPS URLs from text before email model inference."""
    return _URL_RE.sub(" ", text).strip()


def analyze_email(email_text: str) -> dict:
    """
    Preprocess and classify email body text using dima806/phishing-email-detection.

    Steps:
      1. Strip embedded URLs — URL features belong to the URL model only.
      2. Tokenize with truncation at 512 tokens (model max).
      3. Run the DistilBERT classifier.
      4. Apply softmax; read prob[0] (safe) vs prob[1] (phishing).

    Returns:
        {
            "type":       "email",
            "score":      float,   # prob[1] — phishing probability (0–1)
            "confidence": float,   # max(prob[0], prob[1]) — certainty of the decision
            "label":      "phishing" | "safe"
        }
    """
    tokenizer, model = get_email_model()

    clean_text = _strip_urls(email_text)
    logger.info(
        "Email model: input length before/after URL strip: %d / %d chars",
        len(email_text), len(clean_text),
    )

    inputs = tokenizer(
        clean_text,
        return_tensors="pt",
        truncation=True,
        max_length=512,
    )
    inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.nn.functional.softmax(outputs.logits, dim=-1)[0].tolist()

    safe_score     = probs[_SAFE_IDX]
    phishing_score = probs[_PHISHING_IDX]
    label          = "phishing" if phishing_score > safe_score else "safe"
    confidence     = max(safe_score, phishing_score)

    logger.info(
        "Email model result: label=%s phishing_prob=%.4f safe_prob=%.4f confidence=%.4f",
        label, phishing_score, safe_score, confidence,
    )

    return {
        "type":       "email",
        "score":      round(phishing_score, 4),
        "confidence": round(confidence, 4),
        "label":      label,
    }
