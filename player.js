// Player logic with canvas rendering
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
const hiddenVideo = document.getElementById('hiddenVideo');
const noVideo = document.getElementById('noVideo');
const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseIcon = document.getElementById('playPauseIcon');
const playPauseText = document.getElementById('playPauseText');
const downloadBtn = document.getElementById('downloadBtn');
const deleteBtn = document.getElementById('deleteBtn');
const volumeSlider = document.getElementById('volumeSlider');
const speedSelect = document.getElementById('speedSelect');
const currentTimeDisplay = document.getElementById('currentTime');
const durationDisplay = document.getElementById('duration');
const infoText = document.getElementById('infoText');
const timelineTrack = document.getElementById('timelineTrack');
const playhead = document.getElementById('playhead');
const playheadHandle = document.getElementById('playheadHandle');
const playheadTime = document.getElementById('playheadTime');
const addZoomBtn = document.getElementById('addZoomBtn');
const debugInfo = document.getElementById('debugInfo');
const debugPanel = document.getElementById('debugPanel');
const debugModeToggle = document.getElementById('debugModeToggle');
const cursorOffsetPanel = document.getElementById('cursorOffsetPanel');
const cursorOffsetSlider = document.getElementById('cursorOffset');
const cursorOffsetValue = document.getElementById('cursorOffsetValue');

let videoDataUrl = null;
let isPlaying = false;
let animationFrameId = null;
let actualDuration = null; // Duration from recording timestamps
let cursorData = []; // Cursor position data from recording
let zoomSegments = []; // Array of zoom effects: {start, end, zoomLevel}
let currentZoom = { scale: 1, x: 0, y: 0, targetX: 0, targetY: 0 }; // Current zoom state with smoothing
let debugMode = false; // Debug mode state
let cursorViewportWidth = 0; // Original viewport width where cursor was tracked
let cursorViewportHeight = 0; // Original viewport height where cursor was tracked
let cursorTimeOffset = 0; // Time offset in seconds to sync cursor with video

