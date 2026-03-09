# agent_rules.md

## Purpose

This file defines **strict rules and guardrails** for the AI coding agent implementing the Gmail Protection project.

The agent must follow these rules **exactly**.
Any deviation may introduce security vulnerabilities or break the Gmail integration.

---

# 1. Project Scope Rules

The agent must **ONLY implement Stage 1 and Stage 2**.

Do NOT implement:

* ML model loading
* phishing detection logic
* malware scanning
* user authentication
* cloud deployment

Stage 3 and Stage 4 are **future work only**.

---

# 2. Technology Constraints

The system must use the following stack:

Extension:

* Manifest V3
* Vanilla JavaScript
* HTML + CSS

Backend:

* Python
* FastAPI

Storage:

* Local filesystem

Do NOT introduce:

* React
* Node backend
* databases
* cloud storage
* external services

---

# 3. Gmail DOM Safety Rules

The extension must **never modify Gmail page content**.

Allowed actions:

* read DOM elements
* extract text
* extract links
* detect attachments

Forbidden actions:

* modifying Gmail DOM
* injecting scripts into email body
* altering Gmail UI elements
* blocking Gmail scripts

Selectors must be **read-only operations**.

---

# 4. Gmail Page Detection

The extension must only run on:

https://mail.google.com/*

The extension must verify that the user is **viewing an email**, not the inbox.

Detection signals may include:

* presence of email subject container
* message body container
* email header region

If no email is detected:

Display:

"No email currently open."

---

# 5. DOM Extraction Rules

When extracting content:

Email Subject:
Extract plain text only.

Email Body:
Extract visible text only.

URLs:
Extract from anchor tags and visible text.

Attachments:
Detect attachment elements but do not attempt to download files automatically.

---

# 6. Backend Communication Rules

All backend communication must go through:

HTTP requests to:

http://localhost:<BACKEND_PORT>

The port must be loaded from `.env`.

Never hardcode ports.

---

# 7. Input Security Rules

All user input must be sanitized before processing.

Sanitize:

* HTML
* script tags
* special characters

Reject input larger than:

100 KB for text fields.

---

# 8. File Upload Security

Attachment uploads must follow strict rules.

Maximum file size:

5MB

Allowed file types:

pdf
docx
txt
png
jpg

Allowed files may be uploaded.

All other file types must NOT be uploaded.

Instead store:

filename
size
SHA256 hash

Never attempt to execute uploaded files.

---

# 9. Path Traversal Protection

All file writes must occur inside:

backend/storage/

Never allow:

../
absolute paths
user-controlled file paths

Use UUID folder names only.

Example:

storage/session_<UUID>/

---

# 10. Session Isolation

Each request must generate a unique session folder.

Sessions must not share files.

Session ID format:

session_<uuid4>

Example:

session_7e13a7c4

---

# 11. Logging Rules

The backend must log:

timestamp
session_id
request_type
file_size

Log location:

backend/logs/backend.log

Logs must not contain:

email content
attachment contents
user secrets

---

# 12. Rate Limiting

Backend must implement basic rate limiting.

Recommended:

10 requests per minute per client.

Purpose:

Prevent backend abuse.

---

# 13. CORS Rules

Backend must allow requests only from:

localhost

Reject external origins.

---

# 14. Manual Input Rules

Manual input supports two types:

URLs
Text content

If URL mode is selected:

Backend must extract all URLs from the text.

If text mode is selected:

Store content as plain text.

---

# 15. Extension UI Safety

UI must be rendered only in the extension sidebar.

Do NOT:

inject UI directly into Gmail page
overlay Gmail elements
modify Gmail layout

---

# 16. Error Handling Rules

If backend connection fails:

Display:

"Backend server not reachable."

If data extraction fails:

Display:

"Unable to extract email content."

Errors must never expose stack traces to users.

---

# 17. Code Quality Rules

Code must include:

clear function names
inline comments
modular files

Avoid:

monolithic scripts
duplicate logic
hardcoded paths

---

# 18. Forbidden Behaviors

The agent must NOT:

download attachments automatically
execute attachment files
inject scripts into Gmail
store user Gmail credentials
send data to external servers

---

# 19. Future Stage Preparation

The architecture must allow future integration of:

ML phishing models
URL classifiers
malware detectors

Do NOT implement these yet.

Only prepare the pipeline structure.

---

# 20. Completion Criteria

The task is complete when:

* Extension loads successfully in the browser
* Sidebar UI appears in Gmail
* Email detection works
* Backend connection works
* Email content can be sent to backend
* URLs can be sent to backend
* Attachments follow the upload rules
* Data is stored in session folders
* Metadata and hashes are generated for blocked files
* Backend logs are written
