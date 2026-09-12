// Offline audit of an explicitly supplied, read-only blog export. Never writes to a database.
// node scripts/audit-blog-relations.mjs /outside/repository/source-snapshot.json
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { analyzeBlogs, japaneseText, canonicalSource } from '../src/utils/blog-relations/analyze.ts';
import { normalizeName } from '../src/utils/blog-relations/roster.ts';
const file = process.argv[2];
if (!file) throw new Error('Supply a local source snapshot; this script never downloads or modifies production data.');
const bytes = readFileSync(file);
const rows = JSON.parse(bytes);
const byId = new Map(rows.map((row) => [row.id, row]));
const groups = { '樱坂46': 'sakurazaka', '櫻坂46': 'sakurazaka', '乃木坂46': 'nogizaka', '日向坂46': 'hinatazaka' };
const buckets = new Map();
for (const row of rows) {
  assert.ok(Object.hasOwn(groups, row.group_name), 'Unexpected group in source export');
  const key = `${groups[row.group_name]}:${row.publish_date.replace(/[./]/g, '-').slice(0, 7)}`;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(row);
}
const summary = [];
let verifiedSnippets = 0;
for (const [key, blogs] of [...buckets].sort(([a], [b]) => a.localeCompare(b))) {
  const [group, month] = key.split(':');
  const start = performance.now();
  const result = analyzeBlogs(blogs, group, month);
  for (const edge of result.edges) {
    assert.equal(edge.articleCount, edge.evidence.length);
    assert.equal(edge.articleCount, new Set(edge.evidence.map((item) => item.sourceUrl)).size);
    assert.equal(edge.occurrences, edge.evidence.reduce((sum, item) => sum + item.occurrences, 0));
    assert.notEqual(edge.from, edge.to);
    for (const evidence of edge.evidence) {
      const row = byId.get(evidence.blogId);
      assert.ok(row);
      assert.equal(normalizeName(row.member), normalizeName(edge.from));
      assert.equal(canonicalSource(row.original_url, group), evidence.sourceUrl);
      const original = japaneseText(row);
      assert.equal(original.source, evidence.source);
      for (const snippet of evidence.snippets) {
        assert.ok(original.text.includes(snippet.before + snippet.match + snippet.after), `Fabricated quote: ${evidence.blogId}`);
        verifiedSnippets++;
      }
    }
  }
  const c = result.coverage;
  assert.equal(c.sourceRows, c.duplicateRows + c.analyzedBlogs + c.missingJapanese + c.unknownAuthor + c.invalidSource + c.invalidDate + c.oversized);
  summary.push({ group, month, ...c, edges: result.edges.length, evidenceBlogs: result.edges.reduce((n, edge) => n + edge.articleCount, 0), unknownAuthors: result.unknownAuthors, milliseconds: Math.round(performance.now() - start) });
}
console.log(JSON.stringify({ sourceSha256: createHash('sha256').update(bytes).digest('hex'), sourceRows: rows.length, verifiedSnippets, months: summary }, null, 2));
