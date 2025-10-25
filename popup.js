// Popup logic
const openRecorderBtn = document.getElementById('openRecorderBtn');
const openPlayerBtn = document.getElementById('openPlayerBtn');
const status = document.getElementById('status');

function showStatus(message, duration = 2000) {
  status.textContent = message;
  status.classList.add('show');
  setTimeout(() => {
    status.classList.remove('show');
  }, duration);
}

openRecorderBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openRecorder' }, response => {
    if (response && response.tabId) {
      showStatus('Recorder opened!');
      window.close();
    } else {
      showStatus('Failed to open recorder.');
    }
  });
});

openPlayerBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openPlayer' }, response => {
    if (response && response.tabId) {
      showStatus('Player opened!');
      window.close();
    } else {
      showStatus('Failed to open player.');
    }
  });
});
