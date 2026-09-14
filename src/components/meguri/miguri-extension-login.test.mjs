import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL(
  "../../../browser-extension/miguri-sync/official.js", import.meta.url,
), "utf8");

async function runOfficial({ auto = false, responses = [], initialId = "same-user",
  loginAfter = Infinity, landing = false, linkAfter = Infinity } = {}) {
  let now = 0;
  let apiCalls = 0;
  const messages = [];
  const navigations = [];
  const location = {
    hostname: "ticket.fortunemeets.app",
    pathname: landing ? "/nogizaka46/" : "/nogizaka46/test/",
    href: "https://ticket.fortunemeets.app/nogizaka46/test/",
    assign: (url) => navigations.push(url),
  };
  const panel = { setAttribute() {}, style: {}, querySelector: () => ({}) };
  const context = {
    Date: class extends Date { static now() { return now; } },
    URL, AbortController,
    setTimeout(callback, duration) {
      // Discovery's abort timer is cancelled by the successful fake fetch.
      if (duration !== 10_000) {
        now += duration;
        queueMicrotask(callback);
      }
      return 1;
    },
    clearTimeout() {},
    location,
    history: { replaceState() {} },
    localStorage: { getItem: () => JSON.stringify(
      now >= loginAfter ? "same-user" : initialId,
    ) },
    document: {
      createElement: () => panel,
      documentElement: { appendChild() {} },
      querySelectorAll: () => now >= linkAfter
        ? [{ href: "https://ticket.fortunemeets.app/nogizaka46/test/" }] : [],
    },
    DOMParser: class {
      parseFromString() { return { querySelectorAll: () => [] }; }
    },
    fetch: async () => ({ ok: true, text: async () => "" }),
    chrome: { runtime: {
      onMessage: { addListener() {} },
      async sendMessage(message) {
        messages.push(message);
        if (message.type === "MIGURI46LOG_GET_JOB") {
          return { job: { id: "job-1", source: "fortunemeets", auto } };
        }
        if (message.type === "MIGURI46LOG_MEETS_API_SYNC") {
          const response = responses[Math.min(apiCalls, responses.length - 1)];
          apiCalls += 1;
          return response || { ok: true, records: [] };
        }
        return { ok: true };
      },
    } },
  };
  await vm.runInNewContext(source, context);
  return { messages, apiCalls, navigations, elapsed: now };
}
const loginRequired = { ok: false, code: "LOGIN_REQUIRED" };
const successful = { ok: true, records: [{ sourceKey: "regression-record" }] };
const resultMessage = (run) => run.messages.find((m) => m.type === "MIGURI46LOG_RESULT");
const errorMessage = (run) => run.messages.find((m) => m.type === "MIGURI46LOG_JOB_ERROR");

test("same-account Meets re-login retries the API even when user ID is unchanged", async () => {
  const run = await runOfficial({ responses: [loginRequired, loginRequired, successful] });
  assert.equal(run.apiCalls, 3);
  assert.equal(resultMessage(run).records[0].sourceKey, "regression-record");
  assert.equal(errorMessage(run), undefined);
  assert.ok(run.elapsed >= 10_000);
  assert.ok(run.messages.filter((m) => m.type === "MIGURI46LOG_MEETS_API_SYNC")
    .every((m) => m.userId === "same-user"));
});

test("Meets login wait expires with a visible error and no successful empty import", async () => {
  const run = await runOfficial({ responses: [loginRequired] });
  assert.match(errorMessage(run).error, /超过 10 分钟/);
  assert.equal(resultMessage(run), undefined);
  assert.equal(run.apiCalls, 121);
});

test("automatic Meets login failure pauses without starting a manual retry loop", async () => {
  const run = await runOfficial({ auto: true, responses: [loginRequired] });
  assert.equal(run.apiCalls, 1);
  assert.ok(run.messages.some((m) => m.type === "MIGURI46LOG_LOGIN_REQUIRED"));
  assert.equal(resultMessage(run), undefined);
});

test("non-authentication errors during login recovery are surfaced rather than retried", async () => {
  const run = await runOfficial({ responses: [loginRequired, { ok: false, error: "官方限流" }] });
  assert.equal(run.apiCalls, 2);
  assert.equal(errorMessage(run).error, "官方限流");
  assert.equal(resultMessage(run), undefined);
});

test("Meets SPA login resumes when user ID appears without document navigation", async () => {
  const run = await runOfficial({ initialId: "", loginAfter: 2_000, responses: [successful] });
  assert.equal(run.apiCalls, 1);
  assert.ok(resultMessage(run));
});

test("Meets landing waits for asynchronously rendered campaign links", async () => {
  const run = await runOfficial({ landing: true, initialId: "", linkAfter: 2_000 });
  assert.equal(run.apiCalls, 0);
  assert.deepEqual(run.navigations, ["https://ticket.fortunemeets.app/nogizaka46/test/"]);
  assert.equal(errorMessage(run), undefined);
});
