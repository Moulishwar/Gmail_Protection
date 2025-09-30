// background.js (service worker)

// Log install
chrome.runtime.onInstalled.addListener(() => {
    console.log("Phish Detector installed.");
  });
  
  // Handle status messages from content scripts
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === "phish_detector_status" && sender.tab && sender.tab.id >= 0) {
      const tabKey = `phish_detector_status_${sender.tab.id}`;
      chrome.storage.local.set({ [tabKey]: msg.payload });
      // Update badge based on status
      updateBadge(msg.payload, sender.tab.id);
    }
  });
  
  // Clean up when a tab is closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    const tabKey = `phish_detector_status_${tabId}`;
    chrome.storage.local.remove(tabKey, () => {
      if (chrome.runtime.lastError) {
        // harmless if key doesn't exist
        return;
      }
      console.log(`Phish Detector: cleaned up status for closed tab ${tabId}`);
    });
  });

<<<<<<< HEAD
  // Badge update function
  function updateBadge(statusObj, tabId) {
    try {
      if (!statusObj) {
        // Grey dot - no data
        chrome.action.setBadgeText({ text: "•", tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#666666", tabId });
      } else if (statusObj.emailFound) {
        // Green dot - email found (safe)
        chrome.action.setBadgeText({ text: "•", tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId });
      } else {
        // Grey dot - no email found
        chrome.action.setBadgeText({ text: "•", tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#666666", tabId });
      }
    } catch (e) {
      // Ignore badge errors (e.g., during extension reload)
    }
  }
  
=======
  function getAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError || new Error("No token"));
          return;
        }
        resolve(token);
      });
    });
  }

  
async function gmailGet(token, path) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`);
  return res.json();
}

function decodeB64Url(str) {
  // Gmail returns base64url; convert to base64
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

function flattenParts(parts, out = []) {
  if (!parts) return out;
  for (const p of parts) {
    out.push(p);
    if (p.parts) flattenParts(p.parts, out);
  }
  return out;
}

function extractBodyText(message) {
  if (!message || !message.payload) return "";

  // handle simple case: body in root payload
  if (message.payload.body && message.payload.body.data) {
    return new TextDecoder().decode(decodeB64Url(message.payload.body.data));
  }

  // multipart case
  const all = flattenParts(message.payload.parts ? message.payload.parts : [message.payload]);
  let text = "", html = "";
  for (const p of all) {
    if (p.body && p.body.data) {
      const decoded = new TextDecoder().decode(decodeB64Url(p.body.data));
      if (p.mimeType.startsWith("text/plain")) text += decoded + "\n";
      if (p.mimeType.startsWith("text/html")) html += decoded + "\n";
    }
  }
  return text.trim() || html.trim() || message.snippet || "";
}

function extractUrlsFromText(text) {
  const urlRe = /\bhttps?:\/\/[^\s<>"')]+/gi;
  return Array.from(new Set((text.match(urlRe) || [])));
}

async function fetchAttachments(token, message) {
  const attachments = [];
  if (!message || !message.payload) return attachments;

  const parts = message.payload.parts ? flattenParts(message.payload.parts) : [message.payload];

  for (const p of parts) {
    if (p.filename && p.body && p.body.attachmentId) {
      try {
        const att = await gmailGet(
          token,
          `users/me/messages/${message.id}/attachments/${p.body.attachmentId}`
        );
        attachments.push({
          filename: p.filename || "attachment",
          mimeType: p.mimeType || "application/octet-stream",
          data: att.data || "" // base64url
        });
      } catch (err) {
        console.error("Failed to fetch attachment", p.filename, err);
      }
    }
  }
  return attachments;
}


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "fetch_gmail_data") {
    (async () => {
      try {
        const token = await getAuthToken();
        const message = await gmailGet(
          token,
          `users/me/messages/${msg.messageId}?format=full`
        );

        const headers = (message.payload && message.payload.headers) || [];
        const getHeader = (name) => {
            return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
        };
        const subject = getHeader("subject");
        const from = getHeader("from");

        const bodyText = extractBodyText(message);
        const urls = extractUrlsFromText(bodyText);
        const attachments = await fetchAttachments(token, message);

        // POST to Flask
        await fetch("http://127.0.0.1:5000/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            from,
            body: bodyText,
            urls,
            attachments,
            messageId: message.id
          })
        });

        sendResponse({ ok: true, subject, from, urlCount: urls.length, attCount: attachments.length });
      } catch (e) {
        console.error(e);
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // keep message channel open
  }
});
>>>>>>> to_backend
