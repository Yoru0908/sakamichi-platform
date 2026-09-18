import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const official = readFileSync(new URL('../../browser-extension/miguri-sync/official.js', import.meta.url), 'utf8');
const start = official.indexOf('  const readMeetsUserId = () => {');
const end = official.indexOf('  const onMeetsGroupLanding', start);
assert(start >= 0 && end > start, 'test must exercise the actual content-script reader');
const reader = official.slice(start, end);
const now = Date.now();
const future = String(Math.floor(now / 60_000) + 60);
const past = String(Math.floor(now / 60_000) - 1);
function read(values, getItem = key => values[key] ?? null) {
  return vm.runInNewContext(reader + '\nreadMeetsUserId();', { localStorage: { getItem }, Date });
}
function auth(values) {
  return vm.runInNewContext(reader + '\nreadMeetsAuth();', { localStorage: { getItem: key => values[key] ?? null }, Date });
}
test('modern sessions need a valid token, legacy ID is only used for legacy storage',()=>{
  assert.equal(auth({'lscache-userId':'"fixture"','lscache-id':'"previous"'}),null);
  assert.equal(auth({'lscache-userId':'"fixture"','lscache-accessToken':'"fixture-token"'}).authMode,'bearer');
  assert.equal(auth({'lscache-id':'"fixture"'}).authMode,'legacy');
  for(const token of ['null','true','{}','"bad token"',JSON.stringify('x\r\ny')])assert.equal(auth({'lscache-userId':'"fixture"','lscache-accessToken':token}),null);
  assert.equal(auth({'lscache-userId':'"fixture"','lscache-accessToken':'"fixture-token"','lscache-accessToken-cacheexpiration':past}),null);
  assert.equal(auth({'lscache-id':'"fixture"','lscache-loggedInFlg':'false'}),null);
});

test('current and legacy session keys accept JSON strings and unquoted IDs', () => {
  for (const key of ['lscache-userId', 'lscache-id']) {
    for (const value of ['"fixture-user"', 'fixture-user', '12345']) {
      assert.equal(read({ [key]: value, [`${key}-cacheexpiration`]: future }), value === '12345' ? '12345' : 'fixture-user');
    }
  }
});
test('current userId wins when a different legacy account ID remains', () => {
  assert.equal(read({ 'lscache-userId': '"fixture-current"', 'lscache-id': '"fixture-previous"' }), 'fixture-current');
});
test('invalid or expired current ID must not resurrect the legacy account', () => {
  for (const raw of ['', 'null', 'undefined', '{}', '[]', 'true', '""', '"bad id"', '{broken', '-1', '"x"'.repeat(600)]) {
    assert.equal(read({ 'lscache-userId': raw, 'lscache-id': '"fixture-previous"' }), '', raw);
  }
  for (const expiry of [past, 'invalid', '']) {
    assert.equal(read({ 'lscache-userId': '"fixture-current"', 'lscache-userId-cacheexpiration': expiry, 'lscache-id': '"fixture-previous"' }), '');
  }
});
test('expiry is respected for legacy IDs too; absence or blocked storage fails closed', () => {
  assert.equal(read({ 'lscache-id': '"fixture-old"', 'lscache-id-cacheexpiration': past }), '');
  assert.equal(read({}), '');
  assert.equal(read({}, () => { throw new Error('Storage denied'); }), '');
  assert.equal(read({ 'lscache-accessToken': 'DO_NOT_READ', 'lscache-loggedInFlg': 'true' }), '');
});
test('reader only touches the selected ID and its expiration, never access tokens', () => {
  const keys = [];
  assert.equal(read({}, key => { keys.push(key); return key === 'lscache-userId' ? '"fixture-current"' : null; }), 'fixture-current');
  assert.deepEqual(keys, ['lscache-userId', 'lscache-userId-cacheexpiration']);
});

