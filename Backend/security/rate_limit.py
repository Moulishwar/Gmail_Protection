# security/rate_limit.py — Simple in-memory sliding-window rate limiter

import time
from collections import defaultdict
from fastapi import Request, HTTPException


class _RateLimiter:
    """
    Sliding-window rate limiter.
    Tracks request timestamps per client IP; no external dependencies required.
    """

    def __init__(self, max_requests: int = 10, window_seconds: int = 60) -> None:
        self.max_requests   = max_requests
        self.window_seconds = window_seconds
        # ip → list of request timestamps (float, UNIX epoch)
        self._log: dict[str, list[float]] = defaultdict(list)

    def check(self, client_ip: str) -> None:
        now          = time.monotonic()
        window_start = now - self.window_seconds

        # Purge timestamps outside the current window
        self._log[client_ip] = [
            t for t in self._log[client_ip] if t > window_start
        ]

        if len(self._log[client_ip]) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Rate limit exceeded: maximum {self.max_requests} requests "
                    f"per {self.window_seconds} seconds."
                ),
            )

        self._log[client_ip].append(now)


# Module-level singleton — shared across all route modules
_limiter = _RateLimiter(max_requests=10, window_seconds=60)


async def check_rate_limit(request: Request) -> None:
    """
    FastAPI dependency.  Raises HTTP 429 when the client exceeds the limit.

    Usage:
        @router.post("/endpoint", dependencies=[Depends(check_rate_limit)])
    """
    client_ip = request.client.host if request.client else "unknown"
    _limiter.check(client_ip)
