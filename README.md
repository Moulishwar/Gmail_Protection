## Gmail Phishing Protection
Chrome extension + FastAPI backend for detecting phishing content in Gmail emails using transformer‑based machine learning models.

---

### Overview
This project adds a **side panel to Gmail (Chrome Manifest V3 extension)** that analyses the currently open email for phishing indicators. It streams:

- **Email text content** → to an email‑phishing model (DistilBERT based)
- **Embedded URLs** → to a URL‑phishing model (URLBERT based)

The Python **FastAPI** backend runs both models, combines the results, and returns a structured verdict that the extension renders as a clear risk dashboard (overall verdict, email risk, per‑URL risk).

---

### Key Features
- **End‑to‑end phishing analysis for Gmail**
  - Chrome side‑panel extension that detects the open email, extracts subject, body, URLs, and basic attachment metadata.
  - Sends data to a FastAPI backend for real‑time phishing analysis.

- **ML models for email text & URLs**
  - Email: HuggingFace DistilBERT‑based classifier (`dima806/phishing-email-detection`) for phishing email detection.
  - URLs: HuggingFace URLBERT‑based classifier for phishing URL detection with:
    - URL normalization (strip query/fragment, collapse redirect paths like `/redirect/<token>` → `/redirect`)
    - Token‑safe preprocessing (`max_length=64`, truncation and padding) to avoid tensor shape errors.

- **Trusted domain reputation layer**
  - `security/domain_trust.py` maintains a curated allowlist (e.g. `google.com`, `github.com`, `substack.com`, etc.).
  - URLs from trusted domains are **not auto‑whitelisted**; their phishing score is dampened by a multiplier but the model always runs.

- **Secure backend pipeline**
  - Centralised model loading at startup (`models/model_loader.py`) to avoid per‑request load overhead.
  - Input validation and size limits (`security/validation.py`), rate limiting (`security/rate_limit.py`).
  - Per‑session storage under `Backend/storage/session_*` with optional deletion controlled by `.env`.

- **Rich Chrome UI**
  - Main **“Phishing Analysis”**: subject + body + all URLs → overall verdict + detailed breakdown.
  - **“Analyse Email Components”**: analyse only URLs, only text, or show attachment metadata.
  - **“Manual Input”**: paste URLs or text and analyse them directly.
  - Clear banners for **SAFE / PHISHING**, per‑URL scores, loading spinners, and non‑blocking error messages.

---

### Project Structure (high‑level)

```text
Gmail_Protection/
  Backend/
    main.py                 # FastAPI entrypoint (lifespan loads models)
    requirements.txt        # Backend dependencies
    .env                    # Backend configuration (not committed)
    models/
      __init__.py
      model_loader.py       # Loads email + URL models once on startup
      email_detector.py     # Email text phishing analysis
      url_detector.py       # URL phishing analysis + normalization + trust
    routes/
      analyze_routes.py     # /analyze – main ML endpoint (email+URLs)
      email_routes.py       # Legacy /email endpoints (optional)
      url_routes.py         # Legacy /url endpoints (optional)
      manual_input_routes.py
      attachment_routes.py
    security/
      __init__.py
      domain_trust.py       # Trusted domain list + score dampening
      validation.py         # Input sanitation and size checks
      rate_limit.py         # Simple rate limiting
      file_checker.py       # Attachment safety checks (basic)
    storage/                # Per-session email/URL files (runtime only)
    logs/                   # Backend logs (runtime only)

  Extension/
    manifest.json           # Chrome extension manifest (MV3)
    sidebar.html/.css/.js   # Side panel UI and logic
    popup.html/.css/.js     # Browser action popup (if enabled)
    background.js           # Service worker / message routing
    contentScript.js        # Injected into Gmail to extract email data
    config.js               # Backend base URL + endpoints

  Train/                    # Notebooks / experiments (ignored in git)
  Ignore/                   # Design docs, threat model, etc.
```

---

### Backend Setup

1. **Python environment**

   Create and activate a virtual environment (or use conda):

   ```bash
   cd Backend
   python -m venv .venv
   .venv\Scripts\activate      # on Windows
   # source .venv/bin/activate # on macOS / Linux
   ```

2. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment (.env)**

   Create `Backend/.env` (the repo already assumes this exists) with for example:

   ```env
   Delete_after_analysis=No   # Yes|No – delete session_* storage after analysis
   ```

   You can add other settings (like port, log level) as needed.

4. **Run the backend**

   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

   The main analysis endpoint is:

   - `POST /analyze`

   Request body (simplified):

   ```json
   {
     "subject": "string",
     "body": "string",
     "urls": ["https://example.com"],
     "mode": "full" | "urls_only" | "text_only"
   }
   ```

   Response (simplified):

   ```json
   {
     "verdict": "safe" | "phishing",
     "final_score": 0.74,
     "email_analysis": { "label": "safe", "score": 0.12, "confidence": 0.9 },
     "url_analysis": [
       {
         "url": "https://example.com",
         "label": "phishing",
         "score": 0.81,
         "trusted_domain": false
       }
     ],
     "session_id": "session_xxx"
   }
   ```

---

### Chrome Extension Setup

1. **Configure backend URL**

   In `Extension/config.js`, set the backend base URL (by default `http://127.0.0.1:8000` or your deployed URL).

2. **Load the extension in Chrome**

   - Go to `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the `Extension/` directory.

3. **Using the extension**

   - Open Gmail in Chrome.
   - Open an email message.
   - Open the extension side panel (depending on your manifest / settings, via the jigsaw icon or a pinned sidebar).
   - The extension will:
     - Detect the open email.
     - Show “Phishing Analysis”, “Analyse Email Components”, and “Manual Input” sections.
     - Let you run analysis and view the detailed risk breakdown.

---

### Modes & Workflow

- **Phishing Analysis (full)**  
  - Sends subject + body + all extracted URLs with `mode="full"` to `/analyze`.  
  - Backend runs **both** models and aggregates scores.

- **Analyse Email Components → URLs**  
  - Sends only URLs with `mode="urls_only"`.  
  - Backend **skips the email model** to avoid empty‑body artefacts and only evaluates URLs.

- **Analyse Email Components → Text Content**  
  - Sends subject + body, no URLs, `mode="text_only"`.  
  - Backend **only** runs the email model.

- **Manual Input**  
  - “URLs”: extracts URLs from the textarea and sends with `mode="urls_only"`.  
  - “Text”: sends the pasted text as body with `mode="text_only"`.

---

### Data Handling & Privacy

- The backend writes each request to a per‑session folder under `Backend/storage/session_*`:
  - `email/email.txt` – subject + body
  - `urls/urls.json` – list of URLs (if any)
- When `Delete_after_analysis=Yes`, the session directory is removed after returning a response.
- Logs are written to `Backend/logs/` (log files are ignored by git).

This setup is primarily intended for **local analysis and experimentation**, not as a drop‑in production service. For deployment, you should harden auth, logging, and hosting according to your environment’s security requirements.

---

### Notes
- The repository includes extra routes (`email_routes.py`, `url_routes.py`, `manual_input_routes.py`, `attachment_routes.py`) that were used during earlier experimentation; the primary production path is **`POST /analyze`**.
- Training notebooks and datasets live under `Train/` and are **ignored** from version control to keep the repo lightweight.

If you’re reviewing this project as part of a portfolio: the core focus is on **integrating modern ML models into a real user‑facing workflow**, with attention to **security, false‑positive reduction, and a usable Chrome UI**.
