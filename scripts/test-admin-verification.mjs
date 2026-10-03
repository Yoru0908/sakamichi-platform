import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(root + '.tmp', { recursive: true });
await build({ entryPoints: [root + 'workers/auth/src/index.ts'], outfile: root + '.tmp/verification-test-worker.mjs', bundle: true, format: 'esm', platform: 'neutral' });
const helper = await build({ stdin: { contents: `export {signAccessToken} from './workers/auth/src/utils/jwt'; export {formatVerificationTime} from './src/utils/admin-verification-time';`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { signAccessToken, formatVerificationTime } = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].text).toString('base64'));
const secret = 'only-used-in-disposable-local-verification-tests';
const mf = new Miniflare({ modules: true, scriptPath: root + '.tmp/verification-test-worker.mjs', compatibilityDate: '2024-05-01', d1Databases: ['DB', 'MIGURI_DB'], bindings: { JWT_SECRET: secret, CORS_ORIGIN: 'https://46log.com' } });
let passed = 0;
async function check(name, fn) { await fn(); console.log('PASS:', name); passed++; }
try {
  const db = await mf.getD1Database('DB');
  const runSQL = async sql => { for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run(); };
  await runSQL(readFileSync(root + 'tests/admin-verification/legacy-users.sql', 'utf8'));
  await db.prepare(`INSERT INTO users (id,email,display_name,verification_status,verification_reason,created_at,updated_at)
    VALUES ('legacy','legacy@example.test','Legacy account','approved','This is an old application.','2026-05-01 13:11:58','2026-10-03 10:34:00')`).run();
  const original = await db.prepare("SELECT * FROM users WHERE id='legacy'").first();
  await runSQL(readFileSync(root + 'workers/auth/src/db/migrations/013_verification_timestamps.sql', 'utf8'));
  await check('migration preserves every historical field and leaves new times unknown', async () => {
    const row = await db.prepare("SELECT * FROM users WHERE id='legacy'").first();
    for (const [key, value] of Object.entries(original)) assert.equal(row[key], value);
    assert.equal(row.verification_requested_at, null); assert.equal(row.verification_resolved_at, null);
    const columns = await db.prepare('PRAGMA table_info(users)').all();
    assert(columns.results.filter(c => c.name.startsWith('verification_') && c.name.endsWith('_at')).every(c => c.dflt_value === null));
  });
  await runSQL(readFileSync(root + 'workers/auth/src/db/schema.sql', 'utf8'));
  const add = async (id, status = 'none', requested = null, resolved = null, role = 'member') => db.prepare(`INSERT INTO users (id,email,display_name,role,verification_status,verification_requested_at,verification_resolved_at,created_at)
    VALUES (?,?,?,?,?,?,?,'2026-01-01 00:00:00')`).bind(id,id+'@example.test',id,role,status,requested,resolved).run();
  await add('admin','none',null,null,'admin'); await add('applicant');
  const token = async (id, role = 'member') => signAccessToken(id,role,secret);
  const adminToken = await token('admin','admin');
  const call = async (path, { id, auth = adminToken, method = 'GET', body, cookie = false } = {}) => {
    const credential = id ? await token(id) : auth;
    return mf.dispatchFetch('https://api.46log.com' + path, { method, headers: { ...(credential ? cookie ? { Cookie: `access_token=${credential}` } : { Authorization: `Bearer ${credential}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  };
  const list = async status => (await (await call('/api/manage/verifications?status='+status)).json()).data.users;
  const row = id => db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
  const request = (id, reason = 'A sufficiently long application explanation.') => call('/api/user/request-verification',{ id, method:'POST',body:{reason} });
  const resolve = (userId, action) => call('/api/manage/verifications/resolve',{method:'POST',body:{userId,action}});

  await check('anonymous, non-admin, and role-only forged admin cannot read the queue', async () => {
    assert.equal((await call('/api/manage/verifications',{auth:null})).status,403);
    assert.equal((await call('/api/manage/verifications',{id:'applicant'})).status,403);
    assert.equal((await call('/api/manage/verifications',{auth:await token('applicant','admin')})).status,403);
  });
  await check('invalid status is rejected and private queue disables caching', async () => {
    assert.equal((await call('/api/manage/verifications?status='+encodeURIComponent("approved' OR 1=1 --"))).status,400);
    assert.equal((await call('/api/manage/verifications')).headers.get('cache-control'),'private, no-store');
  });
  await add('pending-old','pending','2026-09-01 10:00:00'); await add('pending-new','pending','2026-10-01 10:00:00');
  await add('pending-unknown','pending'); await add('review-new','approved','2026-10-01 10:00:00','2026-10-03 10:00:00');
  await add('review-old','approved','2026-08-01 10:00:00','2026-09-01 10:00:00');
  await add('rejected','rejected','2026-10-01 11:00:00','2026-10-02 11:00:00');
  await check('pending sorts by actual submission, unknown history last', async () => assert.deepEqual((await list('pending')).map(u=>u.id),['pending-new','pending-old','pending-unknown']));
  await check('processed sorts by actual review, recent account update cannot revive history', async () => assert.deepEqual((await list('approved')).map(u=>u.id),['review-new','review-old','legacy']));
  await check('all keeps pending first, then combines review statuses in chronological order', async () => assert.deepEqual((await list('all')).map(u=>u.id),['pending-new','pending-old','pending-unknown','review-new','rejected','review-old','legacy']));
  await check('profile edits never alter submission/review timestamps or ordering', async () => {
    const before = await row('pending-old');
    assert.equal((await call('/api/user/profile',{id:'pending-old',cookie:true,method:'PUT',body:{displayName:'Renamed recently'}})).status,200);
    const after = await row('pending-old');
    assert.equal(after.verification_requested_at,before.verification_requested_at); assert.equal(after.verification_resolved_at,before.verification_resolved_at);
    assert.deepEqual((await list('pending')).map(u=>u.id),['pending-new','pending-old','pending-unknown']);
  });
  await check('new application records submission and clears any old processing time', async () => {
    assert.equal((await request('applicant')).status,200);
    const u=await row('applicant'); assert.equal(u.verification_status,'pending'); assert.match(u.verification_requested_at,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/); assert.equal(u.verification_resolved_at,null);
  });
  await check('duplicate pending submission preserves original time and explanation', async () => {
    const before=await row('applicant'); assert.equal((await request('applicant','A different but equally long explanation.')).status,200);
    assert.deepEqual(await row('applicant'),before);
  });
  await check('approval records processing time, preserves request, and grants existing GeoPass status', async () => {
    const before=await row('applicant'); assert.equal((await resolve('applicant','approve')).status,200);
    const u=await row('applicant'); assert.equal(u.verification_status,'approved'); assert.equal(u.geo_status,'approved'); assert(u.verification_resolved_at>=u.verification_requested_at); assert.equal(u.verification_requested_at,before.verification_requested_at);
    assert.equal((await resolve('applicant','reject')).status,409); assert.deepEqual(await row('applicant'),u);
  });
  await check('legacy review time stays unknown instead of being manufactured by repeat approval', async () => {
    assert.equal((await resolve('legacy','approve')).status,409); assert.equal((await row('legacy')).verification_resolved_at,null);
  });
  await check('rejected applicant can resubmit with a new time and empty processing time', async () => {
    assert.equal((await request('rejected')).status,200);
    const u=await row('rejected'); assert.equal(u.verification_status,'pending'); assert(u.verification_requested_at>'2026-10-01 11:00:00'); assert.equal(u.verification_resolved_at,null);
    assert.equal((await resolve('rejected','reject')).status,200); assert.equal((await row('rejected')).verification_status,'rejected'); assert((await row('rejected')).verification_resolved_at);
  });
  await check('competing reviews yield one decision and reject the stale action', async () => {
    await add('competing','pending','2026-10-01 10:00:00');
    const replies=await Promise.all([resolve('competing','approve'),resolve('competing','reject')]);
    assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]); assert((await row('competing')).verification_resolved_at);
  });
  await check('JST conversion handles UTC SQL, ISO offset, midnight, and missing values', async () => {
    assert.match(formatVerificationTime('2026-05-01 13:11:58'),/2026\/05\/01 22:11/);
    assert.equal(formatVerificationTime('2026-10-03 15:00:00'),'2026/10/04 00:00');
    assert.equal(formatVerificationTime('2026-10-03T19:34:00+09:00'),formatVerificationTime('2026-10-03 10:34:00'));
    assert.equal(formatVerificationTime(null),'未记录'); assert.equal(formatVerificationTime('invalid'),'未记录');
  });
} finally { await mf.dispose(); }
console.log(`${passed} verification checks passed; all data stayed in disposable local D1.`);
