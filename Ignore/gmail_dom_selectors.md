# gmail_dom_selectors.md

## Purpose

Gmail frequently changes its DOM structure.
This file defines **reliable selectors and fallback strategies** to extract email data.

The AI coding agent must follow these selectors in priority order.

Selectors must always be used in **read-only mode**.

The extension must never modify Gmail DOM elements.

---

# Gmail Page Detection

The extension must only activate on:

https://mail.google.com/*

To determine if the user is viewing an email:

Primary selector:

div[role="main"] .a3s

Fallback selectors:

div.a3s
div.gs
div.ii.gt

If none are found, assume the user is not viewing an email.

---

# Email Subject Extraction

Primary selector:

h2.hP

Fallback selectors:

div[role="heading"]
span.hP

Extraction rule:

Read **innerText only**.

Remove extra whitespace.

---

# Email Body Extraction

Primary selector:

div.a3s.aiL

Fallback selectors:

div.a3s
div.ii.gt

Extraction rules:

Extract visible text only.

Ignore hidden elements.

Do not extract:

script
style
noscript

Use:

innerText

Do NOT use innerHTML.

---

# URL Extraction

URLs may appear in two places:

1. Anchor tags
2. Plain text

---

## Anchor Tag Extraction

Selector:

div.a3s a

Extract:

href attribute

Ignore links starting with:

mailto:
javascript:

---

## Plain Text URL Detection

Use regex detection on body text.

Example pattern:

https?://[^\s]+

---

# Attachment Detection

Gmail attachments appear in a container near the bottom of the email.

Primary selector:

div.aQH

Fallback selectors:

div.aZo
div.aQy

Inside this container, find attachment elements.

Attachment selectors:

div.aQy span.aV3
span.aV3

---

# Attachment Metadata Extraction

Extract:

filename
file type
file size (if visible)

Example structure:

filename: invoice.pdf
size: 120kb

---

# Attachment Download Prevention

The extension must NOT automatically download attachments.

Only collect metadata unless user explicitly requests upload.

Allowed file types for upload:

pdf
docx
txt
png
jpg

Other types must be processed as metadata + SHA256 hash.

---

# URL Deduplication

When extracting URLs:

Remove duplicates.

Normalize URLs by:

removing trailing slash
lowercasing domain

Example:

https://example.com
https://example.com/

Should be treated as one.

---

# Email Content Normalization

Before sending to backend:

Trim whitespace.

Limit body text to:

50,000 characters.

Prevent extremely large payloads.

---

# Dynamic Gmail Loading

Gmail loads content dynamically.

The extension must observe DOM changes.

Use:

MutationObserver

Observe:

div[role="main"]

When DOM changes:

Re-run email detection.

---

# Gmail Conversation Handling

Emails may appear in threads.

Extract only the **currently expanded message**.

Avoid extracting collapsed thread messages.

---

# Safe DOM Access

The extension must always check that elements exist before reading them.

Example logic:

if element exists
extract text
else
try fallback selector

Never assume elements exist.

---

# Extraction Order

The agent must extract data in this order:

1. Detect email view
2. Extract subject
3. Extract body text
4. Extract URLs
5. Detect attachments
6. Extract attachment metadata

---

# Error Handling

If extraction fails:

Return error message to sidebar UI:

"Unable to extract email content."

Do not crash the extension.

---

# Performance Constraints

Extraction must complete within:

100 milliseconds

Avoid expensive DOM queries.

Cache frequently used selectors.

---

# Testing Scenarios

The agent must test extraction against:

Short emails
Long emails
Emails with multiple links
Emails with attachments
Emails in conversation threads

---

# Security Rules

Never execute content extracted from emails.

Treat all extracted content as untrusted input.

All data must be sanitized before sending to backend.

---

# Completion Requirement

The selector implementation is complete when:

• Subject extraction works
• Email body extraction works
• URLs are detected
• Attachments are detected
• Manual input still functions
