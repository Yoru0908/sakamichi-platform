importScripts("meets-api.js");

const JOB_KEY = "miguriSyncJob";
const RESULT_KEY = "miguriSyncResult";
const AUTO_STATE_KEY = "miguriAutoSyncState";
const AUTO_ALARM = "miguriAutoSync";
const AUTO_JOB_TIMEOUT_ALARM = "miguriAutoSyncJobTimeout";
const AUTO_INTERVAL_MINUTES = 30;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const MUSIC_URL = "https://fortunemusic.jp/mypage/apply_list/";
const MEETS_GROUPS = [
  {
    slug: "nogizaka46",
    label: "乃木坂46",
    url: "https://ticket.fortunemeets.app/nogizaka46/",
  },
  {
    slug: "sakurazaka46",
    label: "櫻坂46",
    url: "https://ticket.fortunemeets.app/sakurazaka46/",
  },
  {
    slug: "hinatazaka46",
    label: "日向坂46",
    url: "https://ticket.fortunemeets.app/hinatazaka46/",
  },
];
const DASHBOARD_URL = "https://46log.com/miguri";
const IMPORT_URL = "https://api.46log.com/api/miguri/entries/import";
const REFRESH_URL = "https://api.46log.com/api/auth/refresh";

const defaultAutoState = () => ({
  enabled: false,
  intervalMinutes: AUTO_INTERVAL_MINUTES,
  status: "idle",
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: "",
  needsLogin: "",
  imported: 0,
});

async function loadJob() {
  const stored = await chrome.storage.session.get(JOB_KEY);
  return stored[JOB_KEY] || null;
}

async function loadAutoState() {
  const stored = await chrome.storage.local.get(AUTO_STATE_KEY);
  return { ...defaultAutoState(), ...(stored[AUTO_STATE_KEY] || {}) };
}

function isJobStale(job) {
  const startedAt = Date.parse(job?.startedAt || "");
  return !Number.isFinite(startedAt) || Date.now() - startedAt >= JOB_TIMEOUT_MS;
}

async function removeStoredJob(job = null) {
  const current = await loadJob();
  if (job && current?.id !== job.id) return false;
  await chrome.storage.session.remove(JOB_KEY);
  await chrome.alarms.clear(AUTO_JOB_TIMEOUT_ALARM);
  return true;
}

async function discardSyncJob(job, closeTab = true) {
  const removed = await removeStoredJob(job);
  if (removed && closeTab && job?.tabId) {
    await chrome.tabs.remove(job.tabId).catch(() => {});
  }
  return removed;
}

async function scheduleAutoJobTimeout(job) {
  if (!job?.auto) return;
  const startedAt = Date.parse(job.startedAt || "");
  await chrome.alarms.create(AUTO_JOB_TIMEOUT_ALARM, {
    when:
      (Number.isFinite(startedAt) ? startedAt : Date.now()) + JOB_TIMEOUT_MS,
  });
}

async function broadcastAutoState(state) {
  const tabs = await chrome.tabs
    .query({ url: `${DASHBOARD_URL}*` })
    .catch(() => []);
  await Promise.all(
    tabs
      .filter((tab) => tab.id)
      .map((tab) =>
        chrome.tabs
          .sendMessage(tab.id, {
            type: "MIGURI46LOG_AUTO_STATE_CHANGED",
            state,
          })
          .catch(() => {}),
      ),
  );
}

async function updateAutoState(patch) {
  const state = { ...(await loadAutoState()), ...patch };
  await chrome.storage.local.set({ [AUTO_STATE_KEY]: state });
  await broadcastAutoState(state);
  return state;
}

async function ensureAutoAlarm() {
  const state = await loadAutoState();
  if (!state.enabled) {
    await chrome.alarms.clear(AUTO_ALARM);
    return;
  }
  const alarm = await chrome.alarms.get(AUTO_ALARM);
  if (!alarm) {
    await chrome.alarms.create(AUTO_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: AUTO_INTERVAL_MINUTES,
    });
  }
}

async function setAutoEnabled(enabled) {
  const activeJob = await loadJob();
  if (!enabled && activeJob?.auto) {
    await discardSyncJob(activeJob);
  }
  const state = await updateAutoState({
    enabled,
    status: enabled ? "idle" : "disabled",
    lastError: "",
    needsLogin: "",
  });
  await ensureAutoAlarm();
  return state;
}

async function startJob(source, returnTabId, options = {}) {
  const activeJob = await loadJob();
  if (activeJob) {
    if (!isJobStale(activeJob)) throw new Error("已有同步任务正在运行");
    await discardSyncJob(activeJob);
  }
  const job = {
    id: crypto.randomUUID(),
    source,
    returnTabId: returnTabId || null,
    auto: options.auto === true,
    chainId: options.chainId || crypto.randomUUID(),
    startedAt: new Date().toISOString(),
  };
  await chrome.storage.session.set({ [JOB_KEY]: job });
  try {
    const tab = await chrome.tabs.create({
      url:
        source === "fortunemusic"
          ? MUSIC_URL
          : MEETS_GROUPS[0].url,
      active: !job.auto,
    });
    const storedJob = { ...job, tabId: tab.id || null };
    await chrome.storage.session.set({ [JOB_KEY]: storedJob });
    await scheduleAutoJobTimeout(storedJob);
    return storedJob;
  } catch (error) {
    await removeStoredJob(job);
    throw error;
  }
}

