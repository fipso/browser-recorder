// Recorder logic
let mediaRecorder = null;
let recordedChunks = [];
let stream = null;
let startTime = null;
let timerInterval = null;

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

      // Save to chrome.storage
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;
        chrome.storage.local.set(
          {
            recordedVideo: base64data,
            timestamp: endTime,
            recordingStartTime: startTime,
            recordingEndTime: endTime,
            recordingDuration: (endTime - startTime) / 1000, // Duration in seconds
          },
          () => {
            console.log('Video saved to storage');
            downloadBtn.disabled = false;
            playBtn.disabled = false;
            infoElement.textContent =
              'Recording saved! You can download it or open it in the player.';
          }
        );
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

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = 'Recording';
    recordingIndicator.style.display = 'block';
    timerElement.style.display = 'block';
    infoElement.textContent =
      'Recording in progress... Click "Stop Recording" when done.';

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
