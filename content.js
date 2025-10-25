// Content script for handling messages and cursor tracking

console.log('🎯 [Content Script] Loaded on:', window.location.href);

let isTrackingCursor = false;
let cursorData = [];
let recordingStartTime = null;
let lastCursorPosition = { x: 0, y: 0 };
let viewportWidth = 0;
let viewportHeight = 0;
let trackingMode = 'tab'; // 'tab' or 'window' - determines coordinate system

// Visual indicator
let trackingIndicator = null;

// Show visual indicator
function showTrackingIndicator() {
  if (trackingIndicator) return;

  trackingIndicator = document.createElement('div');
  trackingIndicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    font-weight: 600;
    z-index: 999999;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  trackingIndicator.textContent = '🔴 Cursor Tracking Active';
  document.body.appendChild(trackingIndicator);
  console.log('🎯 [Content Script] Indicator shown');
}

function hideTrackingIndicator() {
  if (trackingIndicator) {
    trackingIndicator.remove();
    trackingIndicator = null;
    console.log('🎯 [Content Script] Indicator hidden');
  }
}

// Track cursor movement
function handleMouseMove(e) {
  if (!isTrackingCursor) return;

  const currentTime = Date.now();
  const relativeTime = (currentTime - recordingStartTime) / 1000; // Convert to seconds

  // For window/fullscreen mode, use screen coordinates relative to window
  // For tab mode, use viewport coordinates
  let cursorX, cursorY;
  if (trackingMode === 'window') {
    // Use pageX/pageY which includes scroll offset, then add window position
    // Note: We can't get actual window screen position from content script
    // So we use screenX/Y which is relative to the screen
    cursorX = e.screenX;
    cursorY = e.screenY;
  } else {
    // Tab mode: use viewport coordinates
    cursorX = e.clientX;
    cursorY = e.clientY;
  }

  lastCursorPosition = {
    x: cursorX,
    y: cursorY,
    time: relativeTime,
  };

  // Sample cursor position every 100ms to avoid too much data
  if (
    cursorData.length === 0 ||
    relativeTime - cursorData[cursorData.length - 1].time >= 0.1
  ) {
    cursorData.push({
      x: cursorX,
      y: cursorY,
      time: relativeTime,
    });

    // Log every 50 points
    if (cursorData.length % 50 === 0) {
      console.log(
        `🎯 [Content Script] Collected ${cursorData.length} cursor points`
      );
    }
  }
}

// Track clicks
function handleClick(e) {
  if (!isTrackingCursor) return;

  const currentTime = Date.now();
  const relativeTime = (currentTime - recordingStartTime) / 1000;

  let cursorX, cursorY;
  if (trackingMode === 'window') {
    cursorX = e.screenX;
    cursorY = e.screenY;
  } else {
    cursorX = e.clientX;
    cursorY = e.clientY;
  }

  cursorData.push({
    x: cursorX,
    y: cursorY,
    time: relativeTime,
    type: 'click',
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('🎯 [Content Script] Received message:', message.action);

  if (message.action === 'ping') {
    console.log('🎯 [Content Script] Responding to ping');
    sendResponse({ status: 'ready' });
  } else if (message.action === 'startCursorTracking') {
    console.log('🎯 [Content Script] Starting cursor tracking...');
    isTrackingCursor = true;
    cursorData = [];
    // Use the recording start time passed from recorder, or current time as fallback
    recordingStartTime = message.recordingStartTime || Date.now();
    console.log(
      '🎯 [Content Script] Recording start time:',
      recordingStartTime
    );

    // Set tracking mode (tab vs window/fullscreen)
    trackingMode = message.trackingMode || 'tab';
    console.log('🎯 [Content Script] Tracking mode:', trackingMode);

    // Capture viewport/screen dimensions at start of recording
    if (trackingMode === 'window') {
      viewportWidth = window.screen.width;
      viewportHeight = window.screen.height;
      console.log(
        `🎯 [Content Script] Screen: ${viewportWidth}x${viewportHeight}`
      );
    } else {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      console.log(
        `🎯 [Content Script] Viewport: ${viewportWidth}x${viewportHeight}`
      );
    }

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);

    showTrackingIndicator();

    console.log('🎯 [Content Script] ✅ Cursor tracking STARTED');
    console.log(
      '🎯 [Content Script] Move your mouse on THIS page to collect data'
    );
    sendResponse({ status: 'started' });
  } else if (message.action === 'stopCursorTracking') {
    console.log('🎯 [Content Script] Stopping cursor tracking...');
    isTrackingCursor = false;

    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);

    hideTrackingIndicator();

    console.log(
      `🎯 [Content Script] ✅ Cursor tracking STOPPED. Collected ${cursorData.length} points`
    );
    console.log(
      `🎯 [Content Script] Viewport was: ${viewportWidth}x${viewportHeight}`
    );
    if (cursorData.length > 0) {
      console.log('🎯 [Content Script] First point:', cursorData[0]);
      console.log(
        '🎯 [Content Script] Last point:',
        cursorData[cursorData.length - 1]
      );
    } else {
      console.warn(
        '🎯 [Content Script] ⚠️ NO CURSOR DATA COLLECTED! Did you move the mouse on this page?'
      );
    }
    sendResponse({
      status: 'stopped',
      cursorData: cursorData,
      viewportWidth: viewportWidth,
      viewportHeight: viewportHeight,
    });
  } else if (message.action === 'getCursorData') {
    console.log(
      '🎯 [Content Script] Sending cursor data:',
      cursorData.length,
      'points'
    );
    sendResponse({ cursorData: cursorData });
  }

  return true;
});
