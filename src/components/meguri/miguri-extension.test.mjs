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
const bridgeSource = readFileSync(
  new URL(
    "../../../browser-extension/miguri-sync/bridge.js",
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
const prototypeSource = readFileSync(
  new URL("./MeguriPrototype.tsx", import.meta.url),
  "utf8",
);
const supportSource = readFileSync(
  new URL("../../pages/miguri-support.astro", import.meta.url),
  "utf8",
);

test("both-site extension requests only Music access and keeps private results pending", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "tabs", "alarms"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://46log.com/*", "https://saka46log.com/*"]);
  assert.deepEqual(manifest.content_scripts[1].matches, ["https://fortunemusic.jp/*"]);
  assert.equal(manifest.host_permissions.some(host => host.includes("fortunemeets")), false);
  assert.doesNotMatch(backgroundSource, /importScripts\("meets-api/);
  assert.match(backgroundSource, /source !== "fortunemusic"/);
  assert.match(backgroundSource, /MIGURI46LOG_RESULT/);
  assert.match(backgroundSource, /MIGURI46LOG_ACK_RESULT/);
  assert.match(backgroundSource, /autoContinue: false/);
  assert.doesNotMatch(backgroundSource, /startJob\("fortunemeets"/);
  assert.match(bridgeSource, /message\.type === "TAKE_RESULT"/);
  assert.match(bridgeSource, /message\.type === "ACK_RESULT"/);
  assert.match(prototypeSource, /acknowledgeMiguriExtensionResult\(handoff\.completedAt\)/);
  assert.match(officialSource, /MUSIC_UNIT_PRICE_YEN = 1_200/);
  assert.doesNotMatch(officialSource, /lscache-accessToken|requestMeetsApiSync/);
  assert.doesNotMatch(officialSource, /document\.cookie|input\[type=["']password["']\][\s\S]{0,100}\.value/);
});

test("extension worker retains a pending result until D1 import acknowledgement", () => {
  const takeStart = backgroundSource.indexOf(
    'message?.type === "MIGURI46LOG_TAKE_RESULT"',
  );
  const acknowledgeStart = backgroundSource.indexOf(
    'message?.type === "MIGURI46LOG_ACK_RESULT"',
  );
  assert.ok(takeStart > 0);
  assert.ok(acknowledgeStart > takeStart);
  assert.match(backgroundSource.slice(takeStart, acknowledgeStart), /canReadResult\(result, sender\)/);
  // Only explicit same-tab discard may remove an unacknowledged Saka result.
  assert.match(backgroundSource.slice(takeStart, acknowledgeStart), /MIGURI46LOG_DISCARD_RESULT/);
  assert.match(
    backgroundSource.slice(acknowledgeStart),
    /session\.remove\(RESULT_KEY\)/,
  );
});

test("Dashboard bridge waits for the importer before taking a pending result", async () => {
  const pageListeners = [];
  const posted = [];
  const sent = [];
  const runtimeListeners = [];
  const window = {
    location: { origin: "https://46log.com" },
    addEventListener(type, listener) {
      if (type === "message") pageListeners.push(listener);
    },
    postMessage(message) {
      posted.push(message);
    },
  };
  const context = {
    chrome: {
      runtime: {
        getManifest: () => ({ version: "1.1.12" }),
        onMessage: {
          addListener(listener) {
            runtimeListeners.push(listener);
          },
        },
        async sendMessage(message) {
          sent.push(message);
          if (message.type === "MIGURI46LOG_TAKE_RESULT") {
            return {
              result: {
                version: 1,
                source: "fortunemusic",
                next: "done",
                records: [{ sourceKey: "record-1" }],
                completedAt: "2026-07-29T00:00:00.000Z",
              },
            };
          }
          return { state: null, ok: true };
        },
      },
    },
    console,
    window,
  };
  vm.runInNewContext(bridgeSource, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    sent.some((message) => message.type === "MIGURI46LOG_TAKE_RESULT"),
    false,
  );

  pageListeners[0]({
    source: window,
    origin: window.location.origin,
    data: { source: "46log-miguri-page", type: "TAKE_RESULT" },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    sent.some((message) => message.type === "MIGURI46LOG_TAKE_RESULT"),
    true,
  );
  assert.equal(
    posted.some((message) => message.type === "RESULT"),
    true,
  );

  pageListeners[0]({
    source: window,
    origin: window.location.origin,
    data: {
      source: "46log-miguri-page",
      type: "ACK_RESULT",
      completedAt: "2026-07-29T00:00:00.000Z",
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    sent.some((message) => message.type === "MIGURI46LOG_ACK_RESULT"),
    true,
  );
  assert.equal(runtimeListeners.length, 1);
});

test("Dashboard offers Music-only sync while keeping historical Meets analytics", () => {
  assert.match(dashboardSource, /仅同步 Music/);
  assert.doesNotMatch(dashboardSource, /仅同步 Meets|一键同步 Music \+ Meets/);
  assert.match(dashboardSource, /浏览器运行时自动同步/);
  assert.match(dashboardSource, /MEETS_DISCOUNT_STORAGE_KEY/);
  assert.match(dashboardSource, /Meets 支付合计/);
  assert.match(dashboardSource, /disabled=\{needsUpdate\}/);
  assert.doesNotMatch(dashboardSource, /downloads\/46log-miguri-sync-music-only-v1\.1\.18/);
  assert.match(supportSource, /Meets 不在本版同步范围/);
  assert.match(supportSource, /未上架/);
});

test("automatic Music-only sync saves once and rejects stale Meets jobs", async () => {
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
    crypto, URL,
    importScripts() {},
    fetch: async (url, options = {}) => {
      if (`${url}`.includes("/entries/import")) {
        importedRequests += 1;
        const imported = JSON.parse(options.body || '{"records":[]}').records
          .length;
        return {
          ok: true,
          status: 200,
          async json() {
            return { success: true, data: { imported } };
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
        async get(id) { return { id, url: 'https://46log.com/miguri' }; },
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
        async update(id, options) {
          return { id, ...options };
        },
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
  const send = (message, sender = {url:'https://46log.com/miguri',frameId:0,tab:{id:700}}) =>
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
  assert.ok(Number.isFinite(alarms.get("miguriAutoSyncJobTimeout").when));
  const musicJob = session.miguriSyncJob;
  assert.equal(musicJob.auto, true);
  assert.equal(
    (await send(
      { type: "MIGURI46LOG_GET_JOB" },
      { tab: { id: musicJob.tabId } },
    )).job.id,
    musicJob.id,
  );
  assert.equal(
    (await send(
      { type: "MIGURI46LOG_GET_JOB" },
      { tab: { id: 999 } },
    )).job,
    null,
  );
  assert.equal(musicJob.source, "fortunemusic");

  const musicResult = await send(
    {
      type: "MIGURI46LOG_RESULT",
      jobId: musicJob.id,
      records: [{ sourceKey: "music-1" }],
    },
    {url:'https://fortunemusic.jp/mypage/apply_list/',frameId:0,tab:{id:musicJob.tabId}},
  );
  assert.equal(musicResult.ok, true);
  assert.equal(importedRequests, 1);
  assert.equal(session.miguriSyncJob, undefined);
  assert.equal(createdTabs.length, 1);
  assert.deepEqual(removedTabs, [musicJob.tabId]);
  assert.equal(local.miguriAutoSyncState.status, "success");
  assert.equal(local.miguriAutoSyncState.imported, 1);

  session.miguriSyncJob = {
    id: "stale-meets-job",
    source: "fortunemeets",
    auto: true,
    tabId: 99,
    startedAt: "2020-01-01T00:00:00.000Z",
  };
  assert.equal((await send({ type: "MIGURI46LOG_RUN_AUTO" })).ok, true);
  assert.ok(removedTabs.includes(99));
  assert.equal(session.miguriSyncJob.source, "fortunemusic");
  assert.equal(createdTabs[1].active, false);

  // Finish the restarted automatic cycle before exercising first-time manual sync.
  const restartedMusicJob = session.miguriSyncJob;
  await send(
    {
      type: "MIGURI46LOG_RESULT",
      jobId: restartedMusicJob.id,
      records: [],
    },
    {url:'https://fortunemusic.jp/mypage/apply_list/',frameId:0,tab:{id:restartedMusicJob.tabId}},
  );
  assert.equal(session.miguriSyncJob, undefined);

  const manualStart = await send(
    { type: "MIGURI46LOG_START", source: "fortunemusic" },
    {url:'https://46log.com/miguri',frameId:0,tab:{id:700}},
  );
  assert.equal(manualStart.ok, true);
  const manualMusicJob = session.miguriSyncJob;
  assert.equal(manualMusicJob.auto, false);
  assert.equal(createdTabs.at(-1).active, true);

  const manualMusicResult = await send(
    {
      type: "MIGURI46LOG_RESULT",
      jobId: manualMusicJob.id,
      records: [],
    },
    {url:'https://fortunemusic.jp/mypage/apply_list/',frameId:0,tab:{id:manualMusicJob.tabId}},
  );
  assert.equal(manualMusicResult.ok, true);
  assert.equal(session.miguriSyncResult.autoContinue, false);
  assert.equal(session.miguriSyncResult.records.length, 0);
  assert.equal(session.miguriSyncJob, undefined);

  // An automatic alarm must not race the pending Dashboard D1 write.
  assert.equal((await send({ type: "MIGURI46LOG_RUN_AUTO" })).ok, true);
  assert.equal(session.miguriSyncJob, undefined);

  const acknowledgement = await send(
    {
      type: "MIGURI46LOG_ACK_RESULT",
      completedAt: session.miguriSyncResult.completedAt,
    },
    {url:'https://46log.com/miguri',frameId:0,tab:{id:700}},
  );
  assert.equal(acknowledgement.ok, true);
  assert.equal(acknowledgement.continued, false);
  assert.equal(session.miguriSyncResult, undefined);
  assert.equal(session.miguriSyncJob, undefined);
  assert.equal(createdTabs.at(-1).url.includes('fortunemusic.jp'), true);
});
