import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { analyzeBlogs, japaneseText, extractMentions, canonicalSource, MAX_BLOGS } from './analyze.ts';
import { MEMBERS, normalizeName } from './roster.ts';
import { authorize, onRequest } from '../../../functions/api/blog-relations.ts';
import { relationshipRanking, generationRelations } from '../../components/blog/relationship-helpers.ts';

const member = (name) => MEMBERS.find((item) => normalizeName(item.name) === normalizeName(name));
const hitNames = (text, author = '山川宇衣') => extractMentions(text, member(author)).map((hit) => hit.member.name);
const blog = (overrides = {}) => ({ id: 'sakurazaka-70916', member: '山川 宇衣', group_name: '樱坂46', title: '宇宙船に乗って、どの星を目指そう', publish_date: '2026.09.07 22:13', original_url: 'https://sakurazaka46.com/s/s46/diary/detail/70916?ima=0000&cd=blog', original_content: null, bilingual_content: '<p lang="ja">小田倉さんと2人で行かせていただいた長野旅行。</p><p lang="ja">小田倉さんと色んな場所に行って。</p><p lang="zh">小田倉麗奈、守屋麗奈</p>', updated_at: '2026-09-07T14:00:00Z', ...overrides });

test('extracts labelled Japanese only, decodes entities, ignores HTML attributes, scripts, hidden nodes and URLs', () => {
  const result = japaneseText({ original_content: null, bilingual_content: '<nav><p lang="ja">松田里奈</p></nav><p lang="zh">守屋麗奈</p><p lang="ja-JP">小田倉&#x9e97;奈<br><b>さん</b><img alt="守屋麗奈"><script>守屋麗奈</script><span hidden>守屋麗奈</span></p><p lang="ja">https://example.com/守屋麗奈</p><!-- 守屋麗奈 -->' });
  assert.equal(result.source, 'bilingual_ja');
  assert.equal(result.text, '小田倉麗奈\nさん');
  assert.equal(japaneseText({ original_content: null, bilingual_content: '<p>小田倉麗奈</p><p lang="zh">小田倉麗奈</p>' }), null);
  assert.equal(japaneseText({ original_content: '<p>谷口愛季</p>', bilingual_content: '<p lang="ja">松田里奈</p>' }).source, 'original_content');
});

test('global longest-name precedence prevents false 麗奈 edges, self mentions and cross-group leakage', () => {
  assert.deepEqual(hitNames('小田倉麗奈さん。山川 宇衣さん。松田好花さん。'), ['小田倉麗奈']);
  assert.deepEqual(hitNames('小田倉麗奈さん。', '小田倉麗奈'), []);
  assert.deepEqual(hitNames('松田さん。麗奈ちゃん。'), []);
  assert.deepEqual(hitNames('井上さん。和さん。彩ちゃん。林さん。', '梅澤美波'), []);
  assert.deepEqual(hitNames('朝日奈央さん。平野美羽さん。', '梅澤美波'), []);
});

test('aliases require an honorific or a unique full-name anchor in the same text line', () => {
  assert.deepEqual(hitNames('小田倉さん。美青ちゃん。'), ['小田倉麗奈', '的野美青']);
  assert.deepEqual(hitNames('美青と遊びました。'), []);
  assert.deepEqual(hitNames('的野美青と遊びました。美青が笑った。'), ['的野美青', '的野美青']);
  assert.deepEqual(hitNames('的野美青と遊びました。\n美青が笑った。'), ['的野美青']);
  assert.deepEqual(hitNames('守屋麗奈と小田倉麗奈。麗奈さん。'), ['守屋麗奈', '小田倉麗奈']);
  assert.deepEqual(hitNames('小田倉麗奈と話した。麗奈さん。'), ['小田倉麗奈', '小田倉麗奈']);
});

test('spaces/variant kanji normalize without excluding historical members or changing their cohorts', () => {
  assert.deepEqual(hitNames('山崎 天さん。井上 梨名さん。'), ['山﨑天', '井上梨名']);
  assert.equal(member('林 瑠奈').generation, '四期生');
  assert.equal(member('松尾 美佑').generation, '四期生');
  assert.equal(member('佐藤 璃果').generation, '四期生');
  assert.deepEqual(hitNames('高橋未来虹さん。', '上村ひなの'), ['髙橋未来虹']);
});

test('one article can contain multiple mentions, all edges have Japanese source evidence and counts reconcile', () => {
  const result = analyzeBlogs([blog(), blog({ id: 'sakurazaka-70917', original_url: 'https://sakurazaka46.com/s/s46/diary/detail/70917', original_content: '<p>小田倉麗奈さん。的野美青さん。</p>' })], 'sakurazaka', '2026-09');
  assert.equal(result.coverage.analyzedBlogs, 2);
  const edge = result.edges.find((item) => item.to === '小田倉麗奈');
  assert.equal(edge.articleCount, 2); assert.equal(edge.occurrences, 3); assert.equal(edge.evidence.length, 2);
  assert.ok(!result.edges.some((item) => item.to === '守屋麗奈'));
  for (const item of result.edges) {
    assert.equal(item.occurrences, item.evidence.reduce((sum, source) => sum + source.occurrences, 0));
    assert.ok(item.evidence.every((source) => source.snippets.length > 0 && source.sourceUrl.startsWith('https://sakurazaka46.com/')));
  }
  assert.equal(relationshipRanking(result.edges)[0].blogCount, 2);
  assert.equal(generationRelations(result.edges).matrix.flat().reduce((a, b) => a + b, 0), 3, 'Matrix counts blog-target records, not distinct blogs');
});