async function runOfficial(initial, { loginLater = false, rejectFirst = false } = {}) {
  const storage = { ...initial }, sent = [], ids = [], fetches = [];
  const job = { id: 'fixture-job', source: 'fortunemeets', target: '46log', auto: false };
  const location = { hostname: 'ticket.fortunemeets.app', href: 'https://ticket.fortunemeets.app/nogizaka46/fixture/', pathname: '/nogizaka46/fixture/', assign() { throw new Error('Unexpected navigation'); } };
  const element = { setAttribute() {}, style: {}, querySelector() { return { textContent: '' }; } };
  const context = {
    location, URL, Date, AbortController,
    localStorage: { getItem: key => storage[key] ?? null },
    history: { replaceState(_state, _unused, path) { const url = new URL(path, location.href); location.href = url.href; location.pathname = url.pathname; } },
    document: { createElement: () => element, documentElement: { appendChild() {} }, querySelectorAll: () => [] },
    DOMParser: class { parseFromString() { return { querySelectorAll(selector) { const group = selector.match(/\/(nogizaka46|sakurazaka46|hinatazaka46)\//)?.[1]; return group ? [{ getAttribute: () => `/${group}/fixture/` }] : []; } }; } },
    setTimeout(fn, duration) { if (duration >= 10_000) return 0; if (loginLater) {storage['lscache-userId'] = '"fixture-after-login"';storage['lscache-accessToken']='"fixture-refreshed-token"';} queueMicrotask(fn); return 1; },
    clearTimeout() {},
    fetch: async url => { fetches.push(String(url)); assert.match(String(url), /^https:\/\/ticket\.fortunemeets\.app\/(nogizaka46|sakurazaka46|hinatazaka46)\/$/); return { ok: true, text: async () => '<html>synthetic public campaign links</html>' }; },
    chrome: { runtime: { onMessage: { addListener() {} }, async sendMessage(message) {
      sent.push(message);
      if (message.type === 'MIGURI46LOG_GET_JOB') return { job };
      if (message.type === 'MIGURI46LOG_MEETS_API_SYNC') {
        ids.push(message.userId);
        assert.equal(message.authMode === 'bearer', Object.hasOwn(message, 'accessToken'));
        if (rejectFirst && ids.length === 1) return { ok: false, code: 'LOGIN_REQUIRED' };
        return { ok: true, records: [] };
      }
      return { ok: true };
    } } },
  };
  await vm.runInNewContext(official, context);
  assert.equal(sent.some(message => message.type === 'MIGURI46LOG_JOB_ERROR'), false);
  assert.equal(sent.filter(message => message.type === 'MIGURI46LOG_RESULT').length, 1);
  assert.equal(fetches.length, 3);
  assert(!JSON.stringify(sent.filter(m=>m.type!=='MIGURI46LOG_MEETS_API_SYNC')).includes('fixture-token'));
  return { ids, sent };
}
test('actual content script reaches Meets sync and delivers a result with either storage key', async () => {
  for (const key of ['lscache-userId', 'lscache-id']) {
    const result = await runOfficial({ [key]: '"fixture-user"', ...(key==='lscache-userId'?{'lscache-accessToken':'"fixture-token"'}:{}) });
    assert.deepEqual(result.ids, ['fixture-user']);
    assert.equal(result.sent.some(message => message.type === 'MIGURI46LOG_LOGIN_REQUIRED'), false);
  }
});
test('manual login wait resumes when the current userId key appears', async () => {
  const result = await runOfficial({}, { loginLater: true });
  assert.deepEqual(result.ids, ['fixture-after-login']);
  assert.equal(result.sent.some(message => message.type === 'MIGURI46LOG_LOGIN_REQUIRED'), true);
});
test('an unchanged ID still retries after official API requests login, instead of assuming success', async () => {
  const result = await runOfficial({ 'lscache-userId': '"fixture-same-user"', 'lscache-accessToken':'"fixture-token"' }, { rejectFirst: true });
  assert.deepEqual(result.ids, ['fixture-same-user', 'fixture-same-user']);
});
