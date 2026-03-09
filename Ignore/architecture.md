# Gmail Protection Architecture

## Overview

The system consists of two components:

1. Browser Extension
2. Backend Server

The extension collects Gmail data and sends it to the backend.

The backend stores the data securely for later ML processing.

---

# System Flow

User opens Gmail email
↓
Extension detects email page
↓
User selects what to send
↓
Extension extracts data via DOM
↓
Data sent to FastAPI backend
↓
Backend validates and stores data

---

# Extension Architecture

Components:

manifest.json
background.js
content.js
sidebar.html
sidebar.js
sidebar.css

---

## content.js

Runs inside Gmail.

Responsibilities:

Detect email view
Extract subject
Extract body text
Extract links
Detect attachments

---

## sidebar.js

Handles:

User interaction
Dropdown options
Manual input
Sending requests to backend

---

# Backend Architecture

backend/

main.py
routes/
security/
storage/
logs/

---

## main.py

Initializes FastAPI server.

Loads environment variables.

Registers API routes.

---

## routes

email_routes.py
url_routes.py
attachment_routes.py
manual_input_routes.py

---

## security

validation.py
rate_limit.py
file_checker.py

---

# Storage Model

Each request gets isolated storage.

storage/session_<UUID>/

Inside session folder:

email/
urls/
attachments/

---

# Attachment Handling Model

Allowed types:

pdf
docx
txt
png
jpg

If allowed:

store full file.

If not allowed:

store metadata + SHA256 hash.

---

# Future Machine Learning Pipeline

Stage 3 will load ML models.

Pipeline:

Email → phishing classifier
URLs → phishing URL detector
Attachments → malware detector

---

# Data Lifecycle

1. Data received
2. Stored temporarily
3. ML analysis performed
4. Result returned to extension
5. Session deleted

---

# Security Boundaries

Extension only runs on Gmail.

Backend only accepts local requests.

All input validated before storage.

File execution never permitted.
