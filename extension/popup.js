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

  await chrome.storage.sync.set({ musicFilterEnabled: isEnabled });

  const tab = await getActiveTab();
  await notifyActiveTab(tab, isEnabled);

  if (isYouTubeUrl(tab?.url)) {
    setStatus(isEnabled ? "Filter is on for YouTube." : "Filter is off for YouTube.");
  } else {
    setStatus("Setting saved. Open YouTube to use it.");
  }
});

initializePopup();
