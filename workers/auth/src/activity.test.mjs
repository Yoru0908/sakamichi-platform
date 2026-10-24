// 46log 活跃度 (2026-10-25): the page-view beacon writes only for the site's own Origin and never to D1;
// the report is for ACTIVITY_VIEWER_IDS admins only and credits a once-signed-in browser to its account.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async file => {
  const out = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent', tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const worker = (await load('./index.ts')).default;
const { signAccessToken } = await load('./utils/jwt.ts');

const VID = '0b8f3c2e-4d5a-4f6b-8c7d-9e0f1a2b3c4d';
const users = [{ id: 'me', role: 'admin', display_name: 'Yoru' }, { id: 'other-admin', role: 'admin' }, { id: 'member', role: 'member' }];
const db = { reads: 0, prepare: sql => { db.reads++; const stmt = (args = []) => ({
  bind: (...a) => stmt(a),
  async first() { return users.find(u => u.id === args[0] && (!sql.includes("role = 'admin'") || u.role === 'admin')) ?? null; },
  async all() { return { results: users.filter(u => args.includes(u.id)).map(u => ({ id: u.id, display_name: u.display_name ?? null })) }; },
}); return stmt(); } };
const env = (extra = {}) => {
  const points = [];
  return { DB: db, MIGURI_DB: db, JWT_SECRET: 'test-secret', CORS_ORIGIN: 'https://46log.com,https://sakamichi-platform-test.pages.dev',
    ACTIVITY: { writeDataPoint: p => points.push(p) }, ACTIVITY_VIEWER_IDS: 'me', CF_ACCOUNT_ID: 'acct', points, ...extra };
};
const call = (e, path, init = {}) => worker.fetch(new Request(`https://api.46log.com${path}`, init), e);
const beacon = (e, body, headers = {}) => call(e, '/api/user/activity', { method: 'POST', headers: { Origin: 'https://46log.com', 'Content-Type': 'text/plain;charset=UTF-8', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const cookie = async id => ({ Cookie: `theme=dark; access_token=${await signAccessToken(id, 'member', 'test-secret')}` });

test('beacon: one Analytics Engine point per send, pathname only, no D1', async () => {
  const e = env(); db.reads = 0;
  const res = await beacon(e, { v: VID, p: '/blog/123?member=x#top', ms: 4200, n: 1, b: 0 });
  assert.equal(res.status, 204);
  assert.deepEqual(e.points, [{ indexes: [VID], blobs: ['', VID, '/blog/123', 'blog', 'desktop', '46log.com', '0'], doubles: [4200, 1] }]);
  await beacon(e, { v: VID, p: '/', ms: 9e9, n: 0, b: 1 }, { ...(await cookie('member')), 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' });
  assert.deepEqual(e.points[1], { indexes: [VID], blobs: ['member', VID, '/', 'home', 'mobile', '46log.com', '1'], doubles: [30 * 60 * 1000, 0] });
  await beacon(e, { v: VID, p: '/miguri', ms: 10, n: 1 }, { Origin: 'https://feat-x.sakamichi-platform-test.pages.dev' });
  assert.equal(e.points[2].blobs[5], 'feat-x.sakamichi-platform-test.pages.dev');
  assert.equal(db.reads, 0);
});

test('beacon: foreign or missing Origin, bad ids and oversized bodies write nothing (still 204)', async () => {
  const e = env();
  for (const [body, headers] of [
    [{ v: VID, p: '/' }, { Origin: 'https://evil.example' }],
    [{ v: VID, p: '/' }, { Origin: '' }],
    [{ v: 'not-a-uuid', p: '/' }, {}],
    [{ v: VID, p: 'https://evil.example/' }, {}],
    [JSON.stringify({ v: VID, p: '/' + 'a'.repeat(2000) }), {}],
    ['{not json', {}],
  ]) assert.equal((await beacon(e, body, headers)).status, 204);
  assert.equal(e.points.length, 0);
});

test('other text/plain writes are still refused (415)', async () => {
  const res = await call(env(), '/api/user/bookmarks', { method: 'POST', headers: { Origin: 'https://46log.com', 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
});

test('report: only a listed admin; explicit 503 without the read token', async () => {
  assert.equal((await call(env(), '/api/manage/activity')).status, 401);
  assert.equal((await call(env(), '/api/manage/activity', { headers: await cookie('other-admin') })).status, 403);
  assert.equal((await call(env({ ACTIVITY_VIEWER_IDS: 'member' }), '/api/manage/activity', { headers: await cookie('member') })).status, 403);
  const res = await call(env(), '/api/manage/activity', { headers: await cookie('me') });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'analytics_token_missing');
});

test('report: a browser seen signed in once counts as that account; sums are sample-weighted', async () => {
  const day = Math.floor((Date.parse('2026-10-24T00:00:00Z')) / 86400000), sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/acct/analytics_engine/sql');
    assert.equal(init.headers.Authorization, 'Bearer read-token');
    const q = init.body; sent.push(q);
    assert.match(q, /blob6 = '46log\.com' AND blob7 = '0'/); assert.match(q, /FORMAT JSON$/); assert.doesNotMatch(q, /DISTINCT/i);
    const data = q.includes('GROUP BY uid') ? [
      { uid: 'me', vid: VID, device: 'desktop', day: String(day), views: '3', ms: '60000' },
      { uid: '', vid: VID, device: 'mobile', day: String(day + 1), views: '2', ms: '30000' }, // cookie had lapsed
      { uid: '', vid: 'anon', device: 'mobile', day: String(day + 1), views: '1', ms: '5000' },
    ] : q.includes('GROUP BY path') ? [{ path: '/miguri', views: '4', ms: '80000' }] : [{ section: 'miguri', views: '4', ms: '80000' }];
    return Response.json({ meta: [], data, rows: data.length });
  };
  try {
    const res = await call(env({ CF_ANALYTICS_TOKEN: 'read-token' }), '/api/manage/activity?days=7', { headers: await cookie('me') });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(sent.length, 3); assert.match(sent[0], /INTERVAL '7' DAY/);
    assert.deepEqual(data.summary, { users: { people: 1, returning: 1, views: 5, ms: 90000 }, visitors: { people: 1, returning: 0, views: 1, ms: 5000 } });
    assert.deepEqual(data.daily, [
      { day: '2026-10-24', users: 1, visitors: 0, views: 3, ms: 60000 },
      { day: '2026-10-25', users: 1, visitors: 1, views: 3, ms: 35000 },
    ]);
    assert.deepEqual(data.users, [{ id: 'me', name: 'Yoru', lastDay: '2026-10-25', activeDays: 2, views: 5, ms: 90000 }]);
    assert.deepEqual(data.devices, { mobile: 3, desktop: 3 });
    assert.deepEqual(data.pages, [{ path: '/miguri', views: 4, ms: 80000 }]);
  } finally { globalThis.fetch = real; }
});
