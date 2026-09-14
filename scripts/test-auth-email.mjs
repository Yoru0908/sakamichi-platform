import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await build({ stdin: { contents: `export {sendVerificationEmail} from './utils/email'; export {handleRegister} from './routes/register'; export {handleLogin} from './routes/login'; export {hashPassword} from './utils/password';`, resolveDir: root + 'workers/auth/src', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { sendVerificationEmail, handleRegister, handleLogin, hashPassword } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
const originalFetch = globalThis.fetch, originalInfo = console.info, originalError = console.error;
const logs = []; console.info = (...args) => logs.push(args); console.error = (...args) => logs.push(args);
let mode = 'ok', calls = 0;
const sent = [];
globalThis.fetch = async (url, options) => {
  calls++; sent.push(JSON.parse(options.body));
  assert.equal(url, 'https://api.resend.com/emails');
  if (mode === 'throw') throw new Error('secret must not leak');
  return new Response(JSON.stringify(mode === 'ok' ? { id: 'fixture-message-id' } : { message: mode === 'key' ? 'API key is invalid' : 'private provider details' }), { status: mode === 'ok' ? 200 : 403 });
};
const rows = []; let user = null, latest = null;
const env = { CORS_ORIGIN: 'https://46log.com', EMAIL_FROM: 'Sakamichi Tools <noreply@46log.com>', RESEND_API_KEY: 'test-key-not-real', DB: { prepare(sql) {
  let args;
  return { bind(...values) { args = values; return this; }, async first() { return sql.includes('email_tokens') ? latest : user; }, async run() { rows.push({ sql, args }); return { success: true }; } };
} } };
const req = (path, password = 'test-password') => new Request('https://api.46log.com/api/auth/' + path, { method: 'POST', body: JSON.stringify({ email: 'fixture@example.test', password }) });
try {
  for (const next of ['ok', 'fail', 'throw', 'key']) { mode = next; assert.equal(await sendVerificationEmail(env, 'fixture@example.test', 'private-token'), next === 'ok'); }
  assert(sent.every(body => body.from === env.EMAIL_FROM && body.html.includes('https://46log.com/auth/verify?token=')));
  assert(JSON.stringify(logs).includes('invalid_api_key'));
  assert(!JSON.stringify(logs).includes('private provider details'));
  assert(!JSON.stringify(logs).includes('private-token')); assert(!JSON.stringify(logs).includes('test-key-not-real')); assert(!JSON.stringify(logs).includes('fixture@example.test'));
  mode = 'fail'; let res = await handleRegister(req('register'), env);
  assert.equal(res.status, 502); assert.equal((await res.json()).success, false);
  assert(rows.some(row => row.sql.includes('INSERT INTO users')));
  mode = 'ok'; res = await handleRegister(req('register'), env); assert.equal(res.status, 201);
  user = { id: 'fixture-user', email: 'fixture@example.test', password_hash: await hashPassword('test-password'), email_verified: 0 };
  let before = calls; res = await handleLogin(req('login', 'wrong-password'), env); assert.equal(res.status, 401); assert.equal(calls, before);
  res = await handleLogin(req('login'), env); assert.equal(res.status, 403); assert((await res.json()).message.includes('重新发送')); assert.equal(res.headers.get('set-cookie'), null);
  latest = { expires_at: new Date(Date.now() + 86400000).toISOString() };
  before = calls; res = await handleLogin(req('login'), env); assert.equal(res.status, 429); assert.equal(calls, before);
  latest = null; mode = 'fail'; res = await handleLogin(req('login'), env); assert.equal(res.status, 502); assert.equal(res.headers.get('set-cookie'), null);
} finally { globalThis.fetch = originalFetch; console.info = originalInfo; console.error = originalError; }
console.log('PASS: new sender/verify URL, provider accepted/rejected/network error, redacted logs, truthful registration, password-gated resend, cooldown, no login bypass');