// Format time helper
function formatTime(seconds) {
  if (!isFinite(seconds) || isNaN(seconds)) {
    return '00:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Get cursor position at a specific time with interpolation
// Returns cursor position in VIDEO coordinates
function getCursorAtTime(time) {
  if (cursorData.length === 0 || !cursorViewportWidth || !cursorViewportHeight)
    return null;

  // Find surrounding cursor data points
  let before = null;
  let after = null;

  for (let i = 0; i < cursorData.length; i++) {
    if (cursorData[i].time <= time) {
      before = cursorData[i];
    }
    if (cursorData[i].time >= time && !after) {
      after = cursorData[i];
      break;
    }
  }

  if (!before && cursorData[0]) before = cursorData[0];
  if (!after && cursorData.length > 0)
    after = cursorData[cursorData.length - 1];
  if (!before || !after) return null;

  // Get cursor position (interpolated if between two points)
  let cursorX, cursorY;
  if (before === after) {
    cursorX = before.x;
    cursorY = before.y;
  } else {
    // Interpolate between points
    const ratio = (time - before.time) / (after.time - before.time);
    cursorX = before.x + (after.x - before.x) * ratio;
    cursorY = before.y + (after.y - before.y) * ratio;
  }

  // Convert from viewport coordinates to video coordinates
  const viewportToVideoScaleX = hiddenVideo.videoWidth / cursorViewportWidth;
  const viewportToVideoScaleY = hiddenVideo.videoHeight / cursorViewportHeight;

  return {
    x: cursorX * viewportToVideoScaleX,
    y: cursorY * viewportToVideoScaleY,
  };
}

// Check if current time is in a zoom segment
function getActiveZoomSegment(time) {
  return zoomSegments.find(seg => time >= seg.start && time <= seg.end);
}

// Render video frame to canvas
function renderFrame() {
  if (!isPlaying || hiddenVideo.paused || hiddenVideo.ended) {
    return;
  }

  const currentTime = hiddenVideo.currentTime;

  // Check if we should apply zoom
  const activeZoom = getActiveZoomSegment(currentTime);

  if (activeZoom) {
    // Apply zoom with cursor following
    const cursor = getCursorAtTime(currentTime);

    if (!cursor) {
      console.warn('Active zoom but no cursor data at', currentTime);
    }

    if (cursor) {
      // Update target position based on cursor
      currentZoom.targetX = cursor.x;
      currentZoom.targetY = cursor.y;
      currentZoom.scale = activeZoom.zoomLevel || 2;

      // Smooth camera movement - only move if cursor moved significantly
      const distanceX = Math.abs(currentZoom.targetX - currentZoom.x);
      const distanceY = Math.abs(currentZoom.targetY - currentZoom.y);
      const threshold = 50; // Minimum movement before camera follows

      if (distanceX > threshold || distanceY > threshold) {
        // Lerp towards target with smoothing factor
        const smoothFactor = 0.1;
        currentZoom.x += (currentZoom.targetX - currentZoom.x) * smoothFactor;
        currentZoom.y += (currentZoom.targetY - currentZoom.y) * smoothFactor;
      }
    }

    // Draw zoomed frame
    ctx.save();

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate zoom viewport
    const zoomedWidth = canvas.width / currentZoom.scale;
    const zoomedHeight = canvas.height / currentZoom.scale;

    // Center on cursor position, but clamp to video bounds
    let sourceX = currentZoom.x - zoomedWidth / 2;
    let sourceY = currentZoom.y - zoomedHeight / 2;

    sourceX = Math.max(
      0,
      Math.min(hiddenVideo.videoWidth - zoomedWidth, sourceX)
    );
    sourceY = Math.max(
      0,
      Math.min(hiddenVideo.videoHeight - zoomedHeight, sourceY)
    );

    // Draw the zoomed portion
    ctx.drawImage(
      hiddenVideo,
      sourceX,
      sourceY,
      zoomedWidth,
      zoomedHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.restore();
  } else {
    // Reset zoom smoothly
    currentZoom.scale += (1 - currentZoom.scale) * 0.1;

    if (Math.abs(currentZoom.scale - 1) < 0.01) {
      currentZoom.scale = 1;
      // Draw normal frame
      ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
    } else {
      // Still transitioning out of zoom
      const zoomedWidth = canvas.width / currentZoom.scale;
      const zoomedHeight = canvas.height / currentZoom.scale;

      let sourceX = currentZoom.x - zoomedWidth / 2;
      let sourceY = currentZoom.y - zoomedHeight / 2;

      sourceX = Math.max(
        0,
        Math.min(hiddenVideo.videoWidth - zoomedWidth, sourceX)
      );
      sourceY = Math.max(
        0,
        Math.min(hiddenVideo.videoHeight - zoomedHeight, sourceY)
      );

      ctx.drawImage(
        hiddenVideo,
        sourceX,
        sourceY,
        zoomedWidth,
        zoomedHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
  }

  // Draw cursor positions in debug mode
  if (debugMode && cursorData.length > 0) {
    drawCursorDebugOverlay(currentTime);
  }

  // Update time display
  currentTimeDisplay.textContent = formatTime(currentTime);
  playheadTime.textContent = formatTime(currentTime);

  // Update playhead position
  const duration = actualDuration || hiddenVideo.duration;
  if (isFinite(duration) && duration > 0) {
    const progress = (currentTime / duration) * 100;
    playhead.style.left = `${progress}%`;
  }

  // Continue rendering
  animationFrameId = requestAnimationFrame(renderFrame);
}

// Draw cursor positions overlay for debug mode
function drawCursorDebugOverlay(currentTime) {
  // If we don't have viewport dimensions, we can't properly scale cursor positions
  if (!cursorViewportWidth || !cursorViewportHeight) {
    console.warn('Cannot draw cursor overlay: missing viewport dimensions');
    return;
  }

  // Calculate scale factors:
  // 1. Cursor is in viewport coordinates (e.g., 1920x1080 browser window)
  // 2. Video is in video resolution (e.g., 1920x1080 recorded stream)
  // 3. Canvas might be scaled (e.g., 800x450 display size)

  // Scale from cursor viewport coordinates to video coordinates
  const viewportToVideoScaleX = hiddenVideo.videoWidth / cursorViewportWidth;
  const viewportToVideoScaleY = hiddenVideo.videoHeight / cursorViewportHeight;

  // Scale from video coordinates to canvas coordinates
  const videoToCanvasScaleX = canvas.width / hiddenVideo.videoWidth;
  const videoToCanvasScaleY = canvas.height / hiddenVideo.videoHeight;

  // Get active zoom to adjust coordinates if zoomed
  const activeZoom = getActiveZoomSegment(currentTime);

  ctx.save();

  // Get cursor positions within a time window around current time
  // Apply time offset to sync cursor with video
  const adjustedTime = currentTime + cursorTimeOffset;
  const timeWindow = 0.5; // Show cursor positions within 0.5 seconds
  const relevantCursors = cursorData.filter(
    cursor => Math.abs(cursor.time - adjustedTime) <= timeWindow
  );

  // Draw all cursor positions within the time window
  relevantCursors.forEach((cursor, index) => {
    // Convert cursor viewport coordinates to video coordinates
    const videoX = cursor.x * viewportToVideoScaleX;
    const videoY = cursor.y * viewportToVideoScaleY;

    // Convert video coordinates to canvas coordinates
    let x = videoX * videoToCanvasScaleX;
    let y = videoY * videoToCanvasScaleY;

    // If zoomed, adjust coordinates to match the zoomed viewport
    if (activeZoom && currentZoom.scale > 1) {
      const zoomedWidth = canvas.width / currentZoom.scale;
      const zoomedHeight = canvas.height / currentZoom.scale;

      let sourceX = currentZoom.x - zoomedWidth / 2;
      let sourceY = currentZoom.y - zoomedHeight / 2;

      sourceX = Math.max(
        0,
        Math.min(hiddenVideo.videoWidth - zoomedWidth, sourceX)
      );
      sourceY = Math.max(
        0,
        Math.min(hiddenVideo.videoHeight - zoomedHeight, sourceY)
      );

      // Transform cursor coordinates to match zoomed viewport
      x = ((cursor.x - sourceX) / zoomedWidth) * canvas.width;
      y = ((cursor.y - sourceY) / zoomedHeight) * canvas.height;
    }

    // Only draw if cursor is within canvas bounds
    if (x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height) {
      // Calculate opacity based on time difference (fade older positions)
      const timeDiff = Math.abs(cursor.time - adjustedTime);
      const opacity = 1 - timeDiff / timeWindow;

      // Draw cursor point
      ctx.fillStyle = `rgba(255, 0, 0, ${opacity * 0.8})`;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw cursor trail line to next point
      if (index < relevantCursors.length - 1) {
        const nextCursor = relevantCursors[index + 1];

        // Convert next cursor viewport coordinates to video coordinates
        const nextVideoX = nextCursor.x * viewportToVideoScaleX;
        const nextVideoY = nextCursor.y * viewportToVideoScaleY;

        // Convert video coordinates to canvas coordinates
        let nextX = nextVideoX * videoToCanvasScaleX;
        let nextY = nextVideoY * videoToCanvasScaleY;

        if (activeZoom && currentZoom.scale > 1) {
          const zoomedWidth = canvas.width / currentZoom.scale;
          const zoomedHeight = canvas.height / currentZoom.scale;

          let sourceX = currentZoom.x - zoomedWidth / 2;
          let sourceY = currentZoom.y - zoomedHeight / 2;

          sourceX = Math.max(
            0,
            Math.min(hiddenVideo.videoWidth - zoomedWidth, sourceX)
          );
          sourceY = Math.max(
            0,
            Math.min(hiddenVideo.videoHeight - zoomedHeight, sourceY)
          );

          nextX = ((nextVideoX - sourceX) / zoomedWidth) * canvas.width;
          nextY = ((nextVideoY - sourceY) / zoomedHeight) * canvas.height;
        }

        ctx.strokeStyle = `rgba(255, 0, 0, ${opacity * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();
      }

      // Highlight current cursor position (closest to current time)
      if (
        index === 0 ||
        Math.abs(cursor.time - adjustedTime) <
          Math.abs(relevantCursors[0].time - adjustedTime)
      ) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Draw timestamp label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x + 10, y - 20, 60, 18);
        ctx.fillStyle = 'white';
        ctx.font = '11px monospace';
        ctx.fillText(`${cursor.time.toFixed(2)}s`, x + 12, y - 7);
      }

      // Mark click events with a special indicator
      if (cursor.type === 'click') {
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });

  ctx.restore();
}

// Update debug display
function updateDebugInfo() {
  debugInfo.textContent = `Cursor: ${cursorData.length} pts | Zooms: ${zoomSegments.length}`;

  let debugHTML = '<h4>Debug Info</h4>';
  debugHTML += `<div>Cursor data points: ${cursorData.length}</div>`;
  debugHTML += `<div>Zoom segments: ${zoomSegments.length}</div>`;

  if (cursorData.length > 0) {
    debugHTML += `<div>First cursor: t=${cursorData[0].time.toFixed(2)}s, x=${cursorData[0].x}, y=${cursorData[0].y}</div>`;
    debugHTML += `<div>Last cursor: t=${cursorData[cursorData.length - 1].time.toFixed(2)}s</div>`;
  }

  if (zoomSegments.length > 0) {
    debugHTML += '<div style="margin-top: 5px;">Zoom segments:</div>';
    zoomSegments.forEach((seg, idx) => {
      debugHTML += `<div>  ${idx + 1}. ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s (${seg.zoomLevel}x)</div>`;
    });
  }

  const activeZoom = getActiveZoomSegment(hiddenVideo.currentTime);
  if (activeZoom) {
    debugHTML += `<div style="margin-top: 5px; color: #10b981;">ACTIVE ZOOM: ${activeZoom.zoomLevel}x at ${hiddenVideo.currentTime.toFixed(2)}s</div>`;
    const cursor = getCursorAtTime(hiddenVideo.currentTime);
    if (cursor) {
      debugHTML += `<div style="color: #10b981;">Cursor pos: x=${Math.round(cursor.x)}, y=${Math.round(cursor.y)}</div>`;
    }
  }

  debugPanel.innerHTML = debugHTML;
}

// Load video from storage
function loadVideo() {
  chrome.storage.local.get(
    [
      'recordedVideo',
      'timestamp',
      'recordingDuration',
      'cursorData',
      'zoomSegments',
      'cursorViewportWidth',
      'cursorViewportHeight',
    ],
    result => {
      if (result.recordedVideo) {
        videoDataUrl = result.recordedVideo;
        hiddenVideo.src = videoDataUrl;

        // Get the actual duration from recording timestamps
        if (result.recordingDuration) {
          actualDuration = result.recordingDuration;
          durationDisplay.textContent = formatTime(actualDuration);
          console.log(
            'Loaded duration from recording:',
            actualDuration,
            'seconds'
          );
        }

        // Load cursor data and viewport dimensions
        if (result.cursorData && result.cursorData.length > 0) {
          cursorData = result.cursorData;
          console.log('Loaded cursor data:', cursorData.length, 'points');
        } else {
          cursorData = [];
          console.warn('No cursor data available');
        }

        if (result.cursorViewportWidth && result.cursorViewportHeight) {
          cursorViewportWidth = result.cursorViewportWidth;
          cursorViewportHeight = result.cursorViewportHeight;
          console.log(
            'Loaded cursor viewport:',
            cursorViewportWidth + 'x' + cursorViewportHeight
          );
        } else {
          // Fallback for old recordings: assume viewport = video resolution
          // This will work if the browser tab was the same size as the recording
          console.warn(
            'No cursor viewport dimensions available - using video resolution as fallback'
          );

          // Wait for video metadata to be loaded
          hiddenVideo.addEventListener('loadedmetadata', () => {
            cursorViewportWidth = hiddenVideo.videoWidth;
            cursorViewportHeight = hiddenVideo.videoHeight;
            console.log(
              'Using video dimensions as viewport:',
              cursorViewportWidth + 'x' + cursorViewportHeight
            );
          });
        }

        // Load zoom segments (only if video matches)
        if (result.zoomSegments && result.zoomSegments.length > 0) {
          zoomSegments = result.zoomSegments;
          renderZoomSegments();
          console.log('Loaded zoom segments:', zoomSegments.length);
        } else {
          zoomSegments = [];
        }

        // Update debug info
        updateDebugInfo();

        // Update debug info periodically during playback
        setInterval(updateDebugInfo, 500);

        // Enable controls
        playPauseBtn.disabled = false;
        downloadBtn.disabled = false;
        deleteBtn.disabled = false;
        addZoomBtn.disabled = false;

        const date = new Date(result.timestamp);
        infoText.textContent = `Recording from ${date.toLocaleString()}`;
      } else {
        infoText.textContent = 'No recording available. Record a video first.';
        cursorData = [];
        zoomSegments = [];
        updateDebugInfo();
      }
    }
  );
}

// Setup canvas when video metadata loads
hiddenVideo.addEventListener('loadedmetadata', () => {
  // Set canvas size to match video
  canvas.width = hiddenVideo.videoWidth;
  canvas.height = hiddenVideo.videoHeight;

  // Show canvas
  canvas.style.display = 'block';
  noVideo.style.display = 'none';

  // Draw first frame
  ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
});

// Play/Pause button
playPauseBtn.addEventListener('click', () => {
  if (isPlaying) {
    pauseVideo();
  } else {
    playVideo();
  }
});

function playVideo() {
  hiddenVideo.play();
  isPlaying = true;
  playPauseIcon.textContent = '⏸';
  playPauseText.textContent = 'Pause';
  renderFrame();
}

function pauseVideo() {
  hiddenVideo.pause();
  isPlaying = false;
  playPauseIcon.textContent = '▶';
  playPauseText.textContent = 'Play';
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// Video ended
hiddenVideo.addEventListener('ended', () => {
  isPlaying = false;
  playPauseIcon.textContent = '▶';
  playPauseText.textContent = 'Replay';
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  // Draw final frame
  ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
});

// Playhead dragging
let isDraggingPlayhead = false;

function updatePlayheadPosition(e) {
  const duration = actualDuration || hiddenVideo.duration;
  if (hiddenVideo.src && isFinite(duration) && duration > 0) {
    const rect = timelineTrack.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * duration;

    hiddenVideo.currentTime = newTime;

    // Update display immediately
    currentTimeDisplay.textContent = formatTime(newTime);
    playheadTime.textContent = formatTime(newTime);
    playhead.style.left = `${pos * 100}%`;

    // Draw frame at new position
    if (!isPlaying) {
      // Wait a bit for seek to complete
      setTimeout(() => {
        ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
      }, 50);
    }
  }
}

// Playhead handle drag
playheadHandle.addEventListener('mousedown', e => {
  e.stopPropagation();
  isDraggingPlayhead = true;
  updatePlayheadPosition(e);
});

// Timeline track click
timelineTrack.addEventListener('mousedown', e => {
  if (
    e.target === timelineTrack ||
    e.target.closest('.timeline-ruler, .timeline-placeholder')
  ) {
    isDraggingPlayhead = true;
    updatePlayheadPosition(e);
  }
});

document.addEventListener('mousemove', e => {
  if (isDraggingPlayhead) {
    updatePlayheadPosition(e);
  }
});

document.addEventListener('mouseup', () => {
  isDraggingPlayhead = false;
});

// Volume control
volumeSlider.addEventListener('input', e => {
  hiddenVideo.volume = e.target.value / 100;
});

// Speed control
speedSelect.addEventListener('change', e => {
  hiddenVideo.playbackRate = parseFloat(e.target.value);
});

// Download button
downloadBtn.addEventListener('click', () => {
  if (videoDataUrl) {
    const a = document.createElement('a');
    a.href = videoDataUrl;
    a.download = `screen-recording-${Date.now()}.webm`;
    a.click();
  }
});

// Delete button
deleteBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to delete this recording?')) {
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
        hiddenVideo.src = '';
        canvas.style.display = 'none';
        noVideo.style.display = 'block';
        playPauseBtn.disabled = true;
        downloadBtn.disabled = true;
        deleteBtn.disabled = true;
        addZoomBtn.disabled = true;
        infoText.textContent = 'Recording deleted.';
        videoDataUrl = null;
        isPlaying = false;
        cursorData = [];
        zoomSegments = [];
        cursorViewportWidth = 0;
        cursorViewportHeight = 0;
        renderZoomSegments(); // Clear visual segments
        updateDebugInfo();
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    );
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (hiddenVideo.src) {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        playPauseBtn.click();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        hiddenVideo.currentTime = Math.max(0, hiddenVideo.currentTime - 5);
        if (!isPlaying) {
          setTimeout(() => {
            ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
          }, 100);
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        const duration = actualDuration || hiddenVideo.duration;
        if (isFinite(duration)) {
          hiddenVideo.currentTime = Math.min(
            duration,
            hiddenVideo.currentTime + 5
          );
          if (!isPlaying) {
            setTimeout(() => {
              ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
            }, 100);
          }
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        hiddenVideo.volume = Math.min(1, hiddenVideo.volume + 0.1);
        volumeSlider.value = hiddenVideo.volume * 100;
        break;
      case 'ArrowDown':
        e.preventDefault();
        hiddenVideo.volume = Math.max(0, hiddenVideo.volume - 0.1);
        volumeSlider.value = hiddenVideo.volume * 100;
        break;
      case 'f':
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          canvas.requestFullscreen();
        }
        break;
    }
  }
});

// Add zoom segment
addZoomBtn.addEventListener('click', () => {
  const currentTime = hiddenVideo.currentTime;
  const duration = actualDuration || hiddenVideo.duration;

  if (!isFinite(duration)) {
    alert('Please load a video first');
    return;
  }

  // Create a 3-second zoom segment starting at current time
  const newSegment = {
    start: currentTime,
    end: Math.min(currentTime + 3, duration),
    zoomLevel: 2,
    id: Date.now(),
  };

  zoomSegments.push(newSegment);
  saveZoomSegments();
  renderZoomSegments();
  updateDebugInfo();

  console.log('Added zoom segment:', newSegment);
});

// Render zoom segments on timeline
function renderZoomSegments() {
  // Remove existing segments
  document.querySelectorAll('.zoom-segment').forEach(el => el.remove());

  const duration = actualDuration || hiddenVideo.duration;
  if (!isFinite(duration) || duration <= 0) return;

  zoomSegments.forEach(segment => {
    const segmentEl = document.createElement('div');
    segmentEl.className = 'zoom-segment';
    segmentEl.dataset.segmentId = segment.id;

    const startPercent = (segment.start / duration) * 100;
    const widthPercent = ((segment.end - segment.start) / duration) * 100;

    segmentEl.style.left = `${startPercent}%`;
    segmentEl.style.width = `${widthPercent}%`;

    // Add label
    const label = document.createElement('div');
    label.className = 'zoom-segment-label';
    label.textContent = `${segment.zoomLevel}x`;
    segmentEl.appendChild(label);

    // Add handles for resizing
    const leftHandle = document.createElement('div');
    leftHandle.className = 'zoom-segment-handle left';
    segmentEl.appendChild(leftHandle);

    const rightHandle = document.createElement('div');
    rightHandle.className = 'zoom-segment-handle right';
    segmentEl.appendChild(rightHandle);

    timelineTrack.appendChild(segmentEl);

    // Add drag handlers (simplified for now - you can enhance this)
    segmentEl.addEventListener('dblclick', () => {
      if (confirm(`Delete this zoom effect (${segment.zoomLevel}x)?`)) {
        zoomSegments = zoomSegments.filter(s => s.id !== segment.id);
        saveZoomSegments();
        renderZoomSegments();
        updateDebugInfo();
      }
    });
  });
}

// Save zoom segments to storage
function saveZoomSegments() {
  chrome.storage.local.set({ zoomSegments: zoomSegments }, () => {
    console.log('Zoom segments saved');
  });
}

// Debug mode toggle
function updateDebugVisibility() {
  if (debugMode) {
    debugInfo.classList.remove('debug-hidden');
    debugPanel.classList.remove('debug-hidden');
    cursorOffsetPanel.classList.remove('debug-hidden');
  } else {
    debugInfo.classList.add('debug-hidden');
    debugPanel.classList.add('debug-hidden');
    cursorOffsetPanel.classList.add('debug-hidden');
  }
}

// Load debug mode state and cursor offset from storage
chrome.storage.local.get(['debugMode', 'cursorTimeOffset'], result => {
  debugMode = result.debugMode || false;
  debugModeToggle.checked = debugMode;

  cursorTimeOffset = result.cursorTimeOffset || 0;
  cursorOffsetSlider.value = cursorTimeOffset;
  cursorOffsetValue.textContent = cursorTimeOffset.toFixed(1) + 's';

  updateDebugVisibility();
});

// Handle debug mode toggle
debugModeToggle.addEventListener('change', () => {
  debugMode = debugModeToggle.checked;
  chrome.storage.local.set({ debugMode: debugMode }, () => {
    console.log('Debug mode:', debugMode ? 'enabled' : 'disabled');
  });
  updateDebugVisibility();
});

// Handle cursor offset adjustment
cursorOffsetSlider.addEventListener('input', () => {
  cursorTimeOffset = parseFloat(cursorOffsetSlider.value);
  cursorOffsetValue.textContent = cursorTimeOffset.toFixed(1) + 's';
  chrome.storage.local.set({ cursorTimeOffset: cursorTimeOffset }, () => {
    console.log('Cursor time offset:', cursorTimeOffset + 's');
  });
});

// Load video on page load
loadVideo();
