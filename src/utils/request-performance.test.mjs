import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

let fixture = 0;
async function loadModule(relativePath) {
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  });
  const code = `${outputFiles[0].text}\n// isolated test module ${fixture++}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const user = { id: 'test-user', email: 'test@example.invalid', role: 'member' };

test('concurrent token rotations share one request, but later attempts remain possible', async t => {
  const api = await loadModule('./auth-api.ts');
  const gate = deferred();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; await gate.promise; return json({}); });
  const requests = [api.refreshToken(), api.refreshToken(), api.refreshToken()];
  await tick();
  assert.equal(calls, 1);
  gate.resolve();
  assert.deepEqual(await Promise.all(requests), [true, true, true]);
  await api.refreshToken();
  assert.equal(calls, 2);
});

test('concurrent 401s share refresh, retry credentials, and GETs omit JSON content type', async t => {
  const api = await loadModule('./auth-api.ts');
  const gate = deferred();
  let refreshed = false, refreshCalls = 0, getCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.credentials, 'include');
    if (url.endsWith('/refresh')) {
      refreshCalls++; await gate.promise; refreshed = true; return json({});
    }
    getCalls++;
    assert.equal(new Headers(options.headers).has('Content-Type'), false);
    return refreshed ? json({ success: true, data: { user } }) : json({ success: false }, 401);
  });
  const requests = [api.fetchMe(), api.fetchMe(), api.fetchMe()];
  await tick();
  assert.equal(refreshCalls, 1);
  gate.resolve();
  const results = await Promise.all(requests);
  assert.ok(results.every(result => result.success));
  assert.equal(getCalls, 6);
});

test('failed refresh is not retained and JSON POSTs retain their content type', async t => {
  const api = await loadModule('./auth-api.ts');
  let count = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/refresh')) return json({}, ++count === 1 ? 503 : 200);
    assert.equal(new Headers(options.headers).get('Content-Type'), 'application/json');
    return json({ success: true, data: { user } });
  });
  assert.equal(await api.refreshToken(), false);
  assert.equal(await api.refreshToken(), true);
  await api.login({ email: 'test@example.invalid', password: 'test-only' });
});

test('auth initialization is shared across islands and recent success is reused', async t => {
  const auth = await loadModule('../stores/auth.ts');
  const gate = deferred();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; await gate.promise; return json({ success: true, data: { user } }); });
  const requests = [auth.initAuth(), auth.initAuth(), auth.initAuth()];
  await tick(); assert.equal(calls, 1);
  gate.resolve(); await Promise.all(requests);
  await auth.initAuth(); assert.equal(calls, 1);
  await auth.initAuth(true); assert.equal(calls, 2);
  assert.equal(auth.$auth.get().userId, user.id);
});

test('successful auth reuse expires and failed initialization is immediately retryable', async t => {
  const auth = await loadModule('../stores/auth.ts');
  let now = 1000, calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return json(calls === 1 ? { success: false } : { success: true, data: { user } });
  });
  await auth.initAuth(); await auth.initAuth();
  assert.equal(calls, 2);
  now += 29_000; await auth.initAuth(); assert.equal(calls, 2);
  now += 2_000; await auth.initAuth(); assert.equal(calls, 3);
});

test('an older init response cannot overwrite a completed logout', async t => {
  const auth = await loadModule('../stores/auth.ts');
  const gate = deferred();
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/me')) { await gate.promise; return json({ success: true, data: { user } }); }
    return json({ success: true });
  });
  const request = auth.initAuth();
  await tick();
  auth.setAuth({ displayName: 'edited' });
  await auth.logout();
  gate.resolve(); await request;
  assert.equal(auth.$auth.get().isLoggedIn, false);
  assert.equal(auth.$auth.get().loading, false);
});

test('blog requests merge and cached results retain pagination metadata', async t => {
  const blogs = await loadModule('../components/blog/blog-api.ts');
  const gate = deferred();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++; await gate.promise;
    return json({ success: true, blogs: [{ id: 'b', publish_date: '2026-09-01' }], pagination: { total: 321, hasMore: true } });
  });
  const query = { group: 'sakurazaka', page: 1 };
  const requests = [blogs.fetchBlogs(query), blogs.fetchBlogs(query), blogs.fetchBlogs(query)];
  await tick(); assert.equal(calls, 1);
  gate.resolve(); const [result] = await Promise.all(requests);
  assert.deepEqual(await blogs.fetchBlogs(query), result);
  assert.equal(result.total, 321); assert.equal(result.hasMore, true); assert.equal(calls, 1);
  await blogs.fetchBlogs({ ...query, useCache: false }); assert.equal(calls, 2);
});

test('blog cache evicts old queries and expires stale results', async t => {
  const blogs = await loadModule('../components/blog/blog-api.ts');
  let now = 1000, calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => { calls++; return json({ success: true, blogs: [], total: 0 }); });
  for (let page = 1; page <= 41; page++) await blogs.fetchBlogs({ page });
  assert.equal(calls, 41);
  await blogs.fetchBlogs({ page: 1 }); assert.equal(calls, 42);
  await blogs.fetchBlogs({ page: 41 }); assert.equal(calls, 42);
  now += 301_000;
  await blogs.fetchBlogs({ page: 41 }); assert.equal(calls, 43);
});

test('empty blog pages are cacheable and rejected loads can be retried', async t => {
  const blogs = await loadModule('../components/blog/blog-api.ts');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return json(calls === 1 ? { success: false, error: 'fixture error' } : { success: true, blogs: [], total: 0, pagination: { hasMore: false } });
  });
  await assert.rejects(blogs.fetchBlogs({}), /fixture error/);
  assert.equal((await blogs.fetchBlogs({})).total, 0);
  assert.equal((await blogs.fetchBlogs({})).hasMore, false);
  assert.equal(calls, 2);
});
