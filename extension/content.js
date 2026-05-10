const FILTER_CLASS = "cut-the-music-enabled";

function applyFilterState(isEnabled) {
  document.documentElement.classList.toggle(FILTER_CLASS, isEnabled);
}

chrome.storage.sync.get("musicFilterEnabled", ({ musicFilterEnabled = false }) => {
  applyFilterState(musicFilterEnabled);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "MUSIC_FILTER_CHANGED") {
    return;
  }

  applyFilterState(Boolean(message.enabled));
});
