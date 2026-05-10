# Cut The Music

## Project Goal

Cut The Music is a Chrome extension project for helping Muslims watch YouTube videos with less background music while keeping speech as clear as possible.

The long-term goal is a toolbar toggle that can be turned on while watching a YouTube video. When enabled, the extension should process the current tab audio and output a more voice-focused version of the video audio.

This project is also a programming learning project. Prefer clear, understandable code over clever abstractions. When adding new functionality, keep the steps small and explainable.

## Product Direction

The project should grow in stages:

1. Basic Chrome extension shell.
2. Popup UI with an on/off toggle.
3. YouTube page detection through a content script.
4. Saved user preference for whether the filter is enabled.
5. Tab audio capture using Chrome extension APIs.
6. Browser-based audio processing to make speech clearer.
7. Later, experimental AI-based voice/music separation.

True background music removal is difficult because YouTube provides one mixed audio stream. The realistic near-term goal is voice enhancement and music reduction, not perfect music removal.

## Current Project Structure

```text
cut-the-music/
  AGENTS.md
  README.md
  extension/
    manifest.json
    background.js
    popup.html
    popup.js
    content.js
    offscreen.html
    offscreen.js
    audio-worklet.js
  models/
```

## Directory Notes

### `extension/`

Contains the Chrome extension source code.

### `extension/manifest.json`

The Manifest V3 configuration file. It declares the extension name, permissions, popup, content script, background service worker, host permissions, and resources available to YouTube pages.

### `extension/background.js`

The Manifest V3 background service worker. Currently it initializes the saved toggle state with `musicFilterEnabled: false`.

Use this file for extension-level coordination, message handling, storage access, tab capture setup, and offscreen document management.

### `extension/popup.html`

The toolbar popup markup. This should eventually contain the user-facing toggle and simple status text.

### `extension/popup.js`

The popup behavior script. Use it to read and update the saved toggle state, update the popup UI, and send messages to the background service worker when the user changes settings.

### `extension/content.js`

The script injected into matching YouTube pages. Use it for page-level detection and communication with the YouTube video page.

Avoid putting heavy audio processing here.

### `extension/offscreen.html`

The offscreen document page. Manifest V3 service workers are not designed for long-running DOM or audio work, so audio processing is hosted through an offscreen document.

### `extension/offscreen.js`

The script for the offscreen document. It receives captured audio stream IDs and sets up the Web Audio graph for voice-focused enhancement.

### `extension/audio-worklet.js`

Future home for low-latency audio processing code. This can eventually run inside an `AudioWorkletProcessor`.

### `models/`

Reserved for future local model files or model notes if AI-based source separation is added later.

Do not add large model binaries to the repository without first deciding how they should be stored, licensed, and loaded.

## Chrome Extension Notes

- This project uses Manifest V3.
- The project requires Chrome 116 or newer because tab capture stream IDs from a service worker are consumed by an offscreen document.
- Keep permissions as narrow as possible.
- The extension currently targets `https://www.youtube.com/*`.
- Use `chrome.storage.sync` for small user settings.
- Use `chrome.runtime.sendMessage` or named ports for communication between popup, background, content, and offscreen scripts.
- Remember that the background service worker can stop and restart. Do not rely on long-lived in-memory state there.

## Audio Processing Notes

The browser receives YouTube audio as one mixed stream. Simple filters can improve speech clarity, but they cannot perfectly remove music.

Useful early browser audio tools may include:

- `AudioContext`
- `MediaStreamAudioSourceNode`
- `BiquadFilterNode`
- `DynamicsCompressorNode`
- `GainNode`
- `AudioWorkletNode`

The current audio enhancement path uses tab capture plus an offscreen Web Audio graph. It can process audio live to keep the enhanced audio synced with the YouTube video.

The current live processor applies a high-pass filter, low-shelf reduction, presence/clarity boosts, light high-shelf reduction, compression, and output gain.

There is also an experimental AI chunk path. It captures one-second PCM chunks in `audio-worklet.js`, calls `ai-processor.js`, then runs the same DSP cleanup before scheduling the chunk for playback. If ONNX Runtime Web or `models/voice-separator.onnx` is missing, the extension falls back to live DSP mode.

Chunked scheduling can introduce audible delay, pause tails, and video/audio sync drift. Do not use it for the default listening path unless the video playback is deliberately delayed to match the processed audio.

This improves speech focus, but it is not true AI source separation.

## Development Guidelines

- Keep changes small and easy to understand.
- Prefer plain JavaScript, HTML, and CSS unless a build tool becomes necessary.
- Do not introduce a framework until the project needs one.
- Validate `manifest.json` after editing it.
- Avoid broad host permissions like `<all_urls>` unless the project direction changes.
- Do not commit generated files, dependency folders, or large model files without a clear reason.
- When adding user-facing behavior, make sure the extension still loads from Chrome's `chrome://extensions` page in developer mode.

## Suggested Next Milestones

1. Build `popup.html` and `popup.js` with an on/off toggle.
2. Save the toggle state to `chrome.storage.sync`.
3. Show whether the current tab is a supported YouTube page.
4. Add message passing between popup and background.
5. Add a basic content script that detects the YouTube video element.
6. Experiment with a simple Web Audio speech-enhancement pipeline.
