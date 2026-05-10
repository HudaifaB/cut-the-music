const toggle = document.querySelector("#musicToggle");
const stateText = document.querySelector("#stateText");
const statusText = document.querySelector("#statusText");

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);

function isYouTubeUrl(url) {
  try {
    const { hostname } = new URL(url);
    return YOUTUBE_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function setToggleState(isEnabled) {
  toggle.checked = isEnabled;
  stateText.textContent = isEnabled ? "On" : "Off";
}

function setStatus(message) {
  statusText.textContent = message;
}

function setBusy(isBusy) {
  toggle.disabled = isBusy;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function notifyActiveTab(tab, isEnabled) {
  if (!tab?.id || !isYouTubeUrl(tab.url)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "MUSIC_FILTER_CHANGED",
      enabled: isEnabled
    });
  } catch {
    setStatus("Toggle saved. Refresh the YouTube tab if the page script is not ready yet.");
  }
}

async function setAudioEnhancement(tab, isEnabled) {
  if (!isEnabled) {
    return chrome.runtime.sendMessage({
      type: "SET_AUDIO_ENHANCEMENT",
      tabId: tab?.id,
      enabled: false
    });
  }

  if (!tab?.id || !isYouTubeUrl(tab.url)) {
    return {
      ok: false,
      error: "Open a YouTube video to use the filter."
    };
  }

  return chrome.runtime.sendMessage({
    type: "SET_AUDIO_ENHANCEMENT",
    tabId: tab.id,
    enabled: isEnabled
  });
}

async function initializePopup() {
  const [{ musicFilterEnabled = false }, tab] = await Promise.all([
    chrome.storage.sync.get("musicFilterEnabled"),
    getActiveTab()
  ]);

  setToggleState(musicFilterEnabled);

  if (isYouTubeUrl(tab?.url)) {
    setStatus("Ready on this YouTube tab.");
    return;
  }

  setStatus("Open a YouTube video to use the filter.");
}

toggle.addEventListener("change", async () => {
  const isEnabled = toggle.checked;
  setToggleState(isEnabled);
  setBusy(true);

  try {
    const tab = await getActiveTab();
    setStatus(isEnabled ? "Preparing enhanced audio..." : "Restoring original audio...");

    const response = await setAudioEnhancement(tab, isEnabled);

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to update the audio filter.");
    }

    await notifyActiveTab(tab, isEnabled);

    if (isEnabled && response.fallbackReason) {
      setStatus(`Live filter is playing. ${response.fallbackReason}`);
    } else {
      setStatus(isEnabled ? "Enhanced audio is playing." : "Original audio restored.");
    }
  } catch (error) {
    setToggleState(false);
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
});

initializePopup();