test('missing Japanese, unknown authors and bad sources are excluded explicitly, never replaced by translations', () => {
  const result = analyzeBlogs([
    blog({ id: 'a', original_url: 'https://sakurazaka46.com/s/s46/diary/detail/1', bilingual_content: '<p lang="zh">小田倉麗奈</p>' }),
    blog({ id: 'b', original_url: 'https://sakurazaka46.com/s/s46/diary/detail/2', member: '未知成员' }),
    blog({ id: 'c', original_url: 'javascript:alert(1)' }),
    blog({ id: 'd', original_url: 'https://sakurazaka46.com/s/s46/diary/detail/3', oversized: 1 }),
  ], 'sakurazaka', '2026-09');
  assert.equal(result.coverage.analyzedBlogs, 0); assert.equal(result.coverage.missingJapanese, 1);
  assert.equal(result.coverage.unknownAuthor, 1); assert.equal(result.coverage.invalidSource, 1); assert.equal(result.coverage.oversized, 1);
  assert.deepEqual(result.edges, []);
  assert.deepEqual(analyzeBlogs([blog({ bilingual_content: '<p lang="ja">こんにちは</p>' })], 'sakurazaka', '2026-09').edges, []);
});

test('canonical URLs deduplicate reimports, use newest revision, and fail closed for unsafe links', () => {
  const result = analyzeBlogs([blog(), blog({ id: 'duplicate', original_url: 'https://www.sakurazaka46.com/s/s46/diary/detail/70916?tracking=2', updated_at: '2026-09-07 22:00:00', bilingual_content: '<p lang="ja">的野美青さん</p>' })], 'sakurazaka', '2026-09');
  assert.equal(result.coverage.duplicateRows, 1); assert.equal(result.edges.length, 1); assert.equal(result.edges[0].to, '的野美青');
  for (const url of ['https://sakurazaka46.com.evil.test/s/s46/diary/detail/1', 'https://user@sakurazaka46.com/s/s46/diary/detail/1', 'http://sakurazaka46.com/s/s46/diary/detail/1', 'https://sakurazaka46.com/other']) assert.equal(canonicalSource(url, 'sakurazaka'), null);
  assert.equal(canonicalSource('/s/official/diary/detail/66336?ima=0000', 'hinatazaka'), 'https://www.hinatazaka46.com/s/official/diary/detail/66336');
  assert.equal(canonicalSource('https://www.hmv.co.jp/product/detail/16260654', 'hinatazaka'), null);
  assert.throws(() => analyzeBlogs(Array(MAX_BLOGS + 1).fill(blog()), 'sakurazaka', '2026-09'), /截断/);
});

function sqliteEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE blogs (id TEXT, member TEXT, group_name TEXT, title TEXT, publish_date TEXT, original_url TEXT, original_content TEXT, bilingual_content TEXT, updated_at TEXT)');
  const rows = [blog(), blog({ id: 'other', group_name: '日向坂46', publish_date: '2026/08/01', original_url: 'https://www.hinatazaka46.com/s/official/diary/detail/123' })];
  for (const row of rows) db.prepare('INSERT INTO blogs VALUES (?,?,?,?,?,?,?,?,?)').run(...['id','member','group_name','title','publish_date','original_url','original_content','bilingual_content','updated_at'].map((key) => row[key]));
  db.exec('PRAGMA query_only = ON');
  const queries = [];
  return { db, queries, env: { BLOG_RELATIONS_SOURCE: { prepare(sql) { queries.push(sql); assert.match(sql.trim(), /^SELECT /); return { bind(...params) { return { async all() { return { success: true, results: db.prepare(sql).all(...params) }; } }; } }; } } } };
}
const request = (url = 'https://46log.com/api/blog-relations', country = 'CN', options) => Object.assign(new Request(url, options), { cf: { country } });

test('API catalogue is metadata-only; selecting a month uses real read-only SQLite and preserves original rows', async () => {
  const { db, env, queries } = sqliteEnv();
  const before = db.prepare('SELECT * FROM blogs').all();
  const ctx = { request: request(), env, waitUntil() {} };
  let response = await onRequest(ctx); assert.equal(response.status, 200);
  assert.equal((await response.json()).data.months.length, 2);
  assert.ok(!queries[0].includes('bilingual_content'));
  response = await onRequest({ ...ctx, request: request('https://46log.com/api/blog-relations?group=sakurazaka&month=2026-09&format=source') });
  const payload = await response.json();
  assert.equal(payload.data.version, 'ja-source-v1');
  assert.equal(analyzeBlogs(payload.data.rows, payload.data.group, payload.data.month).edges[0].to, '小田倉麗奈');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(db.prepare('SELECT * FROM blogs').all(), before); db.close();
});

