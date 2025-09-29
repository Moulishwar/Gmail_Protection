// contentScript.js
(function () {
  if (window.__phish_detector_installed) {
    return;
  }
  window.__phish_detector_installed = true;

  // ---------- Detection logic ----------
  const CHECK_SELECTORS = [
    'h2.hP',
    'h2[data-legacy-subject]',
    '[aria-label="Message Body"]',
    'div[role="main"] div[role="article"]',
    'div[role="main"] .ii',
    'div[role="main"] [data-message-id]',
    'div[role="main"] table[role="presentation"]'
  ];

  function urlLooksLikeMessage() {
    const hash = location.hash || "";
    const token = hash.split("/").pop();
    return token && token.length >= 10;
  }

  function extractSubject() {
    const subjSelectors = ['h2.hP', 'h2[data-legacy-subject]'];
    for (const sel of subjSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length) {
        return el.textContent.trim();
      }
    }
    const title = document.title || "";
    const parts = title.split(" - ");
    if (parts.length >= 1) return parts[0].trim();
    return "";
  }

  function extractSender() {
    const selectors = ['span.gD', 'span.gK', 'span[email]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.getAttribute) {
        const email = el.getAttribute('email') || el.textContent;
        if (email && email.trim().length) return email.trim();
      }
    }
    return "";
  }

  function detectEmailOpen() {
    const main = document.querySelector('div[role="main"]');
    if (main) {
      for (const sel of CHECK_SELECTORS) {
        try {
          if (main.querySelector(sel)) return true;
        } catch (e) {}
      }
    }
    for (const sel of CHECK_SELECTORS) {
      try {
        if (document.querySelector(sel)) return true;
      } catch (e) {}
    }
    if (urlLooksLikeMessage()) return true;
    return false;
  }

  // Publish result → background
  function publishStatus() {
    const open = detectEmailOpen();
    const subject = open ? extractSubject() : "";
    const sender = open ? extractSender() : "";
    const statusObj = {
      emailFound: !!open,
      subject: subject || "",
      sender: sender || "",
      ts: Date.now()
    };

    try {
      chrome.runtime.sendMessage({ type: "phish_detector_status", payload: statusObj });
    } catch (err) {
      // Ignore if extension context is invalidated (dev reloads)
    }
  }

  // Initial & observers
  setTimeout(publishStatus, 500);

  let updateTimer = null;
  const observer = new MutationObserver(() => {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(publishStatus, 250);
  });

  observer.observe(document.documentElement || document.body, {
    subtree: true,
    childList: true,
  });

  window.addEventListener("hashchange", publishStatus);
  setInterval(publishStatus, 3000);

  console.log("Phish Detector: content script active (tab-scoped).");
})();
