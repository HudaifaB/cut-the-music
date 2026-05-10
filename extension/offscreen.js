let audioContext = null;
let capturedStream = null;
let sourceNode = null;
let outputGain = null;
let captureNode = null;
let silentGain = null;
let playbackCursor = 0;
let chunkQueue = Promise.resolve();
let processingSessionId = 0;

const LIVE_MODE = "live";
const EXPERIMENTAL_AI_MODE = "experimental-ai";
const PLAYBACK_BUFFER_SECONDS = 0.45;
const MIN_SCHEDULE_LEAD_SECONDS = 0.12;

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
  outputGain = null;
  captureNode = null;
  silentGain = null;
  playbackCursor = 0;
  chunkQueue = Promise.resolve();
  processingSessionId += 1;
}

function createVoiceEnhancementChain(context, source, destination = context.destination) {
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

  outputGain = new GainNode(context, {
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

async function processDspChunk(channels, sampleRate) {
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
  if (!audioContext || sessionId !== processingSessionId) {
    return;
  }

  const source = new AudioBufferSourceNode(audioContext, { buffer });
  const earliestStart = audioContext.currentTime + MIN_SCHEDULE_LEAD_SECONDS;
  const startAt = Math.max(earliestStart, playbackCursor);

  source.connect(audioContext.destination);
  source.start(startAt);

  playbackCursor = startAt + buffer.duration;
}

async function processAiChunk({ channels, sampleRate }, sessionId) {
  const aiProcessor = globalThis.cutTheMusicAiProcessor;
  const aiResult = aiProcessor
    ? await aiProcessor.processChunk(channels, sampleRate)
    : { channels, sampleRate, usedAi: false };

  const processedBuffer = await processDspChunk(aiResult.channels, aiResult.sampleRate);
  scheduleProcessedChunk(processedBuffer, sessionId);
}

function queueAiChunk(message, sessionId) {
  chunkQueue = chunkQueue
    .then(() => processAiChunk(message, sessionId))
    .catch(() => {
      stopCurrentAudio();
    });
}

async function getCapturedTabStream(streamId) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });
}

async function startLiveEnhancement(streamId) {
  capturedStream = await getCapturedTabStream(streamId);
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(capturedStream);
  createVoiceEnhancementChain(audioContext, sourceNode);

  return { ok: true, mode: LIVE_MODE };
}

async function startExperimentalAiEnhancement(streamId) {
  const aiProcessor = globalThis.cutTheMusicAiProcessor;
  const hasAiModel = aiProcessor ? await aiProcessor.initialize() : false;

  if (!hasAiModel) {
    const fallbackResponse = await startLiveEnhancement(streamId);
    return {
      ...fallbackResponse,
      mode: LIVE_MODE,
      fallbackReason: aiProcessor?.failureReason || "AI processor is not available."
    };
  }

  capturedStream = await getCapturedTabStream(streamId);
  audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule("audio-worklet.js");

  sourceNode = audioContext.createMediaStreamSource(capturedStream);
  captureNode = new AudioWorkletNode(audioContext, "chunked-audio-capture");
  silentGain = new GainNode(audioContext, { gain: 0 });
  playbackCursor = audioContext.currentTime + PLAYBACK_BUFFER_SECONDS;
  const sessionId = processingSessionId;

  captureNode.port.onmessage = (event) => {
    if (event.data?.type === "AUDIO_CHUNK") {
      queueAiChunk(event.data, sessionId);
    }
  };

  sourceNode
    .connect(captureNode)
    .connect(silentGain)
    .connect(audioContext.destination);

  return { ok: true, mode: EXPERIMENTAL_AI_MODE };
}

async function startAudioEnhancement(streamId, mode = LIVE_MODE) {
  stopCurrentAudio();

  if (mode === EXPERIMENTAL_AI_MODE) {
    return startExperimentalAiEnhancement(streamId);
  }

  return startLiveEnhancement(streamId);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") {
    return false;
  }

  if (message.type === "START_AUDIO_ENHANCEMENT") {
    startAudioEnhancement(message.streamId, message.mode)
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

  return false;
});
