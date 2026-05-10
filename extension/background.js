chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("musicFilterEnabled", ({ musicFilterEnabled }) => {
    if (typeof musicFilterEnabled === "undefined") {
      chrome.storage.sync.set({ musicFilterEnabled: false });
    }
  });
});
