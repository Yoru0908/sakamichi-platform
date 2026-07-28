const PAGE_SOURCE = "46log-miguri-page";
const EXTENSION_SOURCE = "46log-miguri-extension";

function post(type, payload = {}) {
  window.postMessage(
    { source: EXTENSION_SOURCE, type, ...payload },
    window.location.origin,
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin)
    return;
  const message = event.data;
  if (!message || message.source !== PAGE_SOURCE) return;

  if (message.type === "PING") {
    post("PONG", { version: chrome.runtime.getManifest().version });
    return;
  }

  if (
    message.type === "START" &&
    ["fortunemusic", "fortunemeets"].includes(message.syncSource)
  ) {
    chrome.runtime
      .sendMessage({
        type: "MIGURI46LOG_START",
        source: message.syncSource,
      })
      .then((response) => {
        if (!response?.ok)
          post("ERROR", { message: response?.error || "无法启动同步" });
        else post("STARTED", { syncSource: message.syncSource });
      })
      .catch(() => post("ERROR", { message: "扩展连接失败，请重新加载页面" }));
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "MIGURI46LOG_EXTENSION_PROGRESS") {
    post("PROGRESS", { title: message.title, detail: message.detail });
  }
});

chrome.runtime
  .sendMessage({ type: "MIGURI46LOG_TAKE_RESULT" })
  .then((response) => {
    post("PONG", { version: chrome.runtime.getManifest().version });
    if (response?.result) post("RESULT", { payload: response.result });
  })
  .catch(() => {});
