const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

let activeCaptureTabId = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("musicFilterEnabled", ({ musicFilterEnabled }) => {
    if (typeof musicFilterEnabled === "undefined") {
      chrome.storage.sync.set({ musicFilterEnabled: false });
    }
  });
});

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Process captured YouTube tab audio with Web Audio."
  });
}

async function sendMessageToOffscreen(message) {
  return chrome.runtime.sendMessage({
    target: "offscreen",
    ...message
  });
}

async function startAudioEnhancement(tabId) {
  await ensureOffscreenDocument();

  if (activeCaptureTabId) {
    await sendMessageToOffscreen({ type: "STOP_AUDIO_ENHANCEMENT" });
    activeCaptureTabId = null;
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId
  });

  const response = await sendMessageToOffscreen({
    type: "START_AUDIO_ENHANCEMENT",
    streamId
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Unable to start audio enhancement.");
  }

  activeCaptureTabId = tabId;
  await chrome.storage.sync.set({ musicFilterEnabled: true });

  return { ok: true };
}

async function stopAudioEnhancement() {
  if (await hasOffscreenDocument()) {
    await sendMessageToOffscreen({ type: "STOP_AUDIO_ENHANCEMENT" });
    await chrome.offscreen.closeDocument();
  }

  activeCaptureTabId = null;
  await chrome.storage.sync.set({ musicFilterEnabled: false });

  return { ok: true };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeCaptureTabId) {
    stopAudioEnhancement();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeCaptureTabId && changeInfo.status === "loading") {
    stopAudioEnhancement();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "YOUTUBE_PLAYBACK_STATE") {
    if (activeCaptureTabId) {
      sendMessageToOffscreen({
        type: "SYNC_PLAYBACK_STATE",
        paused: message.paused,
        currentTime: message.currentTime,
        playbackRate: message.playbackRate
      });
    }

    return false;
  }

  if (message?.type !== "SET_AUDIO_ENHANCEMENT") {
    return false;
  }

  const action = message.enabled
    ? startAudioEnhancement(message.tabId)
    : stopAudioEnhancement();

  action
    .then(sendResponse)
    .catch((error) => {
      chrome.storage.sync.set({ musicFilterEnabled: false });
      sendResponse({
        ok: false,
        error: error?.message || "Unable to update audio enhancement."
      });
    });

  return true;
});
