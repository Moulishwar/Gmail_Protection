// background.js — Service Worker
// Handles extension lifecycle, side panel, and message relay.

'use strict';

// ── Lifecycle ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Gmail Protection] Extension installed.');
});

// ── Open side panel when the toolbar icon is clicked ──────────────────────
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    console.error('[Gmail Protection] Could not open side panel:', err);
  });
});

// ── Incoming messages ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Content script pushes email detection status → store it by tab
  if (msg.type === 'EMAIL_STATUS' && sender.tab) {
    const key = `emailStatus_${sender.tab.id}`;
    chrome.storage.local.set({ [key]: msg.payload });
    return; // no async response needed
  }

  // Sidebar requests email data → relay to active tab's content script
  if (msg.type === 'REQUEST_EMAIL_DATA') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) {
        sendResponse({ emailFound: false, error: 'No active Gmail tab found.' });
        return;
      }

      const tabId = tabs[0].id;
      chrome.tabs.sendMessage(tabId, { type: 'GET_EMAIL_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            emailFound: false,
            error: 'Content script unreachable. Reload the Gmail tab.',
          });
        } else {
          sendResponse(response || { emailFound: false });
        }
      });
    });
    return true; // keep channel open for async response
  }

  // Sidebar pings to check if background is alive
  if (msg.type === 'PING_BACKGROUND') {
    sendResponse({ alive: true });
    return true;
  }
});

// ── Tab storage cleanup on close ──────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`emailStatus_${tabId}`);
});
