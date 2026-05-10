let audioContext = null;
let capturedStream = null;
let sourceNode = null;
let outputGain = null;

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
}

function createVoiceEnhancementChain(context, source) {
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
    .connect(context.destination);
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
  sourceNode = audioContext.createMediaStreamSource(capturedStream);
  createVoiceEnhancementChain(audioContext, sourceNode);

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

  return false;
});
