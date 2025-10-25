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

let videoDataUrl = null;
let isPlaying = false;
let animationFrameId = null;
let actualDuration = null; // Duration from recording timestamps

// Format time helper
function formatTime(seconds) {
  if (!isFinite(seconds) || isNaN(seconds)) {
    return '00:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Render video frame to canvas
function renderFrame() {
  if (!isPlaying || hiddenVideo.paused || hiddenVideo.ended) {
    return;
  }

  // Draw current video frame to canvas
  ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);

  // Update time display
  currentTimeDisplay.textContent = formatTime(hiddenVideo.currentTime);
  playheadTime.textContent = formatTime(hiddenVideo.currentTime);

  // Update playhead position
  const duration = actualDuration || hiddenVideo.duration;
  if (isFinite(duration) && duration > 0) {
    const progress = (hiddenVideo.currentTime / duration) * 100;
    playhead.style.left = `${progress}%`;
  }

  // Continue rendering
  animationFrameId = requestAnimationFrame(renderFrame);
}

// Load video from storage
function loadVideo() {
  chrome.storage.local.get(
    ['recordedVideo', 'timestamp', 'recordingDuration'],
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

        // Enable controls
        playPauseBtn.disabled = false;
        downloadBtn.disabled = false;
        deleteBtn.disabled = false;

        const date = new Date(result.timestamp);
        infoText.textContent = `Recording from ${date.toLocaleString()}`;
      } else {
        infoText.textContent = 'No recording available. Record a video first.';
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
    chrome.storage.local.remove(['recordedVideo', 'timestamp'], () => {
      hiddenVideo.src = '';
      canvas.style.display = 'none';
      noVideo.style.display = 'block';
      playPauseBtn.disabled = true;
      downloadBtn.disabled = true;
      deleteBtn.disabled = true;
      infoText.textContent = 'Recording deleted.';
      videoDataUrl = null;
      isPlaying = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    });
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

// Load video on page load
loadVideo();
