// Background service worker for managing tabs and communication

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openRecorder') {
    // Open a new tab with the recorder interface
    chrome.tabs.create(
      {
        url: chrome.runtime.getURL('recorder.html'),
        active: true,
      },
      tab => {
        sendResponse({ tabId: tab.id });
      }
    );
    return true; // Required for async sendResponse
  }

  if (message.action === 'openPlayer') {
    // Open a new tab with the player interface
    chrome.tabs.create(
      {
        url: chrome.runtime.getURL('player.html'),
        active: true,
      },
      tab => {
        sendResponse({ tabId: tab.id });
      }
    );
    return true;
  }

  if (message.action === 'getStreamId') {
    // This will be used to get the stream ID for recording
    sendResponse({ streamId: 'screen-recording' });
    return true;
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Browser Recorder extension installed');
});
