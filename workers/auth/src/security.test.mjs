// Security regressions (2026-10-10 review): OAuth state CSRF, unverified-email account matching, cross-site form writes.
// The Worker is bundled with esbuild and driven through fetch() with an in-memory D1 and mocked Discord / Google APIs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const out = await build({ entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent', tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) });
const worker = (await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)).default;

// Tiny D1: users + user_oauth rows; everything else is accepted and ignored.
function fakeDb() {
  const users = [{ id: 'victim', email: 'victim@example.com', role: 'admin', is_first_login: 0, verification_status: 'none', geo_status: null, payment_status: null }];
  const oauth = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() {
      if (sql.includes('FROM user_oauth')) return oauth.find(o => o.provider === (args.length > 1 ? args[0] : 'discord') && o.provider_id === args.at(-1)) ?? null;
      if (sql.includes('FROM users WHERE email')) return users.find(u => u.email === args[0]) ?? null;
      if (sql.includes('FROM users WHERE id')) return users.find(u => u.id === args[0]) ?? null;
      return null;
    },
    async run() {
      if (sql.startsWith('INSERT INTO users')) users.push({ id: args[0], email: args[1], role: 'member', is_first_login: 1 });
      if (sql.includes('INSERT INTO user_oauth')) {
        const [, user_id, ...rest] = args;
        const provider = sql.includes("'discord'") ? 'discord' : rest.shift();
        oauth.push({ user_id, provider, provider_id: rest[0] });
      }
      return { meta: { changes: 1 } };
    },
    async all() { return { results: [] }; },
  });
  return { prepare: sql => stmt(sql), batch: async s => s.map(() => ({ meta: { changes: 1 } })), users, oauth };
}

const env = () => ({
  DB: fakeDb(), MIGURI_DB: fakeDb(), JWT_SECRET: 'test-secret', GEO_PASS_SECRET: 'g', CORS_ORIGIN: 'https://46log.com',
  DISCORD_CLIENT_ID: 'd', DISCORD_CLIENT_SECRET: 'd', DISCORD_REDIRECT_URI: 'https://api.46log.com/api/auth/callback/discord',
  GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', GOOGLE_REDIRECT_URI: 'https://api.46log.com/api/auth/callback/google',
  KOFI_VERIFICATION_TOKEN: 'kofi',
});

// Mock the providers: token exchange always works; the profile is whatever the test sets.
let profile = {};
globalThis.fetch = async url => {
  if (/oauth2\/token|googleapis\.com\/token/.test(url)) return Response.json({ access_token: 'x' });
  if (/users\/@me|userinfo/.test(url)) return Response.json(profile);
  throw new Error(`unexpected fetch ${url}`);
};

const call = (e, path, init = {}) => worker.fetch(new Request(`https://api.46log.com${path}`, init), e);

/** Start an OAuth login in "this browser": returns the sealed state from the authorize URL and the nonce cookie. */
async function start(e, provider) {
  const res = await call(e, `/api/auth/${provider}?origin=https://46log.com`);
  assert.equal(res.status, 302);
  const state = new URL(res.headers.get('Location')).searchParams.get('state');
  const cookie = res.headers.get('Set-Cookie');
  assert.match(cookie, /^oauth_nonce=[^;]+; Max-Age=600; HttpOnly; Secure; SameSite=Lax; Path=\/api\/auth\/callback$/);
  return { state, cookie: cookie.split(';')[0] };
}
const callback = (e, provider, state, cookie) =>
  call(e, `/api/auth/callback/${provider}?code=c&state=${encodeURIComponent(state)}`, { headers: cookie ? { Cookie: cookie } : {} });
const loggedInAs = res => res.headers.getSetCookie().find(c => c.startsWith('access_token=')) ?? null;
const sub = c => JSON.parse(Buffer.from(c.split('=')[1].split('.')[1], 'base64url')).sub;

test('a forged or replayed-elsewhere state is refused (no login, no link)', async () => {
  const e = env();
  profile = { id: 'attacker-discord', username: 'a', email: 'a@x.com', verified: true };
  const { state } = await start(e, 'discord');
  // Victim's browser: has no nonce cookie for this state (link CSRF) → refused before touching the code.
  for (const cookie of [null, 'oauth_nonce=other']) {
    const res = await callback(e, 'discord', state, cookie);
    assert.equal(res.headers.get('Location'), 'https://46log.com/auth/login?error=state_mismatch');
    assert.equal(loggedInAs(res), null);
  }
  const legacy = encodeURIComponent(JSON.stringify({ origin: 'https://46log.com', action: 'link', returnTo: '/user' }));
  assert.match((await callback(e, 'discord', legacy, 'oauth_nonce=x')).headers.get('Location'), /state_mismatch/);
  assert.equal(e.DB.oauth.length, 0);
});

test('the browser that started the login completes it, and the nonce is cleared', async () => {
  const e = env();
  profile = { id: 'new-discord', username: 'n', email: 'new@x.com', verified: true };
  const { state, cookie } = await start(e, 'discord');
  const res = await callback(e, 'discord', state, cookie);
  assert.ok(loggedInAs(res));
  assert.ok(res.headers.getSetCookie().some(c => c.startsWith('oauth_nonce=; Max-Age=0')));
});

test('an unverified provider email never claims an existing account', async () => {
  for (const [provider, p] of [['discord', { id: 'evil', username: 'e', email: 'victim@example.com', verified: false }],
                               ['google', { id: 'evil', email: 'victim@example.com', verified_email: false, name: 'e' }]]) {
    const e = env();
    profile = p;
    const { state, cookie } = await start(e, provider);
    const res = await callback(e, provider, state, cookie);
    assert.notEqual(sub(loggedInAs(res)), 'victim', provider);
    assert.equal(e.DB.users.at(-1).email, `evil@${provider}.user`);
  }
});

test('a verified provider email still logs into the existing account', async () => {
  for (const [provider, p] of [['discord', { id: 'mine', username: 'v', email: 'victim@example.com', verified: true }],
                               ['google', { id: 'mine', email: 'victim@example.com', verified_email: true, name: 'v' }]]) {
    const e = env();
    profile = p;
    const { state, cookie } = await start(e, provider);
    assert.equal(sub(loggedInAs(await callback(e, provider, state, cookie))), 'victim', provider);
  }
});

test('writes need JSON; refresh and the Ko-fi webhook keep working without it', async () => {
  const e = env();
  const form = { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"userId":"x","action":"approve"}' };
  for (const path of ['/api/manage/verifications/resolve', '/api/manage/invite-codes', '/api/auth/logout', '/api/user/bookmarks'])
    assert.equal((await call(e, path, form)).status, 415, path);
  assert.equal((await call(e, '/api/user/profile', { method: 'PUT', body: '{}' })).status, 415);
  // Same request as JSON reaches the handler (403: no admin cookie).
  assert.equal((await call(e, '/api/manage/verifications/resolve', { ...form, headers: { 'Content-Type': 'application/json; charset=utf-8' } })).status, 403);
  assert.notEqual((await call(e, '/api/auth/refresh', { method: 'POST' })).status, 415);
  const kofi = new URLSearchParams({ data: JSON.stringify({ verification_token: 'wrong' }) });
  assert.equal((await call(e, '/api/webhook/kofi', { method: 'POST', body: kofi })).status, 200);
  assert.equal((await call(e, '/api/auth/me')).status, 401);
});
