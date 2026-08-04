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
const meetsApiSource = readFileSync(
  new URL(
    "../../../browser-extension/miguri-sync/meets-api.js",
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
  assert.match(
    backgroundSource,
    /ticket\.fortunemeets\.app\/nogizaka46/,
  );
  assert.match(
    backgroundSource,
    /ticket\.fortunemeets\.app\/sakurazaka46/,
  );
  assert.match(
    backgroundSource,
    /ticket\.fortunemeets\.app\/hinatazaka46/,
  );
  assert.match(backgroundSource, /importScripts\("meets-api\.js"\)/);
  assert.match(backgroundSource, /MIGURI46LOG_MEETS_API_SYNC/);
  assert.match(officialSource, /requestMeetsApiSync/);
  assert.match(officialSource, /history\.replaceState/);
  assert.match(officialSource, /campaignsByGroup/);
  assert.match(backgroundSource, /campaignsByGroup: message\.campaignsByGroup/);
  assert.match(meetsApiSource, /ticket-api\.fortunemeets\.app\/user\/history2/);
  assert.match(meetsApiSource, /temporaryLanding/);
  assert.match(backgroundSource, /MIGURI46LOG_RESULT/);
  assert.match(backgroundSource, /MIGURI46LOG_ACK_RESULT/);
  assert.match(bridgeSource, /message\.type === "TAKE_RESULT"/);
  assert.match(bridgeSource, /message\.type === "ACK_RESULT"/);
  assert.match(prototypeSource, /requestMiguriExtensionResult\(\)/);
  assert.match(
    prototypeSource,
    /acknowledgeMiguriExtensionResult\(handoff\.completedAt\)/,
  );
  assert.match(backgroundSource, /api\/miguri\/entries\/import/);
  assert.match(officialSource, /sourceKey/);
  assert.match(officialSource, /unitPriceYen/);
  assert.match(officialSource, /spendYen/);
  assert.match(officialSource, /MUSIC_UNIT_PRICE_YEN = 1_200/);
  assert.doesNotMatch(officialSource, /yen\(cells\[1\]/);
  assert.match(meetsApiSource, /Math\.min\(\.\.\.prices\)/);
  assert.doesNotMatch(
    officialSource,
    /input\[type=["']password["']\][\s\S]{0,80}\.value/,
  );
  assert.doesNotMatch(officialSource, /document\.cookie/);
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
  assert.doesNotMatch(
    backgroundSource.slice(takeStart, acknowledgeStart),
    /session\.remove\(RESULT_KEY\)/,
  );
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
                source: "fortunemeets",
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

test("manual Meets sync runs through the extension worker instead of campaign iframes", () => {
  assert.doesNotMatch(officialSource, /document\.hidden/);
  assert.match(officialSource, /MIGURI46LOG_MEETS_API_SYNC/);
  assert.doesNotMatch(officialSource, /createElement\("iframe"\)/);
  assert.doesNotMatch(officialSource, /campaignSlugs|loadCampaignHistory/);
  assert.doesNotMatch(meetsApiSource, /createElement\("iframe"\)/);
  assert.match(meetsApiSource, /controller\.abort\(\)/);
  assert.match(meetsApiSource, /randomDelay\(500, 350\)/);
  assert.match(meetsApiSource, /assignPaidTickets/);
  assert.match(meetsApiSource, /paidUsedSerialRows\(history, config\)/);
  assert.match(meetsApiSource, /rescueSerialNames\(config\)/);
  assert.match(meetsApiSource, /JSON\.stringify\(row\)/);
  assert.match(meetsApiSource, /recordForSerialInfo/);
  assert.match(meetsApiSource, /usedDuringRescuePeriod/);
  assert.match(backgroundSource, /JOB_TIMEOUT_MS = 10 \* 60 \* 1000/);
});

test("Meets API results normalize winning and losing counts without rendering the SPA", () => {
  const context = {
    AbortController,
    clearTimeout,
    console,
    setTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(meetsApiSource, context);
  const records = context.MiguriMeetsApi.normalizeCampaign({
    config: {
      eventId: "nogizaka46_test",
      eventName: "乃木坂46 テスト",
      applications: [
        {
          awards: [
            {
              name: "オンラインミート＆グリート",
              entryHtml: { title: "オンラインミート＆グリート" },
              serialCount: 1,
              applyTable: [
                {
                  id: "meetgreet_2",
                  date: "2026年9月6日(日)",
                  part: "第２部",
                },
              ],
            },
          ],
        },
      ],
    },
    history: {
      results: [
        {
          prizeId: "meetgreet_2",
          result: "当選",
          resultInfo: { win: "2", lose: "1" },
          prizeInfo: { members: ["井上 和"] },
        },
      ],
      used: [{ serialId: "a" }, { serialId: "b" }, { serialId: "c" }],
      unused: [],
    },
    campaignSlug: "test",
    groupSlug: "nogizaka46",
    group: "nogizaka",
    sourceSyncedAt: "2026-07-29T00:00:00.000Z",
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].member, "井上和");
  assert.equal(records[0].date, "2026-09-06");
  assert.equal(records[0].slot, 2);
  assert.equal(records[0].category, "全国ミーグリ");
  assert.equal(records[0].appliedTickets, 3);
  assert.equal(records[0].wonTickets, 2);
  assert.equal(records[0].paidTickets, 3);
  assert.equal(records[0].signLots, 3);
  assert.equal(records[0].spendYen, 6_000);
  assert.equal(records[0].resultStatus, "won");
});

test("Meets API keeps actual CD counts for won and lost sign-event lots", () => {
  const context = {
    AbortController,
    clearTimeout,
    console,
    setTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(meetsApiSource, context);
  const config = {
    eventId: "sakurazaka46_15th",
    eventName:
      "櫻坂46 15th Single Lonesome rabbit / What's KAZOKU 発売記念",
    applications: [
      {
        awards: [
          {
            name: "リアルサイン会",
            entryHtml: { title: "リアルサイン会" },
            serialCount: 3,
            applyTable: [
              {
                id: "sign_1",
                date: "2026年8月2日(日)",
                part: "",
              },
            ],
          },
        ],
      },
    ],
  };
  const normalize = (history) =>
    context.MiguriMeetsApi.normalizeCampaign({
      config,
      history,
      campaignSlug: "15th",
      groupSlug: "sakurazaka46",
      group: "sakurazaka",
      sourceSyncedAt: "2026-07-29T00:00:00.000Z",
    })[0];
  const serials = (count) =>
    Array.from({ length: count }, (_, index) => ({ serialId: `s-${index}` }));

  const mixed = normalize({
    results: [
      {
        prizeId: "sign_1",
        result: "当選",
        resultInfo: { win: "99", lose: "6" },
        prizeInfo: { members: ["村山 美羽"] },
      },
    ],
    used: serials(105),
    unused: [],
  });
  assert.equal(mixed.category, "サイン会");
  assert.equal(mixed.appliedTickets, 105);
  assert.equal(mixed.wonTickets, 99);
  assert.equal(mixed.paidTickets, 105);
  assert.equal(mixed.signLots, 35);

  const lost = normalize({
    results: [
      {
        prizeId: "sign_1",
        result: "落選",
        count: "99",
        prizeInfo: { members: ["村山 美羽"] },
      },
    ],
    used: serials(99),
    unused: [],
  });
  assert.equal(lost.appliedTickets, 99);
  assert.equal(lost.wonTickets, 0);
  assert.equal(lost.paidTickets, 99);
  assert.equal(lost.signLots, 33);
});

test("Meets API maps paid serialInfo and excludes rescue-period serials", () => {
  const context = {
    AbortController,
    clearTimeout,
    console,
    setTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(meetsApiSource, context);
  const records = context.MiguriMeetsApi.normalizeCampaign({
    config: {
      eventId: "sakurazaka46_15th",
      eventName:
        "櫻坂46 15th Single Lonesome rabbit / What's KAZOKU 発売記念",
      applications: [
        {
          awards: [
            {
              entryHtml: { title: "オンラインミート＆グリート" },
              serialCount: 1,
              period: [
                {
                  start: "2026-06-17 10:00",
                  end: "2026-06-18 23:59",
                  isRescue: true,
                  serialName: "１次応募者優先応募シリアル",
                },
              ],
              applyTable: [
                {
                  id: "online_1",
                  date: "2026年8月2日(日)",
                  part: "第1部",
                },
              ],
            },
            {
              entryHtml: { title: "リアルミート＆グリート" },
              serialCount: 1,
              applyTable: [
                {
                  id: "real_1",
                  date: "2026年8月3日(月)＠京都パルスプラザ",
                  part: "第1部",
                },
              ],
            },
            {
              entryHtml: { title: "リアルサイン会" },
              serialCount: 3,
              applyTable: [
                {
                  id: "sign_1",
                  date: "2026年8月4日(火)",
                  part: "",
                },
              ],
            },
          ],
        },
      ],
    },
    history: {
      results: [
        {
          prizeId: "online_1",
          result: "当選",
          resultInfo: { win: "72", lose: "0" },
          prizeInfo: { members: ["山川 宇衣"] },
        },
        {
          prizeId: "real_1",
          result: "当選",
          resultInfo: { win: "72", lose: "54" },
          prizeInfo: { members: ["山川 宇衣"] },
        },
        {
          prizeId: "sign_1",
          result: "当選",
          resultInfo: { win: "3", lose: "96" },
          prizeInfo: { members: ["山川 宇衣"] },
        },
      ],
      used: [
        ...Array.from({ length: 99 }, (_, index) => ({
          serialId: `sign-paid-${index}`,
          type: "応募シリアル",
          appliedAt: "2026-06-17T12:00:00+09:00",
          serialInfo: ["山川 宇衣［8/4（火）］ リアルサイン会"],
        })),
        ...Array.from({ length: 90 }, (_, index) => ({
          serialId: `real-paid-${index}`,
          type: "応募シリアル",
          serialInfo: [
            "山川 宇衣［8/3（月） 第1部］ リアルミート＆グリート",
          ],
        })),
        ...Array.from({ length: 3 }, (_, index) => ({
          serialId: `online-paid-${index}`,
          type: "応募シリアル",
          serialInfo: [
            "山川 宇衣［8/2（日） 第1部］ オンラインミート＆グリート",
          ],
        })),
        ...Array.from({ length: 33 }, (_, index) => ({
          serialId: `rescue-${index}`,
          type: "応募シリアル",
          appliedAt: "2026-06-17T12:00:00+09:00",
          serialInfo: ["山川 宇衣［8/2（日） 第1部］"],
        })),
      ],
      unused: Array.from({ length: 26 }, (_, index) => ({
        serialId: `unused-${index}`,
      })),
    },
    campaignSlug: "15th",
    groupSlug: "sakurazaka46",
    group: "sakurazaka",
    sourceSyncedAt: "2026-07-29T00:00:00.000Z",
  });
  const nationwide = records.find(
    (record) => record.category === "全国ミーグリ",
  );
  const real = records.find((record) => record.category === "リアミ");
  assert.equal(nationwide.appliedTickets, 72);
  assert.equal(nationwide.wonTickets, 72);
  assert.equal(nationwide.paidTickets, 3);
  assert.equal(real.appliedTickets, 126);
  assert.equal(real.wonTickets, 72);
  assert.equal(real.paidTickets, 90);
  const sign = records.find((record) => record.category === "サイン会");
  assert.equal(sign.appliedTickets, 99);
  assert.equal(sign.paidTickets, 99);
  assert.equal(
    records.reduce((sum, record) => sum + record.paidTickets, 0),
    192,
  );
});

test("Meets API discovery reads campaign anchors only", async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(`${url}`);
    if (`${url}`.endsWith("/nogizaka46/")) {
      return new Response(
        '<img src="/nogizaka46/logo.png"><a href="/nogizaka46/42nd">42nd</a>',
      );
    }
    if (
      `${url}`.endsWith("/sakurazaka46/") ||
      `${url}`.endsWith("/hinatazaka46/")
    ) {
      return new Response("遷移したいページを選択してください");
    }
    if (`${url}`.includes("/data/nogizaka46/42nd/config.json")) {
      return Response.json({
        eventId: "nogizaka46_42nd",
        applications: [{ awards: [] }],
      });
    }
    if (`${url}`.includes("/user/history2")) {
      return Response.json({ results: [], used: [], unused: [] });
    }
    return new Response("not found", { status: 404 });
  };
  const context = {
    AbortController,
    clearTimeout,
    console,
    fetch,
    setTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(meetsApiSource, context);
  const result = await context.MiguriMeetsApi.sync({ userId: "session-key" });
  assert.equal(result.discoveredCampaigns, 1);
  assert.equal(
    calls.filter((url) => url.includes("/data/nogizaka46/")).length,
    1,
  );
  assert.equal(calls.some((url) => url.includes("logo.png/config.json")), false);
});

test("Meets API accepts three-group campaign discovery from the official tab", async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(`${url}`);
    if (`${url}`.includes("/data/")) {
      return Response.json({ applications: [{ awards: [] }] });
    }
    throw new Error(`unexpected landing request: ${url}`);
  };
  const context = {
    AbortController,
    clearTimeout,
    console,
    fetch,
    setTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(meetsApiSource, context);
  const result = await context.MiguriMeetsApi.sync({
    userId: "session-key",
    campaignsByGroup: {
      nogizaka46: ["42nd"],
      sakurazaka46: ["15th"],
      hinatazaka46: ["17th"],
    },
  });
  assert.equal(result.discoveredCampaigns, 3);
  assert.equal(calls.length, 3);
  assert.ok(calls.some((url) => url.includes("/data/nogizaka46/42nd/")));
  assert.ok(calls.some((url) => url.includes("/data/sakurazaka46/15th/")));
  assert.ok(calls.some((url) => url.includes("/data/hinatazaka46/17th/")));
  assert.equal(
    calls.some((url) =>
      /fortunemeets\.app\/(?:nogi|sakura|hinata)zaka46\/$/.test(url),
    ),
    false,
  );
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
  assert.match(dashboardSource, /限定盘折扣/);
  assert.match(dashboardSource, /type="range"/);
  assert.match(dashboardSource, /max="30"/);
  assert.match(dashboardSource, /MEETS_DISCOUNT_STORAGE_KEY/);
  assert.match(dashboardSource, /Meets 支付合计（普通used序列号）/);
  assert.match(dashboardSource, /サイン会支付/);
  assert.match(dashboardSource, /combinedMiguriEntries/);
  assert.match(dashboardSource, /\[entries, selectedGroup\]/);
  assert.match(dashboardSource, /リアミ＋全国共同支付/);
  assert.match(dashboardSource, /formatYen\(combinedMiguriSpend\.paid\)/);
  assert.match(dashboardSource, /リアミ＋全国落选金额合计/);
  assert.match(dashboardSource, /formatYen\(combinedMiguriSpend\.lost\)/);
  assert.match(dashboardSource, /当选金额（普通序列号，不含落选）/);
  assert.match(dashboardSource, /落选金额合计/);
  assert.match(dashboardSource, /支付合计（按序列号）/);
  assert.match(dashboardSource, /type／serialInfo、应募时间与活动保障期 serialName/);
  assert.match(dashboardSource, /保障券保留在应募、中签和中签率中/);
  assert.match(dashboardSource, /两类官方落选张数合计计算/);
  assert.match(dashboardSource, /不使用百分比分摊/);
  assert.match(dashboardSource, /落选金额计入支付合计及成员排行/);
  assert.match(dashboardSource, /支付金额/);
  assert.match(dashboardSource, /中签张数/);
  assert.match(dashboardSource, /中签率/);
  assert.match(dashboardSource, /单张成本/);
  assert.doesNotMatch(dashboardSource, /兼容导入/);
  assert.doesNotMatch(dashboardSource, /拖动安装旧版书签/);
  assert.doesNotMatch(dashboardSource, /使用粘贴导入/);
  assert.doesNotMatch(dashboardSource, /46log 不接收 forTUNE/);
});

test("automatic sync imports Music then launches one inactive three-group Meets scan", async () => {
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
    importScripts() {},
    MiguriMeetsApi: {
      async sync() {
        return { records: [], warnings: [], temporarilyUnavailable: [] };
      },
    },
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
  assert.match(createdTabs[1].url, /fortunemeets\.app\/nogizaka46/);

  const meetsJob = session.miguriSyncJob;
  const meetsResult = await send(
    {
      type: "MIGURI46LOG_RESULT",
      jobId: meetsJob.id,
      records: [
        { source: "fortunemeets", sourceKey: "nogi-1" },
        { source: "fortunemeets", sourceKey: "sakura-1" },
        { source: "fortunemeets", sourceKey: "hinata-1" },
      ],
    },
    { tab: { id: meetsJob.tabId } },
  );
  assert.equal(meetsResult.ok, true);
  assert.deepEqual(removedTabs, [musicJob.tabId, meetsJob.tabId]);
  assert.equal(importedRequests, 2);
  assert.equal(local.miguriAutoSyncState.status, "success");
  assert.equal(local.miguriAutoSyncState.imported, 4);
});
