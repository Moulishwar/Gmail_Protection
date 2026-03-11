# main.py — Gmail Protection FastAPI backend entry point

import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Environment ────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
PORT = int(os.getenv("BACKEND_PORT", "8000"))

# ── Directory setup ────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage"
LOGS_DIR    = BASE_DIR / "logs"
STORAGE_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# ── Logging ────────────────────────────────────────────────────────────────
# Log to file only — never log email content or secrets (threat_model.md)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "backend.log", encoding="utf-8"),
        logging.StreamHandler(),          # also echo to console during development
    ],
)
logger = logging.getLogger("backend")
logger.info("Backend starting — host=%s port=%d", HOST, PORT)

# ── Model loading (once at startup, never per-request) ─────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    from models.model_loader import load_models
    load_models()
    yield

# ── FastAPI app ────────────────────────────────────────────────────────────
app = FastAPI(
    title="Gmail Protection API",
    description="Receives Gmail data from the browser extension for ML-powered phishing analysis.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS — strict: localhost + extension pages only ────────────────────────
# External origins are rejected to prevent cross-site abuse (threat_model.md).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1",
        f"http://127.0.0.1:{PORT}",
        "http://localhost",
        f"http://localhost:{PORT}",
    ],
    # Chrome extension pages have origin chrome-extension://<id>
    allow_origin_regex=r"chrome-extension://[a-z]{32}",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# ── Global error handler — never expose stack traces to clients ────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )

# ── Health endpoint ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """Connection check used by the extension sidebar."""
    return {"status": "ok", "version": "1.0.0"}

# ── Routes ─────────────────────────────────────────────────────────────────
from routes.email_routes        import router as email_router
from routes.url_routes          import router as url_router
from routes.attachment_routes   import router as attachment_router
from routes.manual_input_routes import router as manual_input_router
from routes.analyze_routes      import router as analyze_router

app.include_router(email_router)
app.include_router(url_router)
app.include_router(attachment_router)
app.include_router(manual_input_router)
app.include_router(analyze_router)

# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=False,        # never reload in production
        log_level="warning", # uvicorn logs go to console; app logs go to file
    )