test('API rejects writes, bad parameters, unguarded preview hosts and unpublished data source', async () => {
  const { db, env, queries } = sqliteEnv(); const call = (req, e = env) => onRequest({ request: req, env: e, waitUntil() {} });
  for (const query of ['?group=bad&month=2026-09', '?group=toString&month=2026-09', '?group=sakurazaka&month=2026-13', '?month=2026-09', '?group=sakurazaka&month=2026-09&extra=1']) assert.equal((await call(request('https://46log.com/api/blog-relations' + query))).status, 400);
  assert.equal((await call(request('https://46log.com/api/blog-relations?group=sakurazaka&month=2026-09'))).status, 426);
  assert.equal((await call(request('https://preview.pages.dev/api/blog-relations'))).status, 403);
  assert.equal((await call(request(undefined, 'CN', { method: 'POST' }))).status, 405);
  assert.equal((await call(request(), {})).status, 503);
  assert.equal(queries.length, 0); db.close();
});

test('JP guard requires a verified CURRENT session, not a forged geo_pass; protected data is never returned', async () => {
  const jp = request(undefined, 'JP', { headers: { Cookie: 'geo_pass=forged; access_token=test' } });
  let calls = 0;
  const upstream = (user, success = true) => async (url, options) => { calls++; assert.equal(url, 'https://api.46log.com/api/auth/me'); assert.equal(options.headers.Cookie, 'access_token=test'); assert.equal(options.redirect, 'error'); return Response.json({ success, data: { user } }); };
  assert.equal(await authorize(request(undefined, 'JP'), upstream({ role: 'admin' })), false);
  assert.equal(await authorize(request(undefined, 'JP', { headers: { Cookie: 'geo_pass=forged' } }), upstream({ role: 'admin' })), false); assert.equal(calls, 0);
  assert.equal(await authorize(jp, upstream({ role: 'member', verificationStatus: 'none' })), false);
  assert.equal(await authorize(jp, upstream({ role: 'member', verificationStatus: 'approved' })), true);
  assert.equal(await authorize(jp, upstream({ role: 'admin' })), true);
  assert.equal(await authorize(jp, upstream({ role: 'admin' }, false)), false);
  assert.equal(await authorize(jp, async () => { throw new Error('network'); }), false);
});

test('cached data remains behind authorization, uses no-store externally, HEAD has no body', async () => {
  const previous = globalThis.caches; let lookups = 0;
  globalThis.caches = { default: { async match() { lookups++; return Response.json({ success: true, data: { public: true } }); } } };
  const { db, env, queries } = sqliteEnv();
  try {
    const context = { env, waitUntil() {} };
    assert.equal((await onRequest({ ...context, request: request(undefined, 'JP') })).status, 403);
    assert.equal(lookups, 0);
    const response = await onRequest({ ...context, request: request(undefined, 'CN', { method: 'HEAD' }) });
    assert.equal(response.status, 200); assert.equal(await response.text(), '');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(lookups, 1); assert.equal(queries.length, 0);
  } finally { if (previous === undefined) delete globalThis.caches; else globalThis.caches = previous; db.close(); }
});

test('month count and total body size are checked before HTML materialization', async () => {
  for (const summary of [{ blogCount: MAX_BLOGS + 1, sourceChars: 10 }, { blogCount: 10, sourceChars: 6_000_001 }]) {
    const env = { BLOG_RELATIONS_SOURCE: { prepare(sql) { assert.match(sql, /^SELECT COUNT/); return { bind() { return { async all() { return { success: true, results: [summary] }; } }; } }; } } };
    assert.equal((await onRequest({ request: request('https://46log.com/api/blog-relations?group=sakurazaka&month=2026-09&format=source'), env, waitUntil() {} })).status, 422);
  }
});

test('frontend removes unverified fallback and subjective relationship claims; every aggregate can reach evidence', () => {
  const source = readFileSync(new URL('../../components/blog/BlogInteractions.tsx', import.meta.url), 'utf8');
  assert.ok(!source.includes('/data/interactions.json')); assert.ok(!source.includes('/api/interactions/all'));
  assert.ok(!source.includes('最喜欢提及')); assert.ok(!source.includes('话题中心'));
  assert.ok(source.includes('data-relations-evidence')); assert.ok(source.includes('官方原文'));
  assert.ok(!source.includes('dangerouslySetInnerHTML'));
  assert.ok(source.includes("new URL('./relationship-analysis.worker.ts'"));
  const apiSource = readFileSync(new URL('../../../functions/api/blog-relations.ts', import.meta.url), 'utf8');
  assert.ok(!apiSource.includes('analyzeBlogs('), 'Do not parse a whole month in a Pages request');
  assert.ok(!apiSource.includes('parse5'));
});
