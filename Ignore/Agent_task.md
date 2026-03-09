# AI Coding Agent Task – Gmail Protection Extension

## Objective

Implement **Stage 1 and Stage 2** of the Gmail Protection system.

The system is a browser extension that analyzes Gmail messages and sends relevant data to a backend for phishing and malware detection.

The extension must work **locally** and communicate with a **FastAPI backend**.

Security must be treated as the highest priority.

---

# Stage 1 – Extension Deployment and Communication

## Goal

Create a working extension that can:

1. Detect if the current page contains a Gmail email.
2. Notify the user that an email is detected.
3. Connect to the backend server.
4. Allow the user to send email data manually.

---

## Required Features

### Gmail Detection

The extension must run only on:

https://mail.google.com/*

Use DOM scraping to detect:

• Email subject
• Email body
• URLs in the email
• Attachments

Display:

"Email detected on this page"

if the user is currently viewing a message.

---

### Sidebar UI

Implement a Gmail sidebar panel containing:

Sections:

1. Email Status
2. Send Entire Email
3. Send Email Components
4. Manual Input

---

### Send Entire Email

Button:

Send Entire Email

Action:

Extract:

• Subject
• Body text
• URLs

Send to backend.

---

### Send Email Components

Dropdown:

* URLs
* Text Content
* Attachments

Button:

Send Selected Component

Behavior:

URLs → send all links from email
Text → send subject + body
Attachments → send attachment data

---

### Manual Input

Manual text box.

Dropdown options:

• URLs
• Text Content

User can paste:

• one URL
• multiple URLs
• arbitrary text
• copied email content

Backend must parse URLs automatically if option is URLs.

---

### Backend Connection Indicator

Display:

Backend Status: Connected / Disconnected

Test connection via:

GET /health

---

# Stage 2 – Backend Data Processing and Storage

## Backend Stack

Python + FastAPI

---

## API Endpoints

GET /health
POST /email
POST /urls
POST /attachments
POST /manual-input

---

## Session Isolation

Every request must create a unique session folder.

Example:

storage/session_<UUID>/

---

## Storage Structure

backend/storage/

session_<UUID>/
email/
email.txt
urls/
urls.json
attachments/
files/
metadata.json

---

## Email Storage

email.txt contains:

Subject
Body

---

## URL Storage

urls.json example:

[
"https://example.com",
"http://phishing-site.com"
]

---

## Attachment Handling

### Allowed Upload Types

pdf
docx
txt
png
jpg

Max file size:

5MB

These files must be uploaded fully.

---

### Restricted File Types

All other file types must NOT be uploaded.

Instead store metadata:

Example metadata.json:

{
"filename": "invoice.exe",
"size": "120kb",
"hash": "SHA256_HASH"
}

Compute hash using SHA256.

---

# Security Requirements

Must implement:

Input validation
File type validation
File size validation
Path traversal prevention
Rate limiting
Strict CORS
UUID session isolation
Temporary storage

Never execute uploaded files.

Never store files outside the storage directory.

---

# Logging

Backend must log:

timestamp
session_id
request_type
file_size

Log file:

logs/backend.log

---

# Stage 3 – Future Implementation

Machine learning models will analyze:

Email text
URLs
Attachments

Results returned to frontend.

Example response:

{
"email": "phishing",
"urls": "malicious",
"attachments": "safe"
}

---

# Stage 4 – Data Deletion

After result is returned:

Delete the session folder.

Example:

shutil.rmtree(storage/session_<UUID>)

---

# Development Setup

Create .env file.

Example:

BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000

Extension must read backend address from .env.

---

# Deliverables

Working extension
Working FastAPI backend
Secure storage system
API endpoints implemented
Sidebar UI working
