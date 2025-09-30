// popup.js
const elMainText = document.getElementById("mainText");
const elSubText = document.getElementById("subText");
const elSubject = document.getElementById("subject");
const elSender = document.getElementById("sender");
const elTimestamp = document.getElementById("timestamp");
const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("sendBtn");


function niceTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString();
}

function updateUI(statusObj) {
  if (statusObj && statusObj.emailFound) {
    sendBtn.style.display = "block";
  } else {
    sendBtn.style.display = "none";
  }
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
  sendBtn.style.display = statusObj && statusObj.emailFound ? "block" : "none";
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

// popup.js (add below your initial chrome.tabs.query block)
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

  //  Live updates when the content script publishes new status
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[tabKey]) {
      updateUI(changes[tabKey].newValue);
    }
  });
});


sendBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "collect_email_data" });
  });
});