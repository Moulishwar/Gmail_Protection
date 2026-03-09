# threat_model.md

## Purpose

This document defines the threat model for the Gmail Protection extension.

The extension processes **untrusted email data**, which means attackers may attempt to exploit:

• the browser extension
• the backend server
• file upload handling
• URL extraction logic

The goal is to identify risks early and enforce mitigations during development.

---

# System Overview

Components:

1. Browser Extension
2. FastAPI Backend
3. Temporary Storage
4. Future ML Processing Pipeline

Data flow:

User opens Gmail email
↓
Extension extracts content
↓
User selects data to send
↓
Data sent to backend
↓
Backend validates and stores data
↓
Future ML analysis
↓
Result returned to extension
↓
Data deleted

---

# Trust Boundaries

There are three trust zones.

### Zone 1 – Gmail Content (Untrusted)

Email content must be treated as **fully untrusted**.

Attackers control:

• subject lines
• email body
• links
• attachments

Possible malicious payloads include:

• embedded scripts
• malicious URLs
• malware attachments

---

### Zone 2 – Extension Environment (Semi-trusted)

The extension runs in the browser but interacts with untrusted content.

Risks include:

• DOM-based injection
• malicious links embedded in emails
• extension privilege abuse

---

### Zone 3 – Backend Server (Trusted)

The backend must validate all input.

Threats include:

• malicious file uploads
• denial of service attacks
• path traversal attacks
• malformed JSON payloads

---

# STRIDE Threat Analysis

## 1. Spoofing

Attackers may attempt to impersonate legitimate sources.

Example:

Phishing email pretending to be a trusted domain.

Impact:

Users may trust malicious emails.

Mitigation:

The extension must **never assume email legitimacy**.

ML models in Stage 3 will evaluate:

• email content
• domain reputation
• URL patterns

---

## 2. Tampering

Attackers may attempt to modify system behavior.

Example:

Malicious email containing HTML designed to break DOM parsing.

Impact:

Incorrect extraction of email content.

Mitigation:

Extract only:

• plain text
• anchor href values

Never use:

innerHTML

Always sanitize extracted content.

---

## 3. Repudiation

Attackers may deny malicious activity.

Example:

Malicious attachments uploaded to backend.

Mitigation:

Backend logging must record:

timestamp
session_id
request_type
file_size

Logs must not contain sensitive data.

---

## 4. Information Disclosure

Sensitive data may leak.

Example risks:

• extension accidentally exposing email content
• backend logs storing email data
• cross-origin requests exposing backend

Mitigations:

• strict CORS policy
• do not log email content
• do not store data permanently
• session data deleted after processing

---

## 5. Denial of Service

Attackers may overload the backend.

Example attacks:

• repeated requests
• large file uploads
• extremely long email content

Mitigations:

• rate limiting (10 requests/minute)
• max file size (5MB)
• text payload limit (100KB)

---

## 6. Elevation of Privilege

Attackers attempt to gain higher privileges.

Example:

Attachment containing executable code.

Impact:

Backend compromise.

Mitigation:

• never execute uploaded files
• restrict file types
• hash disallowed attachments instead of storing them

Allowed upload types:

pdf
docx
txt
png
jpg

---

# Attachment Threats

Attachments are the **highest risk component**.

Potential threats:

• malware executables
• macro-based documents
• disguised file types
• archive bombs

Mitigation strategy:

Allowed files → stored normally.

Disallowed files → metadata + SHA256 hash only.

Example metadata:

filename: invoice.exe
size: 120kb
hash: SHA256_HASH

---

# URL Threats

Email links are common phishing vectors.

Potential threats:

• credential harvesting pages
• domain impersonation
• redirect chains

Mitigation (Stage 3):

URL phishing classifier.

---

# DOM Injection Risks

Emails may contain malicious HTML.

Example:

embedded script tags

Mitigation:

Extract only **visible text**.

Never evaluate scripts from email content.

---

# Backend Storage Risks

Attackers may attempt to manipulate file paths.

Example:

../../etc/passwd

Mitigation:

• reject paths containing ".."
• use UUID session directories
• never allow user-controlled paths

---

# Data Lifecycle Security

Data retention must be minimal.

Lifecycle:

Receive data
↓
Temporary storage
↓
ML analysis (future stage)
↓
Send result to extension
↓
Delete session folder

Deletion must use:

shutil.rmtree(session_directory)

---

# Browser Extension Threats

Possible threats:

• malicious Gmail content interfering with extension logic
• extension script injection
• unsafe messaging between extension components

Mitigation:

• strict content security policy
• avoid inline scripts
• validate messages between extension components

---

# Security Principles

The project must follow these principles.

Least privilege
Input validation
Fail securely
Temporary data storage
Defense in depth

---

# Security Testing Requirements

The system must be tested against:

• phishing emails with multiple links
• emails containing malicious HTML
• attachments with disallowed types
• extremely long email bodies
• malformed JSON requests

---

# Future Security Enhancements (Stage 3)

Planned improvements:

ML phishing detection
malware attachment analysis
URL reputation checks

---

# Final Security Requirement

The system must assume:

**All incoming data is malicious until proven safe.**

Every input must be validated before processing.
