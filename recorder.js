// Recorder logic
let mediaRecorder = null;
let recordedChunks = [];
let stream = null;
let startTime = null;
let timerInterval = null;
let recordedTabId = null;
let recordedTabIds = []; // Track multiple tabs for window/monitor mode
let cursorTrackingData = [];
let cursorViewportDimensions = { width: 0, height: 0 }; // Viewport dimensions from tracked tab
let currentTrackingMode = 'tab'; // Store tracking mode for reinjection after navigation

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const playBtn = document.getElementById('playBtn');
const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('statusText');
const recordingIndicator = document.getElementById('recordingIndicator');
const timerElement = document.getElementById('timer');
const infoElement = document.getElementById('info');

// Set canvas size
canvas.width = 1920;
canvas.height = 1080;

// Draw initial state - just black background
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, canvas.width, canvas.height);

startBtn.addEventListener('click', async () => {
  try {
    // Clear tracking state
    recordedTabId = null;
    recordedTabIds = [];
    cursorTrackingData = [];
    cursorViewportDimensions = { width: 0, height: 0 };

    // Clear old recording data including zoom segments and viewport dimensions
    chrome.storage.local.remove(
      [
        'recordedVideo',
        'timestamp',
        'recordingDuration',
        'recordingStartTime',
        'recordingEndTime',
        'cursorData',
        'zoomSegments',
        'cursorViewportWidth',
        'cursorViewportHeight',
      ],
      () => {
        console.log('Cleared old recording data');
      }
    );

    // Request screen capture
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        mediaSource: 'screen',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      },
    });

    // Draw stream to canvas
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    video.onloadedmetadata = () => {
      // Adjust canvas to match video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frames to canvas
      const drawFrame = () => {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(drawFrame);
      };
      drawFrame();
    };

    // Setup MediaRecorder
    const options = {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 2500000,
    };

    // Fallback to vp8 if vp9 is not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm;codecs=vp8';
    }

    mediaRecorder = new MediaRecorder(stream, options);
    recordedChunks = [];

    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const endTime = Date.now();

      // Save video immediately, get cursor data in background
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;

        // Save video data first
        const videoData = {
          recordedVideo: base64data,
          timestamp: endTime,
          recordingStartTime: startTime,
          recordingEndTime: endTime,
          recordingDuration: (endTime - startTime) / 1000, // Duration in seconds
          cursorData: [], // Will be updated if cursor tracking succeeds
        };

        chrome.storage.local.set(videoData, () => {
          console.log('Video saved to storage');
          downloadBtn.disabled = false;
          playBtn.disabled = false;
          infoElement.textContent =
            'Recording saved! You can download it or open it in the player.';
        });

        // Get cursor tracking data in background (non-blocking)
        if (recordedTabIds.length > 0 || recordedTabId) {
          (async () => {
            try {
              // Start with any data already accumulated during navigation
              let allCursorData = [...cursorTrackingData];
              console.log(
                `📊 Starting with ${allCursorData.length} cursor points from navigation events`
              );

              // If we tracked multiple tabs (window/monitor mode), collect from all
              if (recordedTabIds.length > 0) {
                console.log(
                  `📥 Collecting cursor data from ${recordedTabIds.length} tabs:`,
                  recordedTabIds
                );

                for (const tabId of recordedTabIds) {
                  try {
                    console.log(
                      `  📡 Sending stopCursorTracking to tab ${tabId}...`
                    );
                    const response = await chrome.tabs.sendMessage(tabId, {
                      action: 'stopCursorTracking',
                    });
                    console.log(`  📨 Response from tab ${tabId}:`, response);

                    if (response && response.cursorData) {
                      if (response.cursorData.length > 0) {
                        console.log(
                          `  ✅ Tab ${tabId}: ${response.cursorData.length} cursor points`
                        );
                        allCursorData = allCursorData.concat(
                          response.cursorData
                        );

                        // Store viewport dimensions from first tab with data
                        if (
                          response.viewportWidth &&
                          response.viewportHeight &&
                          cursorViewportDimensions.width === 0
                        ) {
                          cursorViewportDimensions = {
                            width: response.viewportWidth,
                            height: response.viewportHeight,
                          };
                          console.log(
                            `  📐 Viewport: ${response.viewportWidth}x${response.viewportHeight}`
                          );
                        }
                      } else {
                        console.log(
                          `  ⚠️ Tab ${tabId}: 0 cursor points (no mouse movement?)`
                        );
                      }
                    } else {
                      console.log(
                        `  ⚠️ Tab ${tabId}: No response or no cursorData`
                      );
                    }
                  } catch (error) {
                    console.warn(
                      `  ❌ Failed to get cursor data from tab ${tabId}:`,
                      error
                    );
                  }
                }

                // Sort by time to merge data from multiple tabs properly
                if (allCursorData.length > 0) {
                  allCursorData.sort((a, b) => a.time - b.time);
                }
              } else if (recordedTabId) {
                // Single tab mode (browser tab share)
                console.log(
                  `📥 Collecting cursor data from single tab ${recordedTabId}...`
                );
                const response = await chrome.tabs.sendMessage(recordedTabId, {
                  action: 'stopCursorTracking',
                });
                if (response && response.cursorData) {
                  allCursorData = response.cursorData;
                  console.log(
                    `✅ Collected ${allCursorData.length} cursor points`
                  );

                  // Store viewport dimensions
                  if (response.viewportWidth && response.viewportHeight) {
                    cursorViewportDimensions = {
                      width: response.viewportWidth,
                      height: response.viewportHeight,
                    };
                    console.log(
                      `📐 Viewport: ${response.viewportWidth}x${response.viewportHeight}`
                    );
                  }
                }
              }

              if (allCursorData.length > 0) {
                cursorTrackingData = allCursorData;
                console.log(
                  '📊 Total collected cursor data:',
                  cursorTrackingData.length,
                  'points'
                );
                if (cursorTrackingData.length > 0) {
                  console.log(
                    `⏱️ First cursor: ${cursorTrackingData[0].time.toFixed(3)}s, Last cursor: ${cursorTrackingData[cursorTrackingData.length - 1].time.toFixed(3)}s`
                  );
                }

                // Update storage with cursor data and viewport dimensions
                chrome.storage.local.set(
                  {
                    cursorData: cursorTrackingData,
                    cursorViewportWidth: cursorViewportDimensions.width,
                    cursorViewportHeight: cursorViewportDimensions.height,
                  },
                  () => {
                    console.log('💾 Cursor data saved to storage');
                    console.log(
                      `💾 Viewport dimensions: ${cursorViewportDimensions.width}x${cursorViewportDimensions.height}`
                    );
                    infoElement.textContent = `Recording saved with ${cursorTrackingData.length} cursor points! You can download it or open it in the player.`;
                  }
                );
              } else {
                console.warn('⚠️ No cursor data collected from any tab');
                console.log(
                  '💡 Make sure you moved your mouse on one of the tracked tabs during recording!'
                );
              }
            } catch (error) {
              console.error('❌ Error collecting cursor tracking data:', error);
            }
          })();
        } else {
          console.warn(
            '⚠️ No tabs were tracked (recordedTabIds and recordedTabId are both empty)'
          );
        }
      };
      reader.readAsDataURL(blob);

      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
      stream = null;

      // Clear canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Recording Stopped', canvas.width / 2, canvas.height / 2);
    };

    // Start recording
    mediaRecorder.start(100); // Collect data every 100ms
    startTime = Date.now();
    startTimer();

    // Update UI immediately
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = 'Recording';
    recordingIndicator.style.display = 'block';
    timerElement.style.display = 'block';
    infoElement.textContent = 'Recording in progress...';

    // Start cursor tracking in background (non-blocking)
    (async () => {
      try {
        // Try to detect which tab/window is being shared
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();

        console.log('Stream settings:', settings);

        // Determine tracking mode based on what's being shared
        const trackingMode =
          settings.displaySurface === 'browser' ? 'tab' : 'window';
        currentTrackingMode = trackingMode; // Store for later use
        console.log('Tracking mode:', trackingMode);

        // Try to find the tab that matches the shared content
        let targetTab = null;

        // If sharing a specific tab, Chrome might tell us
        if (settings.displaySurface === 'browser') {
          console.log('Sharing a browser tab');

          // For tab sharing, wait a bit then get the active tab
          // (give user time to switch back to the tab being recorded)
          await new Promise(resolve => setTimeout(resolve, 1000));

          const activeTabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (activeTabs.length > 0) {
            targetTab = activeTabs[0];
            console.log('Using active tab:', targetTab.title);
          }
        } else {
          console.log('Sharing window/monitor - will track ALL web tabs');

          // For window/monitor sharing, inject into all web tabs
          // This way cursor tracking works regardless of which tab user switches to
          const allTabs = await chrome.tabs.query({});
          const webTabs = allTabs.filter(
            tab =>
              tab.url &&
              (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
          );

          if (webTabs.length > 0) {
            console.log(
              `Found ${webTabs.length} web tabs, injecting tracking into all of them`
            );

            // Inject content script into all web tabs
            for (const tab of webTabs) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['content.js'],
                });
                console.log(`✅ Injected into: ${tab.title}`);
              } catch (e) {
                console.log(
                  `⚠️ Failed to inject into ${tab.title}:`,
                  e.message
                );
              }
            }

            // Wait for scripts to initialize
            await new Promise(resolve => setTimeout(resolve, 500));

            // Start tracking on all tabs
            for (const tab of webTabs) {
              try {
                await chrome.tabs.sendMessage(tab.id, {
                  action: 'startCursorTracking',
                  recordingStartTime: startTime,
                  trackingMode: trackingMode,
                });
                console.log(`✅ Started tracking in: ${tab.title}`);
              } catch (e) {
                console.log(
                  `⚠️ Failed to start tracking in ${tab.title}:`,
                  e.message
                );
              }
            }

            // Store all tracked tab IDs for later data collection
            recordedTabIds = webTabs.map(tab => tab.id);
            recordedTabId = webTabs[0].id; // Keep this for backwards compatibility

            infoElement.textContent = `Recording... (🔴 Tracking cursor in ${webTabs.length} tabs)`;

            // Exit early since we've already handled everything
            return;
          }
        }

        // If no target found, fall back to first web tab
        if (!targetTab) {
          const allTabs = await chrome.tabs.query({});
          const webTabs = allTabs.filter(
            tab =>
              tab.url &&
              (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
          );
          if (webTabs.length > 0) {
            targetTab = webTabs[0];
            console.log('Fallback to first web tab:', targetTab.title);
          }
        }

        if (targetTab) {
          recordedTabId = targetTab.id;

          try {
            // Try to inject/ensure content script is loaded
            console.log('Injecting content script into tab:', targetTab.id);
            try {
              await chrome.scripting.executeScript({
                target: { tabId: recordedTabId },
                files: ['content.js'],
              });
              console.log('Content script injected');
            } catch (injectError) {
              // Script might already be injected, that's ok
              console.log(
                'Content script already loaded or inject failed:',
                injectError.message
              );
            }

            // Wait for content script to fully initialize
            await new Promise(resolve => setTimeout(resolve, 500));

            // Retry ping a few times to make sure it's ready
            let retries = 5;
            let scriptReady = false;

            while (retries > 0 && !scriptReady) {
              try {
                const pingResponse = await chrome.tabs.sendMessage(
                  recordedTabId,
                  {
                    action: 'ping',
                  }
                );
                if (pingResponse && pingResponse.status === 'ready') {
                  scriptReady = true;
                  break;
                }
              } catch (e) {
                console.log('Ping failed, retrying...', retries);
              }
              retries--;
              await new Promise(resolve => setTimeout(resolve, 200));
            }

            if (scriptReady) {
              // Content script is ready, start tracking
              const trackingResponse = await chrome.tabs.sendMessage(
                recordedTabId,
                {
                  action: 'startCursorTracking',
                  recordingStartTime: startTime,
                  trackingMode: trackingMode,
                }
              );

              console.log(
                'Started cursor tracking in tab:',
                targetTab.title,
                trackingResponse
              );
              infoElement.textContent = `Recording... (🔴 Tracking cursor in: ${targetTab.title || 'Untitled'})`;
            } else {
              throw new Error('Content script not responding after retries');
            }
          } catch (tabError) {
            console.error('Failed to start tracking in tab:', tabError);
            infoElement.textContent = `Recording... (Cursor tracking unavailable - ${tabError.message})`;
          }
        } else {
          console.warn('No web tabs found to track cursor');
          infoElement.textContent =
            'Recording... (No cursor tracking - no web tabs open)';
        }
      } catch (error) {
        console.warn('Could not start cursor tracking:', error);
        infoElement.textContent = `Recording in progress...`;
      }
    })();

    // Handle stream ending (user clicks "Stop sharing" in browser)
    stream.getVideoTracks()[0].onended = () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
      }
    };

    // Listen for navigation BEFORE it happens to collect cursor data
    const navigationListener = details => {
      const tabId = details.tabId;
      const isTrackedTab =
        recordedTabIds.includes(tabId) || tabId === recordedTabId;

      // Only handle main frame navigations (not iframes)
      if (isTrackedTab && details.frameId === 0) {
        console.log(
          `🔄 Tab ${tabId} is about to navigate, collecting cursor data...`
        );

        (async () => {
          try {
            // Collect cursor data from the current page BEFORE navigation
            const response = await chrome.tabs.sendMessage(tabId, {
              action: 'stopCursorTracking',
            });
            if (
              response &&
              response.cursorData &&
              response.cursorData.length > 0
            ) {
              console.log(
                `  ✅ Collected ${response.cursorData.length} cursor points before navigation`
              );
              // Merge with existing data
              cursorTrackingData = cursorTrackingData.concat(
                response.cursorData
              );
              // Sort by time
              cursorTrackingData.sort((a, b) => a.time - b.time);
              console.log(
                `  📊 Total accumulated: ${cursorTrackingData.length} cursor points`
              );
            }
          } catch (error) {
            console.log(`  ℹ️ Could not collect cursor data:`, error.message);
          }
        })();
      }
    };

    // Listen for page load complete to reinject script
    const tabUpdateListener = (tabId, changeInfo, tab) => {
      const isTrackedTab =
        recordedTabIds.includes(tabId) || tabId === recordedTabId;

      if (isTrackedTab && changeInfo.status === 'complete') {
        console.log(
          `🔄 Tab ${tabId} navigation complete, reinjecting tracking script...`
        );

        (async () => {
          try {
            // Reinject content script
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js'],
            });

            // Wait a bit for initialization
            await new Promise(resolve => setTimeout(resolve, 300));

            // Restart tracking with the same tracking mode
            await chrome.tabs.sendMessage(tabId, {
              action: 'startCursorTracking',
              recordingStartTime: startTime,
              trackingMode: currentTrackingMode,
            });

            console.log(`✅ Reinjected and restarted tracking in tab ${tabId}`);
          } catch (error) {
            console.warn(
              `⚠️ Failed to reinject tracking in tab ${tabId}:`,
              error.message
            );
          }
        })();
      }
    };

    // Add both listeners
    chrome.webNavigation.onBeforeNavigate.addListener(navigationListener);
    chrome.tabs.onUpdated.addListener(tabUpdateListener);

    // Store the listener references so we can remove them later
    window.navigationListener = navigationListener;
    window.tabUpdateListener = tabUpdateListener;
  } catch (error) {
    console.error('Error starting recording:', error);
    statusText.textContent = 'Error: ' + error.message;
    infoElement.textContent =
      'Failed to start recording. Please make sure you grant permission.';
  }
});

stopBtn.addEventListener('click', () => {
  stopRecording();
});

downloadBtn.addEventListener('click', () => {
  chrome.storage.local.get(['recordedVideo'], result => {
    if (result.recordedVideo) {
      const a = document.createElement('a');
      a.href = result.recordedVideo;
      a.download = `screen-recording-${Date.now()}.webm`;
      a.click();
    }
  });
});

playBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openPlayer' });
});

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    stopTimer();

    // Remove navigation listener
    if (window.navigationListener) {
      chrome.webNavigation.onBeforeNavigate.removeListener(
        window.navigationListener
      );
      window.navigationListener = null;
      console.log('🔴 Removed navigation listener');
    }

    // Remove tab update listener
    if (window.tabUpdateListener) {
      chrome.tabs.onUpdated.removeListener(window.tabUpdateListener);
      window.tabUpdateListener = null;
      console.log('🔴 Removed tab update listener');
    }

    // Update UI
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = 'Stopped';
    recordingIndicator.style.display = 'none';
  }
}

function startTimer() {
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  stopTimer();
});