async function relayToDashboard(job, payload) {
  if (!job?.returnTabId) return;
  try {
    await chrome.tabs.sendMessage(job.returnTabId, payload);
  } catch {}
}

async function reportOfficialProgress(job, title, detail) {
  const dashboardPayload = {
    type: "MIGURI46LOG_EXTENSION_PROGRESS",
    title,
    detail,
  };
  await relayToDashboard(job, dashboardPayload);
  if (job?.tabId) {
    await chrome.tabs
      .sendMessage(job.tabId, {
        type: "MIGURI46LOG_OFFICIAL_PROGRESS",
        title,
        detail,
      })
      .catch(() => {});
  }
}

async function refresh46logSession() {
  const response = await fetch(REFRESH_URL, {
    method: "POST",
    credentials: "include",
  });
  return response.ok;
}

async function writeRecords(records) {
  let imported = 0;
  for (let index = 0; index < records.length; index += 500) {
    const chunk = records.slice(index, index + 500);
    const send = () =>
      fetch(IMPORT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: chunk }),
      });
    let response = await send();
    if (response.status === 401 && (await refresh46logSession())) {
      response = await send();
    }
    if (response.status === 401) {
      throw new Error("请重新登录 46log");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || payload?.error || "D1 保存失败");
    }
    imported += Number(payload.data?.imported ?? chunk.length);
  }
  return imported;
}

async function failAutoJob(job, sender, error, needsLogin = "") {
  await discardSyncJob(job);
  if (sender.tab?.id && sender.tab.id !== job.tabId) {
    await chrome.tabs.remove(sender.tab.id).catch(() => {});
  }
  await chrome.action.setBadgeBackgroundColor({ color: "#d95b91" });
  await chrome.action.setBadgeText({ text: "!" });
  await chrome.action.setTitle({
    title: needsLogin
      ? `46log 咪咕力同步：请重新登录 ${needsLogin}`
      : `46log 咪咕力同步：${error}`,
  });
  await updateAutoState({
    status: needsLogin ? "needs-login" : "error",
    lastError: error,
    needsLogin,
  });
}

async function finishAutoSource(job, records, sender) {
  const imported = await writeRecords(records);
  await discardSyncJob(job);
  if (sender.tab?.id && sender.tab.id !== job.tabId) {
    await chrome.tabs.remove(sender.tab.id).catch(() => {});
  }
  if (job.source === "fortunemusic") {
    await updateAutoState({
      status: "syncing",
      lastError: "",
      needsLogin: "",
      imported,
    });
    await startJob("fortunemeets", null, {
      auto: true,
      chainId: job.chainId,
    });
    return;
  }
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "46log 咪咕力同步" });
  await updateAutoState({
    status: "success",
    lastSuccessAt: new Date().toISOString(),
    lastError: "",
    needsLogin: "",
    imported: (await loadAutoState()).imported + imported,
  });
}

async function startAutoCycle() {
  const state = await loadAutoState();
  if (!state.enabled) return false;
  const activeJob = await loadJob();
  if (activeJob) {
    if (!isJobStale(activeJob)) return false;
    await discardSyncJob(activeJob);
  }
  await updateAutoState({
    status: "syncing",
    lastAttemptAt: new Date().toISOString(),
    lastError: "",
    needsLogin: "",
    imported: 0,
  });
  try {
    await startJob("fortunemusic", null, { auto: true });
    return true;
  } catch (error) {
    await updateAutoState({
      status: "error",
      lastError: error?.message || "自动同步启动失败",
      needsLogin: "",
    });
    throw error;
  }
}

async function restartTimedOutAutoJob() {
  const job = await loadJob();
  if (!job?.auto) return;
  if (!isJobStale(job)) {
    await scheduleAutoJobTimeout(job);
    return;
  }
  await discardSyncJob(job);
  await chrome.action.setBadgeBackgroundColor({ color: "#d95b91" });
  await chrome.action.setBadgeText({ text: "!" });
  await chrome.action.setTitle({
    title: "46log 咪咕力同步：上次任务超时，正在自动重试",
  });
  await updateAutoState({
    status: "error",
    lastError: "上次自动同步超过 10 分钟，已清理并重试",
    needsLogin: "",
  });
  await startAutoCycle();
}

