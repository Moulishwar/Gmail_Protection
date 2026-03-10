// content.js — Gmail Protection content script
// Runs on https://mail.google.com/* (read-only DOM scraping)

(function () {
  'use strict';

  // Guard against multiple injections across navigations
  if (window.__gmailProtection_installed) return;
  window.__gmailProtection_installed = true;

  const MAX_BODY_CHARS = 50000; // per gmail_dom_selectors.md

  // ── Selectors (from gmail_dom_selectors.md, priority order) ───────────────
  const SEL = {
    bodyPrimary:  'div.a3s.aiL',
    bodyFallback: ['div[role="main"] .a3s', 'div.a3s', 'div.gs', 'div.ii.gt'],
    subject:      ['h2.hP', 'div[role="heading"]', 'span.hP'],
    anchorLinks:  'div.a3s a',
    attachContainer: ['div.aQH', 'div.aZo', 'div.aQy'],
    attachItem:      ['div.aQy span.aV3', 'span.aV3'],
    main:         'div[role="main"]',
  };

  // ── Email detection ────────────────────────────────────────────────────────
  function isEmailOpen() {
    const mainEl = document.querySelector(SEL.main);
    if (!mainEl) return false;
    if (mainEl.querySelector('.a3s')) return true;
    for (const sel of SEL.bodyFallback.slice(1)) {
      try { if (document.querySelector(sel)) return true; } catch (_) {}
    }
    return false;
  }

  // ── Subject extraction ─────────────────────────────────────────────────────
  function extractSubject() {
    for (const sel of SEL.subject) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim()) {
        return el.innerText.trim().replace(/\s+/g, ' ');
      }
    }
    return '';
  }

  // ── Body extraction (innerText only, never innerHTML) ─────────────────────
  function extractBody() {
    let bodyEl = document.querySelector(SEL.bodyPrimary);

    if (!bodyEl) {
      for (const sel of SEL.bodyFallback) {
        bodyEl = document.querySelector(sel);
        if (bodyEl) break;
      }
    }

    if (!bodyEl) return '';

    const text = bodyEl.innerText || '';
    return text.trim().substring(0, MAX_BODY_CHARS);
  }

  // ── URL normalization ──────────────────────────────────────────────────────
  function normalizeURL(raw) {
    try {
      const u = new URL(raw);
      u.hostname = u.hostname.toLowerCase();
      let result = u.toString();
      // Remove trailing slash only when path is exactly "/"
      if (result.endsWith('/') && u.pathname === '/') {
        result = result.slice(0, -1);
      }
      return result;
    } catch (_) {
      return raw;
    }
  }

  // ── URL extraction (anchor tags + plain-text regex) ───────────────────────
  function extractURLs() {
    const seen = new Set();
    const urls = [];

    // From anchor tags
    document.querySelectorAll(SEL.anchorLinks).forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (
        href &&
        /^https?:\/\//i.test(href) &&
        !href.startsWith('mailto:') &&
        !href.startsWith('javascript:')
      ) {
        const normalized = normalizeURL(href);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          urls.push(normalized);
        }
      }
    });

    // From plain body text via regex
    const bodyText = extractBody();
    const urlRegex = /https?:\/\/[^\s<>"')]+/gi;
    const matches = bodyText.match(urlRegex) || [];
    matches.forEach((u) => {
      const normalized = normalizeURL(u);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    });

    return urls;
  }

  // ── Attachment detection (metadata only, no download) ─────────────────────
  function detectAttachments() {
    const attachments = [];

    let container = null;
    for (const sel of SEL.attachContainer) {
      container = document.querySelector(sel);
      if (container) break;
    }

    if (!container) return attachments;

    for (const sel of SEL.attachItem) {
      const items = container.querySelectorAll(sel);
      items.forEach((item) => {
        const filename = item.innerText ? item.innerText.trim() : '';
        if (!filename) return;

        // Try to read the sibling/nearby size element
        const parent = item.closest('[data-tooltip]') || item.parentElement;
        const sizeEl = parent
          ? parent.querySelector('span.SaH2Ve, span.aat, span[data-tooltip]')
          : null;
        const size = sizeEl ? sizeEl.innerText.trim() : 'unknown';

        const ext = filename.includes('.')
          ? filename.split('.').pop().toLowerCase()
          : '';

        attachments.push({ filename, extension: ext, size });
      });

      if (attachments.length > 0) break; // stop at first matching selector
    }

    return attachments;
  }

  // ── Full email data payload ────────────────────────────────────────────────
  function getEmailData() {
    if (!isEmailOpen()) {
      return { emailFound: false };
    }

    try {
      const subject     = extractSubject();
      const body        = extractBody();
      const urls        = extractURLs();
      const attachments = detectAttachments();

      return { emailFound: true, subject, body, urls, attachments };
    } catch (err) {
      console.error('[Gmail Protection] Extraction failed:', err);
      return {
        emailFound: true,
        error: 'Unable to extract email content.',
        subject: '',
        body: '',
        urls: [],
        attachments: [],
      };
    }
  }

  // ── Status push to background ──────────────────────────────────────────────
  let _lastEmailFound = null;

  function publishStatus() {
    const emailFound = isEmailOpen();
    const subject    = emailFound ? extractSubject() : '';

    if (_lastEmailFound !== emailFound) {
      _lastEmailFound = emailFound;
      chrome.runtime
        .sendMessage({ type: 'EMAIL_STATUS', payload: { emailFound, subject, ts: Date.now() } })
        .catch(() => {}); // no listener yet on first run
    }
  }

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_EMAIL_DATA') {
      sendResponse(getEmailData());
      return true; // keep channel open
    }
    if (msg.type === 'PING') {
      sendResponse({ pong: true });
      return true;
    }
  });

  // ── MutationObserver on div[role="main"] ───────────────────────────────────
  let _mutationTimer = null;
  const targetNode = document.querySelector(SEL.main) || document.body;

  const observer = new MutationObserver(() => {
    clearTimeout(_mutationTimer);
    _mutationTimer = setTimeout(publishStatus, 500);
  });

  observer.observe(targetNode, { subtree: true, childList: true });

  // Re-check on Gmail SPA navigation
  window.addEventListener('hashchange', () => setTimeout(publishStatus, 300));

  // Initial detection
  setTimeout(publishStatus, 800);

  console.log('[Gmail Protection] Content script active.');
})();
