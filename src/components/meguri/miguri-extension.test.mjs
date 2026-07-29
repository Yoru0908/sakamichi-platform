import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const manifest = JSON.parse(
  readFileSync(
    new URL(
      "../../../browser-extension/miguri-sync/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const backgroundSource = readFileSync(
  new URL(
    "../../../browser-extension/miguri-sync/background.js",
    import.meta.url,
  ),
  "utf8",
);
const officialSource = readFileSync(
  new URL(
    "../../../browser-extension/miguri-sync/official.js",
    import.meta.url,
  ),
  "utf8",
);
const dashboardSource = readFileSync(
  new URL("./MiguriDashboard.tsx", import.meta.url),
  "utf8",
);

test("Miguri extension has only scoped sync, storage, tab, and alarm permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "tabs", "alarms"]);
  assert.equal(manifest.permissions.includes("cookies"), false);
  assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
  assert.ok(
    manifest.host_permissions.every(
      (origin) =>
        origin.includes("46log.com") ||
        origin.includes("fortunemusic.jp") ||
        origin.includes("fortunemeets.app"),
    ),
  );
});

test("Miguri extension keeps the official login job separate from normalized result delivery", () => {
  assert.match(backgroundSource, /chrome\.storage\.session/);
  assert.match(backgroundSource, /chrome\.storage\.local/);
  assert.match(backgroundSource, /chrome\.alarms/);
  assert.match(backgroundSource, /AUTO_INTERVAL_MINUTES = 30/);
  assert.match(backgroundSource, /MIGURI46LOG_RESULT/);
  assert.match(backgroundSource, /api\/miguri\/entries\/import/);
  assert.match(officialSource, /sourceKey/);
  assert.match(officialSource, /unitPriceYen/);
  assert.match(officialSource, /spendYen/);
  assert.match(officialSource, /Math\.min\(\.\.\.explicitPrices\)/);
  assert.doesNotMatch(
    officialSource,
    /input\[type=["']password["']\][\s\S]{0,80}\.value/,
  );
  assert.doesNotMatch(officialSource, /document\.cookie/);
});

test("Dashboard presents extension sync and removes legacy compatibility import", () => {
  assert.match(dashboardSource, /Chrome Web Store · 审核中/);
  assert.match(dashboardSource, /下载 ZIP 临时安装/);
  assert.match(dashboardSource, /downloads\/46log-miguri-sync\.zip/);
  assert.match(dashboardSource, /加载已解压扩展/);
  assert.doesNotMatch(dashboardSource, /Chrome 商店安装/);
  assert.match(dashboardSource, /同步 forTUNE music/);
  assert.match(dashboardSource, /同步 forTUNE meets/);
  assert.match(dashboardSource, /浏览器运行时自动同步/);
  assert.doesNotMatch(dashboardSource, /兼容导入/);
  assert.doesNotMatch(dashboardSource, /拖动安装旧版书签/);
  assert.doesNotMatch(dashboardSource, /使用粘贴导入/);
  assert.doesNotMatch(dashboardSource, /46log 不接收 forTUNE/);
});

test("automatic sync persists its alarm and imports Music then Meets in inactive tabs", async () => {
  const local = {};
  const session = {};
  const alarms = new Map();
  const createdTabs = [];
  const removedTabs = [];
  const messageListeners = [];
  let importedRequests = 0;
  const storageArea = (values) => ({
    async get(key) {
      return { [key]: values[key] };
    },
    async set(patch) {
      Object.assign(values, patch);
    },
    async remove(key) {
      delete values[key];
    },
  });
  const event = () => ({ addListener() {} });
  const context = {
    crypto,
    fetch: async (url) => {
      if (`${url}`.includes("/entries/import")) {
        importedRequests += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return { success: true, data: { imported: 1 } };
          },
        };
      }
      return { ok: true, status: 200 };
    },
    chrome: {
      storage: {
        local: storageArea(local),
        session: storageArea(session),
      },
      alarms: {
        onAlarm: event(),
        async clear(name) {
          alarms.delete(name);
        },
        async get(name) {
          return alarms.get(name) || null;
        },
        async create(name, config) {
          alarms.set(name, config);
        },
      },
      runtime: {
        onInstalled: event(),
        onStartup: event(),
        onMessage: {
          addListener(listener) {
            messageListeners.push(listener);
          },
        },
      },
      tabs: {
        onRemoved: event(),
        async query() {
          return [];
        },
        async sendMessage() {},
        async create(options) {
          createdTabs.push(options);
          return { id: createdTabs.length };
        },
        async remove(id) {
          removedTabs.push(id);
        },
        async update() {},
      },
      windows: {
        async update() {},
      },
      action: {
        onClicked: event(),
        async setBadgeBackgroundColor() {},
        async setBadgeText() {},
        async setTitle() {},
      },
    },
  };
  vm.runInNewContext(backgroundSource, context);
  await new Promise((resolve) => setImmediate(resolve));
  const send = (message, sender = {}) =>
    new Promise((resolve) => {
      const handled = messageListeners[0](message, sender, resolve);
      if (handled !== true) resolve(null);
    });

  const enabled = await send({
    type: "MIGURI46LOG_SET_AUTO_ENABLED",
    enabled: true,
  });
  assert.equal(enabled.ok, true);
  assert.equal(local.miguriAutoSyncState.enabled, true);
  assert.equal(alarms.get("miguriAutoSync").periodInMinutes, 30);

  assert.equal((await send({ type: "MIGURI46LOG_RUN_AUTO" })).ok, true);
  assert.equal(createdTabs[0].active, false);
  assert.match(createdTabs[0].url, /fortunemusic\.jp/);
  const musicJob = session.miguriSyncJob;
  assert.equal(musicJob.auto, true);
  assert.equal(musicJob.source, "fortunemusic");

  const musicResult = await send(
    {
      type: "MIGURI46LOG_RESULT",
      jobId: musicJob.id,
      records: [{ sourceKey: "music-1" }],
    },
    { tab: { id: musicJob.tabId } },
  );
  assert.equal(musicResult.ok, true);
  assert.equal(importedRequests, 1);
  assert.equal(session.miguriSyncJob.source, "fortunemeets");
  assert.equal(createdTabs[1].active, false);

  const meetsJob = session.miguriSyncJob;
  const meetsResult = await send(
    {
      type: "MIGURI46LOG_RESULT",
      jobId: meetsJob.id,
      records: [],
    },
    { tab: { id: meetsJob.tabId } },
  );
  assert.equal(meetsResult.ok, true);
  assert.deepEqual(removedTabs, [musicJob.tabId, meetsJob.tabId]);
  assert.equal(local.miguriAutoSyncState.status, "success");
  assert.equal(local.miguriAutoSyncState.imported, 1);
});
