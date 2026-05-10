const FILTER_CLASS = "cut-the-music-enabled";

let observedVideo = null;
let lastPlaybackState = "";

function applyFilterState(isEnabled) {
  document.documentElement.classList.toggle(FILTER_CLASS, isEnabled);
}

function sendPlaybackState(video) {
  const playbackState = [
    video.paused,
    Math.round(video.currentTime * 10) / 10,
    video.playbackRate
  ].join(":");

  if (playbackState === lastPlaybackState) {
    return;
  }

  lastPlaybackState = playbackState;

  chrome.runtime.sendMessage({
    type: "YOUTUBE_PLAYBACK_STATE",
    paused: video.paused,
    currentTime: video.currentTime,
    playbackRate: video.playbackRate
  });
}

function observeVideo(video) {
  if (!video || video === observedVideo) {
    return;
  }

  observedVideo = video;

  for (const eventName of ["play", "playing", "pause", "waiting", "seeking", "seeked", "ratechange", "ended"]) {
    video.addEventListener(eventName, () => sendPlaybackState(video));
  }

  sendPlaybackState(video);
}

function findAndObserveVideo() {
  observeVideo(document.querySelector("video"));
}

chrome.storage.sync.get("musicFilterEnabled", ({ musicFilterEnabled = false }) => {
  applyFilterState(musicFilterEnabled);
  findAndObserveVideo();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "MUSIC_FILTER_CHANGED") {
    return;
  }

  applyFilterState(Boolean(message.enabled));
  findAndObserveVideo();
});

const observer = new MutationObserver(findAndObserveVideo);

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

setInterval(() => {
  if (observedVideo) {
    sendPlaybackState(observedVideo);
  }
}, 250);
