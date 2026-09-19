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
const SAKA_DASHBOARD_URL = "https://saka46log.com/import";
function dashboardTarget(sender) {
  if (sender.frameId !== undefined && sender.frameId !== 0) return null;
  try {
    const url = new URL(sender.url || "");
    if (url.origin === "https://46log.com" && /^\/miguri(?:\/|$)/.test(url.pathname)) return "46log";
    if (url.origin === "https://saka46log.com" && /^\/import\/?$/.test(url.pathname)) return "saka46log";
  } catch {}
  return null;
}
function canReadResult(result, sender) {
  const target = dashboardTarget(sender);
  return !!target && (result?.target || "46log") === target &&
    (target !== "saka46log" || (result.returnTabId === sender.tab?.id && Date.now() - Date.parse(result.completedAt) >= 0 && Date.now() - Date.parse(result.completedAt) <= 30 * 60 * 1000));
}

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

async function loadPendingResult() {
  const stored = await chrome.storage.session.get(RESULT_KEY);
  const result = stored[RESULT_KEY] || null;
  if (result?.target === "saka46log" && Date.now() - Date.parse(result.completedAt) > 30 * 60 * 1000) {
    await chrome.storage.session.remove(RESULT_KEY);
    return null;
  }
  return result;
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
  if (!job) return;
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
  if (await loadPendingResult()) {
    throw new Error("上一项履历正在保存，请稍候");
  }
  const activeJob = await loadJob();
  if (activeJob) {
    if (!isJobStale(activeJob)) throw new Error("已有同步任务正在运行");
    await discardSyncJob(activeJob);
  }
  const job = {
    id: crypto.randomUUID(),
    source,
    target: options.target === "saka46log" ? "saka46log" : "46log",
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
    const tab = await chrome.tabs.get(job.returnTabId);
    if (dashboardTarget({ url: tab.url, frameId: 0 }) !== (job.target || "46log")) return;
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
  // A manual source result remains in session storage until the Dashboard has
  // committed it to D1. Do not let an alarm race with that acknowledgement.
  if (await loadPendingResult()) return false;
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
  if (!job) return;
  if (!isJobStale(job)) {
    await scheduleAutoJobTimeout(job);
    return;
  }
  // Manual jobs time out too: tell the waiting page instead of leaving it on 読み込み中 forever.
  if (!job.auto) {
    await relayToDashboard(job, {
      type: "MIGURI46LOG_EXTENSION_ERROR",
      message: "読み込みが10分を超えました。公式サイトのタブを確認して、もう一度お試しください。",
    });
    await discardSyncJob(job);
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

chrome.tabs.onRemoved.addListener((tabId) => {
  loadJob()
    .then(async (job) => {
      if (!job || job.tabId !== tabId) return;
      if (!job.auto) {
        await relayToDashboard(job, {
          type: "MIGURI46LOG_EXTENSION_ERROR",
          message: "公式サイトのタブが閉じられました。もう一度読み込んでください。",
        });
      }
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
  const dashboardMessages = new Set(["MIGURI46LOG_START", "MIGURI46LOG_TAKE_RESULT", "MIGURI46LOG_ACK_RESULT", "MIGURI46LOG_DISCARD_RESULT", "MIGURI46LOG_GET_AUTO_STATE", "MIGURI46LOG_SET_AUTO_ENABLED", "MIGURI46LOG_RUN_AUTO"]);
  const target = dashboardTarget(sender);
  if (dashboardMessages.has(message?.type) && !target) { sendResponse({ ok: false, error: "送信元を確認できません。" }); return; }
  if (target === "saka46log" && ["MIGURI46LOG_GET_AUTO_STATE", "MIGURI46LOG_SET_AUTO_ENABLED", "MIGURI46LOG_RUN_AUTO"].includes(message?.type)) { sendResponse({ ok: false, error: "坂ログへの自動送信は無効です。" }); return; }
  if (message?.type === "MIGURI46LOG_START") {
    if (target === "saka46log" && message.source !== "fortunemusic") { sendResponse({ ok: false, error: "坂ログでは個別ミーグリのMusic履歴のみ対応しています。" }); return; }
    const source =
      message.source === "fortunemeets" ? "fortunemeets" : "fortunemusic";
    startJob(source, sender.tab?.id, { target })
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
          || sender.frameId !== 0
          || !/^https:\/\/ticket\.fortunemeets\.app\//.test(sender.url || "")
          || job.id !== message.jobId
          || (job.tabId && job.tabId !== sender.tab?.id)
        ) {
          sendResponse({ ok: false, error: "同步任务已过期" });
          return;
        }
        try {
          const result = await globalThis.MiguriMeetsApi.sync({
            userId: message.userId,
            authMode: message.authMode,
            accessToken: message.accessToken,
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
    loadJob().then((job) => {
      if (!job || job.tabId !== sender.tab?.id) return;
      return relayToDashboard(job, {
        type: "MIGURI46LOG_EXTENSION_PROGRESS",
        title: job.target === "saka46log" ? "履歴を読み込んでいます" : (message.title || "同步中"),
        detail: job.target === "saka46log" ? "公式サイトの画面で進行状況を確認してください。" : (message.detail || ""),
      });
    });
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
        const isSaka = job.target === "saka46log";
        const result = {
          version: isSaka ? 2 : 1,
          target: job.target || "46log",
          returnTabId: job.returnTabId,
          source: job.source,
          next: !isSaka && job.source === "fortunemusic" ? "meets" : "done",
          autoContinue: !isSaka && job.source === "fortunemusic",
          records: isSaka ? records.filter(r => r.group === "sakurazaka").map(r => ({
            key: r.sourceKey, member: r.member, date: r.date, slot: r.slot,
            round: r.applicationRound, applied: r.lotteryApplied ?? null, won: r.lotteryWon ?? null,
            pending: r.resultStatus === "pending", reviewRequired: r.lotteryReviewRequired === true,
            title: r.title,
          })) : records,
          completedAt: new Date().toISOString(),
        };
        await chrome.storage.session.set({ [RESULT_KEY]: result });
        await removeStoredJob(job);
        const destination = isSaka ? SAKA_DASHBOARD_URL : DASHBOARD_URL;
        if (job.returnTabId) {
          const tab = await chrome.tabs.get(job.returnTabId).catch(() => null);
          if (isSaka && (!tab || dashboardTarget({url:tab.url,frameId:0}) !== "saka46log")) {
            await chrome.storage.session.remove(RESULT_KEY);
            sendResponse({ ok: false, error: "坂ログの読み込み画面が閉じられました。履歴は送信せず破棄しました。" });
            return;
          }
          await chrome.tabs.update(job.returnTabId, {
            active: true,
            url: `${destination}?extensionImport=1`,
          });
        } else {
          await chrome.tabs.create({
            active: true,
            url: `${destination}?extensionImport=1`,
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
        const result = stored[RESULT_KEY] || null;
        sendResponse({ result: result && canReadResult(result, sender) ? result : null });
      })
      .catch(() => sendResponse({ result: null }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_DISCARD_RESULT") {
    loadPendingResult().then(async result => {
      if (result?.target === "saka46log" && canReadResult(result, sender)) await chrome.storage.session.remove(RESULT_KEY);
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "MIGURI46LOG_ACK_RESULT") {
    chrome.storage.session
      .get(RESULT_KEY)
      .then(async (stored) => {
        const result = stored[RESULT_KEY] || null;
        if (
          !result
          || !canReadResult(result, sender)
          || (result.target === "saka46log" && message.completedAt !== result.completedAt)
          || (message.completedAt && result.completedAt !== message.completedAt)
        ) {
          sendResponse({ ok: true, continued: false });
          return;
        }

        // Acknowledge only after the Dashboard has persisted the result. Music
        // then continues directly into Meets, so first-time users cannot stop
        // after writing only half of their history to D1.
        await chrome.storage.session.remove(RESULT_KEY);
        if (result.target === "saka46log") { sendResponse({ ok: true, continued: false }); return; }
        if (result.autoContinue && result.next === "meets") {
          const returnTabId = sender.tab?.id || null;
          await relayToDashboard(
            { returnTabId },
            {
              type: "MIGURI46LOG_EXTENSION_PROGRESS",
              title: "Music 已保存",
              detail: "正在自动继续同步 Meets（三坂）…",
            },
          );
          await startJob("fortunemeets", returnTabId);
          sendResponse({ ok: true, continued: true });
          return;
        }

        await setAutoEnabled(true);
        sendResponse({ ok: true, continued: false });
      })
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "无法继续同步",
        }),
      );
    return true;
  }
});

chrome.action.onClicked.addListener(async (activeTab) => {
  // Same routing in both language editions: follow the user's current site,
  // not the package title. Keep the established 46log default elsewhere.
  let destination = DASHBOARD_URL;
  try {
    if (new URL(activeTab?.url || "").origin === new URL(SAKA_DASHBOARD_URL).origin) destination = SAKA_DASHBOARD_URL;
  } catch {}
  const target = destination === SAKA_DASHBOARD_URL ? "saka46log" : "46log";
  const tabs = await chrome.tabs.query({ url: `${destination}*` });
  const existing = tabs.find(tab => dashboardTarget({ url: tab.url, frameId: 0 }) === target);
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    // Never replace an active editor/results document with a forced reload.
    await chrome.tabs.create({ url: destination, active: true });
  }
});

ensureAutoAlarm().catch(() => {});
