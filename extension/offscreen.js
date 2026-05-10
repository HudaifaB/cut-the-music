let audioContext = null;
let capturedStream = null;
let sourceNode = null;
let captureNode = null;
let silentGain = null;
let playbackCursor = 0;
let isProcessing = false;
let chunkQueue = Promise.resolve();
let processingSessionId = 0;
let scheduledSources = [];
let isVideoPaused = false;
let videoPlaybackRate = 1;

const PLAYBACK_BUFFER_SECONDS = 0.35;
const MIN_SCHEDULE_LEAD_SECONDS = 0.08;

function stopCurrentAudio() {
  if (capturedStream) {
    for (const track of capturedStream.getTracks()) {
      track.stop();
    }
  }

  if (audioContext) {
    audioContext.close();
  }

  audioContext = null;
  capturedStream = null;
  sourceNode = null;
  captureNode = null;
  silentGain = null;
  playbackCursor = 0;
  isProcessing = false;
  chunkQueue = Promise.resolve();
  processingSessionId += 1;
  scheduledSources = [];
  isVideoPaused = false;
  videoPlaybackRate = 1;
}

function createVoiceEnhancementChain(context, source, destination) {
  const highPass = new BiquadFilterNode(context, {
    type: "highpass",
    frequency: 110,
    Q: 0.7
  });

  const lowShelf = new BiquadFilterNode(context, {
    type: "lowshelf",
    frequency: 240,
    gain: -8
  });

  const voicePresence = new BiquadFilterNode(context, {
    type: "peaking",
    frequency: 1800,
    Q: 0.9,
    gain: 5
  });

  const clarity = new BiquadFilterNode(context, {
    type: "peaking",
    frequency: 3200,
    Q: 1,
    gain: 3
  });

  const highShelf = new BiquadFilterNode(context, {
    type: "highshelf",
    frequency: 7200,
    gain: -2
  });

  const compressor = new DynamicsCompressorNode(context, {
    threshold: -28,
    knee: 24,
    ratio: 4,
    attack: 0.004,
    release: 0.18
  });

  const outputGain = new GainNode(context, {
    gain: 0.95
  });

  source
    .connect(highPass)
    .connect(lowShelf)
    .connect(voicePresence)
    .connect(clarity)
    .connect(highShelf)
    .connect(compressor)
    .connect(outputGain)
    .connect(destination);
}

function createAudioBuffer(context, channels, sampleRate) {
  const frameCount = channels[0]?.length || 0;
  const buffer = context.createBuffer(channels.length, frameCount, sampleRate);

  for (let channel = 0; channel < channels.length; channel += 1) {
    buffer.copyToChannel(channels[channel], channel);
  }

  return buffer;
}

async function processAudioChunk(channels, sampleRate) {
  const frameCount = channels[0]?.length || 0;
  const offlineContext = new OfflineAudioContext(channels.length, frameCount, sampleRate);
  const source = new AudioBufferSourceNode(offlineContext, {
    buffer: createAudioBuffer(offlineContext, channels, sampleRate)
  });

  createVoiceEnhancementChain(offlineContext, source, offlineContext.destination);
  source.start();

  return offlineContext.startRendering();
}

function scheduleProcessedChunk(buffer, sessionId) {
  if (!audioContext || !isProcessing || isVideoPaused || sessionId !== processingSessionId) {
    return;
  }

  const source = new AudioBufferSourceNode(audioContext, { buffer });
  source.playbackRate.value = videoPlaybackRate;
  const earliestStart = audioContext.currentTime + MIN_SCHEDULE_LEAD_SECONDS;
  const startAt = Math.max(earliestStart, playbackCursor);

  source.connect(audioContext.destination);
  source.start(startAt);
  source.addEventListener("ended", () => {
    scheduledSources = scheduledSources.filter((scheduledSource) => scheduledSource !== source);
  });
  scheduledSources.push(source);

  playbackCursor = startAt + buffer.duration;
}

function clearScheduledPlayback() {
  for (const source of scheduledSources) {
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
  }

  scheduledSources = [];
}

function syncPlaybackState({ paused, playbackRate }) {
  if (!audioContext || !isProcessing) {
    return;
  }

  isVideoPaused = Boolean(paused);

  if (isVideoPaused) {
    clearScheduledPlayback();
    playbackCursor = audioContext.currentTime + PLAYBACK_BUFFER_SECONDS;
    return;
  }

  playbackCursor = audioContext.currentTime + PLAYBACK_BUFFER_SECONDS;

  if (typeof playbackRate === "number" && playbackRate > 0) {
    videoPlaybackRate = playbackRate;
  }

  for (const source of scheduledSources) {
    source.playbackRate.value = videoPlaybackRate;
  }
}

async function handleAudioChunk({ channels, sampleRate }, sessionId) {
  const processedBuffer = await processAudioChunk(channels, sampleRate);
  scheduleProcessedChunk(processedBuffer, sessionId);
}

function queueAudioChunk(message, sessionId) {
  chunkQueue = chunkQueue
    .then(() => handleAudioChunk(message, sessionId))
    .catch(() => {
      stopCurrentAudio();
    });
}

async function startAudioEnhancement(streamId) {
  stopCurrentAudio();

  capturedStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule("audio-worklet.js");

  sourceNode = audioContext.createMediaStreamSource(capturedStream);
  captureNode = new AudioWorkletNode(audioContext, "chunked-audio-capture");
  silentGain = new GainNode(audioContext, { gain: 0 });
  playbackCursor = audioContext.currentTime + PLAYBACK_BUFFER_SECONDS;
  isProcessing = true;
  isVideoPaused = false;
  const sessionId = processingSessionId;

  captureNode.port.onmessage = (event) => {
    if (event.data?.type === "AUDIO_CHUNK") {
      queueAudioChunk(event.data, sessionId);
    }
  };

  sourceNode
    .connect(captureNode)
    .connect(silentGain)
    .connect(audioContext.destination);

  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") {
    return false;
  }

  if (message.type === "START_AUDIO_ENHANCEMENT") {
    startAudioEnhancement(message.streamId)
      .then(sendResponse)
      .catch((error) => {
        stopCurrentAudio();
        sendResponse({
          ok: false,
          error: error?.message || "Unable to start audio enhancement."
        });
      });

    return true;
  }

  if (message.type === "STOP_AUDIO_ENHANCEMENT") {
    stopCurrentAudio();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SYNC_PLAYBACK_STATE") {
    syncPlaybackState(message);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
