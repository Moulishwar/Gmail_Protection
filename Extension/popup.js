// popup.js
const elMainText = document.getElementById("mainText");
const elSubText = document.getElementById("subText");
const elSubject = document.getElementById("subject");
const elSender = document.getElementById("sender");
const elTimestamp = document.getElementById("timestamp");
const statusEl = document.getElementById("status");

function niceTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString();
}

function updateUI(statusObj) {
  if (!statusObj) {
    statusEl.className = "status notfound";
    elMainText.textContent = "No email found";
    elSubText.textContent = "Open a message in Gmail to detect it.";
    elSubject.textContent = "—";
    elSender.textContent = "—";
    elTimestamp.textContent = "";
    return;
  }

  if (statusObj.emailFound) {
    statusEl.className = "status safe";
    elMainText.textContent = "Email found";
    elSubText.textContent = statusObj.subject ? "Subject detected" : "An email is open";
    elSubject.textContent = statusObj.subject || "—";
    elSender.textContent = statusObj.sender || "—";
    elTimestamp.textContent = `Last seen: ${niceTime(statusObj.ts)}`;
  } else {
    statusEl.className = "status notfound";
    elMainText.textContent = "No email found";
    elSubText.textContent = "Open a message in Gmail to detect it.";
    elSubject.textContent = "—";
    elSender.textContent = "—";
    elTimestamp.textContent = `Last checked: ${niceTime(statusObj.ts)}`;
  }
}

// Load status for active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || !tabs.length) {
    updateUI(null);
    return;
  }
  const tabId = tabs[0].id;
  const tabKey = `phish_detector_status_${tabId}`;

  chrome.storage.local.get([tabKey], (res) => {
    updateUI(res[tabKey]);
  });
});