chrome.runtime.onInstalled.addListener(async () => {
  await removeStoredJob();
  await loadAutoState().then((state) =>
    chrome.storage.local.set({ [AUTO_STATE_KEY]: state }),
  );
  await ensureAutoAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAutoAlarm().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_ALARM) startAutoCycle().catch(() => {});
  if (alarm.name === AUTO_JOB_TIMEOUT_ALARM) {
    restartTimedOutAutoJob().catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  loadJob()
    .then(async (job) => {
      if (!job || job.tabId !== tabId) return;
      await removeStoredJob(job);
      if (job.auto) {
        await updateAutoState({
          status: "error",
          lastError: "自动同步页面被关闭，请点击“立即检查”重试",
          needsLogin: "",
        });
      }
    })
    .catch(() => {});
});

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
      .then((job) => {
        const senderTabId = sender.tab?.id || null;
        sendResponse({
          job:
            job && senderTabId && job.tabId === senderTabId ? job : null,
        });
      })
      .catch(() => sendResponse({ job: null }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_GET_AUTO_STATE") {
    loadAutoState()
      .then((state) => sendResponse({ state }))
      .catch(() => sendResponse({ state: defaultAutoState() }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_SET_AUTO_ENABLED") {
    setAutoEnabled(message.enabled === true)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_RUN_AUTO") {
    startAutoCycle()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_MEETS_API_SYNC") {
    loadJob()
      .then(async (job) => {
        if (
          !job
          || job.source !== "fortunemeets"
          || job.id !== message.jobId
          || (job.tabId && job.tabId !== sender.tab?.id)
        ) {
          sendResponse({ ok: false, error: "同步任务已过期" });
          return;
        }
        try {
          const result = await globalThis.MiguriMeetsApi.sync({
            userId: message.userId,
            campaignsByGroup: message.campaignsByGroup,
            onProgress: (title, detail) =>
              reportOfficialProgress(job, title, detail),
          });
          sendResponse({ ok: true, ...result });
        } catch (error) {
          sendResponse({
            ok: false,
            error: error?.message || "官方履历读取失败",
            code: error?.code || "",
          });
        }
      })
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error?.message || "官方履历读取失败",
          code: error?.code || "",
        }),
      );
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

  if (message?.type === "MIGURI46LOG_LOGIN_REQUIRED") {
    loadJob()
      .then(async (job) => {
        if (
          !job
          || job.id !== message.jobId
          || (job.tabId && job.tabId !== sender.tab?.id)
        ) return;
        if (job.auto) {
          await failAutoJob(
            job,
            sender,
            `请重新登录 ${job.source === "fortunemusic" ? "forTUNE music" : "forTUNE meets"}`,
            job.source === "fortunemusic" ? "forTUNE music" : "forTUNE meets",
          );
        }
      })
      .finally(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_JOB_ERROR") {
    loadJob()
      .then(async (job) => {
        if (
          !job
          || job.id !== message.jobId
          || (job.tabId && job.tabId !== sender.tab?.id)
        ) return;
        const error = message.error || "官方履历读取失败";
        if (job.auto) {
          await failAutoJob(
            job,
            sender,
            error,
          );
          return;
        }
        await removeStoredJob(job);
        await relayToDashboard(job, {
          type: "MIGURI46LOG_EXTENSION_PROGRESS",
          title: "同步暂时停止",
          detail: error,
        });
      })
      .finally(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_RESULT") {
    loadJob()
      .then(async (job) => {
        if (
          !job
          || job.id !== message.jobId
          || (job.tabId && job.tabId !== sender.tab?.id)
        ) {
          sendResponse({ ok: false, error: "同步任务已过期" });
          return;
        }
        const records = Array.isArray(message.records) ? message.records : [];
        if (job.auto) {
          try {
            await finishAutoSource(job, records, sender);
            sendResponse({ ok: true });
          } catch (error) {
            await failAutoJob(
              job,
              sender,
              error instanceof Error ? error.message : "自动同步失败",
              /46log/.test(error?.message || "") ? "46log" : "",
            );
            sendResponse({ ok: false, error: error.message });
          }
          return;
        }
        const result = {
          version: 1,
          source: job.source,
          next: job.source === "fortunemusic" ? "meets" : "done",
          records,
          completedAt: new Date().toISOString(),
        };
        await chrome.storage.session.set({ [RESULT_KEY]: result });
        await removeStoredJob(job);
        await setAutoEnabled(true);
        if (job.returnTabId) {
          await chrome.tabs.update(job.returnTabId, {
            active: true,
            url: `${DASHBOARD_URL}?extensionImport=1`,
          });
        } else {
          await chrome.tabs.create({
            active: true,
            url: `${DASHBOARD_URL}?extensionImport=1`,
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
      .then((stored) => {
        sendResponse({ result: stored[RESULT_KEY] || null });
      })
      .catch(() => sendResponse({ result: null }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_ACK_RESULT") {
    chrome.storage.session
      .get(RESULT_KEY)
      .then(async (stored) => {
        const result = stored[RESULT_KEY] || null;
        if (
          result
          && (!message.completedAt || result.completedAt === message.completedAt)
        ) {
          await chrome.storage.session.remove(RESULT_KEY);
        }
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: `${DASHBOARD_URL}*` });
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId)
      await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: DASHBOARD_URL, active: true });
  }
});

ensureAutoAlarm().catch(() => {});
