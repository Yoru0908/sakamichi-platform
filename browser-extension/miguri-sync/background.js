const JOB_KEY = "miguriSyncJob";
const RESULT_KEY = "miguriSyncResult";
const MUSIC_URL = "https://fortunemusic.jp/mypage/apply_list/";
const MEETS_URL = "https://ticket.fortunemeets.app/hinatazaka46/";

async function loadJob() {
  const stored = await chrome.storage.session.get(JOB_KEY);
  return stored[JOB_KEY] || null;
}

async function startJob(source, returnTabId) {
  const job = {
    id: crypto.randomUUID(),
    source,
    returnTabId,
    startedAt: new Date().toISOString(),
  };
  await chrome.storage.session.set({ [JOB_KEY]: job });
  await chrome.tabs.create({
    url: source === "fortunemusic" ? MUSIC_URL : MEETS_URL,
    active: true,
  });
  return job;
}

async function relayToDashboard(job, payload) {
  if (!job?.returnTabId) return;
  try {
    await chrome.tabs.sendMessage(job.returnTabId, payload);
  } catch {}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "MIGURI46LOG_START") {
    const source =
      message.source === "fortunemeets" ? "fortunemeets" : "fortunemusic";
    startJob(source, sender.tab?.id)
      .then((job) => sendResponse({ ok: true, jobId: job.id }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_GET_JOB") {
    loadJob()
      .then((job) => sendResponse({ job }))
      .catch(() => sendResponse({ job: null }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_PROGRESS") {
    loadJob().then((job) =>
      relayToDashboard(job, {
        type: "MIGURI46LOG_EXTENSION_PROGRESS",
        title: message.title || "同步中",
        detail: message.detail || "",
      }),
    );
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "MIGURI46LOG_RESULT") {
    loadJob()
      .then(async (job) => {
        if (!job || job.id !== message.jobId) {
          sendResponse({ ok: false, error: "同步任务已过期" });
          return;
        }
        const result = {
          version: 1,
          source: job.source,
          next: job.source === "fortunemusic" ? "meets" : "done",
          records: Array.isArray(message.records) ? message.records : [],
          completedAt: new Date().toISOString(),
        };
        await chrome.storage.session.set({ [RESULT_KEY]: result });
        await chrome.storage.session.remove(JOB_KEY);
        if (job.returnTabId) {
          await chrome.tabs.update(job.returnTabId, {
            active: true,
            url: "https://46log.com/miguri?extensionImport=1",
          });
        } else {
          await chrome.tabs.create({
            active: true,
            url: "https://46log.com/miguri?extensionImport=1",
          });
        }
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_TAKE_RESULT") {
    chrome.storage.session
      .get(RESULT_KEY)
      .then(async (stored) => {
        const result = stored[RESULT_KEY] || null;
        if (result) await chrome.storage.session.remove(RESULT_KEY);
        sendResponse({ result });
      })
      .catch(() => sendResponse({ result: null }));
    return true;
  }
});

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: "https://46log.com/miguri*" });
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId)
      await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: "https://46log.com/miguri", active: true });
  }
});
