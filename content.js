// Content script for handling messages
// This is mainly used for communication between popup and page

console.log('Screen Recorder content script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ status: 'ready' });
  }
  return true;
});
