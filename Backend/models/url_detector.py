# models/url_detector.py — Phishing analysis for individual URLs.

import re
import logging
from urllib.parse import urlparse, urlunparse

from models.model_loader import get_url_pipeline
from security.domain_trust import is_trusted_domain, TRUST_SCORE_MULTIPLIER

logger = logging.getLogger("backend")


_LABEL_MAP = {"LABEL_0": "safe", "LABEL_1": "phishing"}

_URL_MODEL_MAX_TOKENS = 64


_REDIRECT_PREFIXES = re.compile(
    r"^(/(?:redirect|r|go|out|click|track|link|l))/.*$",
    re.IGNORECASE,
)


def normalize_url(url: str) -> str:
    """
    Normalize a URL before sending it to the tokenizer.
    """
    try:
        parsed = urlparse(url)
        path   = parsed.path

        # Collapse redirect-style paths: keep the prefix, drop the variable segment.
        redirect_match = _REDIRECT_PREFIXES.match(path)
        if redirect_match:
            path = redirect_match.group(1)   # e.g. "/redirect"

        normalized = urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))

        # Strip trailing slash only when the path is exactly "/" (root).
        if normalized.endswith("/") and path == "/":
            normalized = normalized.rstrip("/")

        return normalized
    except Exception:
        return url


def analyze_url(url: str) -> dict:
    """
    Full URL analysis pipeline:
        raw URL
        → normalize_url()       (drop query, collapse redirect path)
        → is_trusted_domain()   (score dampening — never skip model)
        → urlbert-tiny          (ML classification)
        → adjusted score & label

    Returns:
        {
            "type":           "url",
            "url":            str,    # original URL shown to the user
            "domain":         str,
            "trusted_domain": bool,
            "model_score":    float,  # raw model phishing probability
            "score":          float,  # adjusted score (after trust dampening)
            "label":          "phishing" | "safe"
        }
    """
    clf = get_url_pipeline()

    normalized = normalize_url(url)
    if normalized != url:
        logger.info("URL normalized: %s", normalized)

    # Extract domain for trust check.
    try:
        domain = urlparse(normalized).netloc.lower()
    except Exception:
        domain = ""

    trusted = is_trusted_domain(domain) if domain else False

    raw_results = clf(
        normalized,
        truncation=True,
        max_length=_URL_MODEL_MAX_TOKENS,
        padding="max_length",
    )[0]

    scores = {
        _LABEL_MAP.get(r["label"], r["label"]): r["score"]
        for r in raw_results
    }

    model_score = scores.get("phishing", 0.0)


    if trusted:
        adjusted_score = model_score * TRUST_SCORE_MULTIPLIER
        logger.info(
            "Trusted domain adjustment: domain=%s model_score=%.4f adjusted_score=%.4f",
            domain, model_score, adjusted_score,
        )
    else:
        adjusted_score = model_score

    label = "phishing" if adjusted_score >= 0.5 else "safe"

    return {
        "type":           "url",
        "url":            url,
        "domain":         domain,
        "trusted_domain": trusted,
        "model_score":    round(model_score, 4),
        "score":          round(adjusted_score, 4),
        "label":          label,
    }
