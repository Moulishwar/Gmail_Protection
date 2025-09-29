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
  