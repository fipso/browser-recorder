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
const progressBar = document.getElementById('progressBar');
const progressFilled = document.getElementById('progressFilled');
const currentTimeDisplay = document.getElementById('currentTime');
const durationDisplay = document.getElementById('duration');
const infoText = document.getElementById('infoText');

let videoDataUrl = null;
let isPlaying = false;
let animationFrameId = null;

// Format time helper
function formatTime(seconds) {
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
  const progress = (hiddenVideo.currentTime / hiddenVideo.duration) * 100;
  progressFilled.style.width = `${progress}%`;

  // Continue rendering
  animationFrameId = requestAnimationFrame(renderFrame);
}

// Load video from storage
function loadVideo() {
  chrome.storage.local.get(['recordedVideo', 'timestamp'], result => {
    if (result.recordedVideo) {
      videoDataUrl = result.recordedVideo;
      hiddenVideo.src = videoDataUrl;

      // Enable controls
      playPauseBtn.disabled = false;
      downloadBtn.disabled = false;
      deleteBtn.disabled = false;

      const date = new Date(result.timestamp);
      infoText.textContent = `Recording from ${date.toLocaleString()}`;
    } else {
      infoText.textContent = 'No recording available. Record a video first.';
    }
  });
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

  // Set duration display
  durationDisplay.textContent = formatTime(hiddenVideo.duration);
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

// Progress bar click
progressBar.addEventListener('click', e => {
  if (hiddenVideo.src) {
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    hiddenVideo.currentTime = pos * hiddenVideo.duration;

    // Draw frame at new position
    if (!isPlaying) {
      // Wait a bit for seek to complete
      setTimeout(() => {
        ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
      }, 100);
    }
  }
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
        hiddenVideo.currentTime = Math.min(
          hiddenVideo.duration,
          hiddenVideo.currentTime + 5
        );
        if (!isPlaying) {
          setTimeout(() => {
            ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
          }, 100);
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
