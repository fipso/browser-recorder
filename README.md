# Browser Recorder Chrome Extension

A simple and powerful Chrome extension for recording your screen, windows, or tabs with a fullscreen interface and video player.

## Features

- **Screen Recording**: Record your entire screen, specific windows, or individual tabs
- **Fullscreen Recorder Interface**: Clean, fullscreen UI with real-time canvas preview
- **Video Player**: Built-in player with playback controls
- **Recording Controls**: Start, stop, download recordings
- **Playback Features**:
  - Play/pause
  - Timeline scrubbing
  - Volume control
  - Playback speed adjustment (0.25x to 2x)
  - Keyboard shortcuts
- **Storage**: Recordings are saved to Chrome's local storage
- **Manifest V3**: Built with the latest Chrome extension standards

## Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/fipso/browser-recorder.git
   cd browser-recorder
   ```

2. Install development dependencies:

   ```bash
   npm install
   ```

3. Format code (runs automatically on commit):
   ```bash
   npm run format
   ```

## Installation

1. Clone or download this repository
2. Install dependencies: `npm install`
3. Add icon files to the `icons/` directory (see icons/README.md)
   - Or temporarily remove icon references from manifest.json
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode" (toggle in top-right corner)
6. Click "Load unpacked"
7. Select the browser-recorder directory

## Usage

### Recording

1. Click the extension icon in your Chrome toolbar
2. Click "Open Recorder" to open the fullscreen recorder interface
3. Click "Start Recording"
4. Select the screen, window, or tab you want to record
5. Grant permission when prompted
6. The recording will start, and you'll see the live preview on the canvas
7. Click "Stop Recording" when done
8. Download the video or open it in the player

### Playing Recordings

1. Click the extension icon
2. Click "Open Player" to open the fullscreen player interface
3. Your most recent recording will load automatically
4. Use the playback controls or keyboard shortcuts

### Keyboard Shortcuts (Player)

- `Space`: Play/Pause
- `←`: Rewind 5 seconds
- `→`: Forward 5 seconds
- `↑`: Increase volume
- `↓`: Decrease volume
- `F`: Toggle fullscreen

## File Structure

```
chrome-recorder-2/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for tab management
├── content.js            # Content script
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic
├── recorder.html         # Fullscreen recorder interface
├── recorder.js           # Recording logic with canvas
├── player.html           # Fullscreen player interface
├── player.js             # Player logic with controls
├── icons/                # Extension icons
│   └── README.md
└── README.md             # This file
```

## Technical Details

- **Manifest Version**: 3
- **Recording Format**: WebM (VP9 or VP8 codec)
- **Storage**: Chrome Local Storage (chrome.storage.local)
- **APIs Used**:
  - `navigator.mediaDevices.getDisplayMedia()` - Screen capture
  - `MediaRecorder` - Recording stream
  - `Canvas API` - Real-time preview
  - Chrome Extension APIs (tabs, storage, runtime)

## Development

### Code Formatting

This project uses [Prettier](https://prettier.io/) for code formatting and [Husky](https://typicode.github.io/husky/) for Git hooks.

- **Automatic formatting**: Code is automatically formatted on commit via pre-commit hooks
- **Manual formatting**: Run `npm run format` to format all files
- **Check formatting**: Run `npm run format:check` to check if files are properly formatted

### Available Scripts

- `npm run format` - Format all files with Prettier
- `npm run format:check` - Check if files are formatted correctly
- `npm run lint` - Same as format:check (alias for consistency)

### Git Hooks

- **Pre-commit**: Automatically formats staged files before commit
- **Commit-msg**: Validates commit message format

## Browser Compatibility

- Chrome 88+ (Manifest V3 support)
- Chromium-based browsers with Manifest V3 support

## Limitations

- Recordings are stored in browser local storage (size limits apply)
- Large/long recordings may exceed storage quota
- Audio recording requires permission during screen selection

## Future Enhancements

- Download recordings automatically
- Support for multiple recordings
- Recording quality settings
- Webcam overlay option
- Drawing/annotation tools during recording
- Cloud storage integration

## License

This is a sample project. Feel free to use and modify as needed.
