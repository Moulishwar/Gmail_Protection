# security/validation.py — Input sanitization and size validation

import re
import html
from fastapi import HTTPException

MAX_TEXT_BYTES = 100 * 1024  # 100 KB per agent_rules.md rule 7
MAX_BODY_CHARS = 50_000       # per gmail_dom_selectors.md


def sanitize_text(text: str) -> str:
    """
    Sanitize free-form text by escaping HTML entities.
    Treats all extracted email content as untrusted.
    """
    if not isinstance(text, str):
        return ""
    # Escape HTML special characters to neutralize any embedded markup
    sanitized = html.escape(text, quote=True)
    # Strip null bytes
    sanitized = sanitized.replace("\x00", "")
    return sanitized


def validate_text_size(text: str, field_name: str = "field") -> None:
    """
    Raise HTTP 413 if the UTF-8 encoded size of *text* exceeds 100 KB.
    """
    size = len(text.encode("utf-8"))
    if size > MAX_TEXT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Field '{field_name}' exceeds the 100 KB size limit ({size} bytes).",
        )


def validate_url(url: str) -> bool:
    """
    Return True if *url* looks like a well-formed http/https URL.
    Does NOT make network requests.
    """
    if not isinstance(url, str):
        return False
    pattern = re.compile(
        r"^https?://"                     # scheme
        r"([a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}"  # domain
        r"(:\d+)?"                         # optional port
        r"(/[^\s]*)?$",                    # optional path
        re.IGNORECASE,
    )
    return bool(pattern.match(url.strip()))


def validate_urls_list(urls: list) -> list[str]:
    """
    Validate and sanitize a list of URLs.
    Returns only the URLs that pass validation (up to 500 items).
    """
    if not isinstance(urls, list):
        raise HTTPException(status_code=400, detail="'urls' must be a JSON array.")
    clean = []
    for item in urls[:500]:  # hard cap to prevent huge payloads
        if isinstance(item, str) and validate_url(item.strip()):
            clean.append(item.strip())
    return clean


def extract_urls_from_text(text: str) -> list[str]:
    """
    Extract unique http/https URLs from free-form text using regex.
    Used by the manual-input endpoint when input_type == 'urls'.
    """
    pattern = re.compile(r"https?://[^\s<>\"')\]]+", re.IGNORECASE)
    found = pattern.findall(text)
    seen, result = set(), []
    for url in found:
        url = url.rstrip(".,;:!?")  # strip common trailing punctuation
        if url not in seen and validate_url(url):
            seen.add(url)
            result.append(url)
    return result


def sanitize_filename(filename: str) -> str:
    """
    Return a safe version of a filename — no path separators,
    no null bytes, no leading dots beyond a single extension dot.
    """
    if not isinstance(filename, str):
        return "unknown"
    # Remove any directory traversal sequences
    name = filename.replace("..", "").replace("/", "").replace("\\", "")
    name = name.replace("\x00", "")
    # Limit length
    return name[:255] if name else "unknown"
