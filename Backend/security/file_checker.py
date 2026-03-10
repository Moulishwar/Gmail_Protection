# security/file_checker.py — File type validation and SHA-256 hashing

import hashlib
from pathlib import Path

# Allowed file extensions for full upload (from project_spec.json)
ALLOWED_EXTENSIONS: frozenset[str] = frozenset({"pdf", "docx", "txt", "png", "jpg"})

# Maximum allowed file size in bytes (5 MB per spec)
MAX_FILE_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB


def get_extension(filename: str) -> str:
    """Return the lowercased extension of *filename* (without the leading dot)."""
    return Path(filename).suffix.lstrip(".").lower()


def is_allowed_type(filename: str) -> bool:
    """Return True if the file extension is in the allowed list."""
    return get_extension(filename) in ALLOWED_EXTENSIONS


def validate_file_size(size_bytes: int) -> bool:
    """Return True if *size_bytes* is within the 5 MB limit."""
    return 0 < size_bytes <= MAX_FILE_SIZE_BYTES


def compute_sha256_bytes(data: bytes) -> str:
    """Compute the hex-encoded SHA-256 digest of raw bytes."""
    return hashlib.sha256(data).hexdigest()


def compute_sha256_string(text: str) -> str:
    """
    Compute the hex-encoded SHA-256 digest of a UTF-8 string.
    Used when the actual file bytes are unavailable (DOM-scraped metadata).
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def compute_sha256_file(path: Path) -> str:
    """Compute SHA-256 of an on-disk file in streaming chunks."""
    hasher = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def parse_size_to_bytes(size_str: str) -> int:
    """
    Convert a human-readable size string (e.g. '120 KB', '2.5 MB') to bytes.
    Returns 0 if parsing fails.
    """
    size_str = size_str.strip().upper()
    multipliers = {"KB": 1024, "MB": 1024 ** 2, "GB": 1024 ** 3, "B": 1}
    for suffix, factor in multipliers.items():
        if size_str.endswith(suffix):
            try:
                return int(float(size_str[: -len(suffix)].strip()) * factor)
            except ValueError:
                return 0
    try:
        return int(float(size_str))
    except ValueError:
        return 0
