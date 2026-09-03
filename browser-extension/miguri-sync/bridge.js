const PAGE_SOURCE = "46log-miguri-page";
const EXTENSION_SOURCE = "46log-miguri-extension";

function post(type, payload = {}) {
  window.postMessage(
    { source: EXTENSION_SOURCE, type, ...payload },
    window.location.origin,
  );
}

async function postAutoState() {
  const response = await chrome.runtime.sendMessage({
    type: "MIGURI46LOG_GET_AUTO_STATE",
  });
  post("AUTO_STATE", { autoState: response?.state || null });
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin)
    return;
  const message = event.data;
  if (!message || message.source !== PAGE_SOURCE) return;

  if (message.type === "PING") {
    post("PONG", { version: chrome.runtime.getManifest().version });
    postAutoState().catch(() => {});
    return;
  }

  if (message.type === "TAKE_RESULT") {
    chrome.runtime
      .sendMessage({ type: "MIGURI46LOG_TAKE_RESULT" })
      .then((response) => {
        if (response?.result) post("RESULT", { payload: response.result });
      })
      .catch(() => post("ERROR", { message: "同步结果读取失败，请刷新页面重试" }));
    return;
  }

  if (message.type === "ACK_RESULT") {
    chrome.runtime
      .sendMessage({
        type: "MIGURI46LOG_ACK_RESULT",
        completedAt: message.completedAt || "",
      })
      .then((response) => {
        if (!response?.ok) {
          post("ERROR", {
            message: response?.error || "履历已保存，但无法继续下一项同步",
          });
        }
      })
      .catch(() =>
        post("ERROR", { message: "履历已保存，但无法继续下一项同步" }),
      );
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
    return;
  }

  if (message.type === "SET_AUTO_ENABLED") {
    chrome.runtime
      .sendMessage({
        type: "MIGURI46LOG_SET_AUTO_ENABLED",
        enabled: message.enabled === true,
      })
      .then((response) => {
        if (!response?.ok)
          post("ERROR", { message: response?.error || "无法更新自动同步" });
        else post("AUTO_STATE", { autoState: response.state });
      })
      .catch(() => post("ERROR", { message: "扩展连接失败，请重新加载页面" }));
    return;
  }

  if (message.type === "RUN_AUTO") {
    chrome.runtime
      .sendMessage({ type: "MIGURI46LOG_RUN_AUTO" })
      .then((response) => {
        if (!response?.ok)
          post("ERROR", { message: response?.error || "无法启动自动检查" });
        else postAutoState().catch(() => {});
      })
      .catch(() => post("ERROR", { message: "扩展连接失败，请重新加载页面" }));
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "MIGURI46LOG_EXTENSION_PROGRESS") {
    post("PROGRESS", { title: message.title, detail: message.detail });
  }
  if (message?.type === "MIGURI46LOG_AUTO_STATE_CHANGED") {
    post("AUTO_STATE", { autoState: message.state || null });
  }
});

post("PONG", { version: chrome.runtime.getManifest().version });
postAutoState().catch(() => {});
