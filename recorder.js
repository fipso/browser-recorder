// Recorder logic
let mediaRecorder = null;
let recordedChunks = [];
let stream = null;
let startTime = null;
let timerInterval = null;
let recordedTabId = null;
let cursorTrackingData = [];

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
    // Clear old recording data including zoom segments
    chrome.storage.local.remove(
      [
        'recordedVideo',
        'timestamp',
        'recordingDuration',
        'recordingStartTime',
        'recordingEndTime',
        'cursorData',
        'zoomSegments',
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
          infoElement.style.display = 'block';
          infoElement.textContent =
            'Recording saved! You can download it or open it in the player.';
        });

        // Get cursor tracking data in background (non-blocking)
        if (recordedTabId) {
          (async () => {
            try {
              const response = await chrome.tabs.sendMessage(recordedTabId, {
                action: 'stopCursorTracking',
              });
              if (response && response.cursorData) {
                cursorTrackingData = response.cursorData;
                console.log(
                  'Collected cursor data:',
                  cursorTrackingData.length,
                  'points'
                );

                // Update storage with cursor data
                chrome.storage.local.set(
                  { cursorData: cursorTrackingData },
                  () => {
                    console.log('Cursor data saved to storage');
                    infoElement.textContent = `Recording saved with ${cursorTrackingData.length} cursor points! You can download it or open it in the player.`;
                  }
                );
              }
            } catch (error) {
              console.warn('Could not get cursor tracking data:', error);
            }
          })();
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
    infoElement.style.display = 'none';

    // Start cursor tracking in background (non-blocking)
    (async () => {
      try {
        // Try to detect which tab/window is being shared
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();

        console.log('Stream settings:', settings);

        // Try to find the tab that matches the shared content
        let targetTab = null;

        // If sharing a specific tab, Chrome might tell us
        if (settings.displaySurface === 'browser') {
          console.log('Sharing a browser tab');

          // Get the active tab as best guess
          const activeTabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (activeTabs.length > 0) {
            targetTab = activeTabs[0];
            console.log('Using active tab:', targetTab.title);
          }
        } else {
          console.log(
            'Sharing window/monitor - will use active tab as fallback'
          );
          // For window/monitor sharing, we can't detect automatically
          // Use the currently active tab as best guess
          const activeTabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (activeTabs.length > 0) {
            targetTab = activeTabs[0];
            console.log('Using active tab as fallback:', targetTab.title);
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

    // Update UI
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = 'Stopped';
    recordingIndicator.style.display = 'none';
    infoElement.style.display = 'block';
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
