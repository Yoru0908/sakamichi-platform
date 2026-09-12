import { parseFragment } from 'parse5';
import { MEMBERS, GROUP_NAMES, normalizeName, type Group, type Member } from './roster.ts';

import { ANALYSIS_VERSION, MAX_BLOGS, type BlogSource } from './contract.ts';
export { ANALYSIS_VERSION, MAX_BLOGS } from './contract.ts';
export type { BlogSource } from './contract.ts';
export type Evidence = {
  blogId: string; title: string; publishedAt: string; sourceUrl: string;
  source: 'original_content' | 'bilingual_ja'; occurrences: number;
  snippets: { before: string; match: string; after: string; kind: 'full-name' | 'honorific' | 'contextual' }[];
};
export type Edge = { from: string; to: string; fromGen: string; toGen: string; articleCount: number; occurrences: number; evidence: Evidence[] };
export type Analysis = ReturnType<typeof analyzeBlogs>;

type HtmlNode = { nodeName: string; value?: string; tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: HtmlNode[] };
const IGNORED_TAGS = new Set(['script', 'style', 'noscript', 'template', 'nav', 'header', 'footer', 'iframe', 'svg']);
const BREAK_TAGS = new Set(['p', 'div', 'li', 'section', 'article', 'blockquote', 'h1', 'h2', 'h3', 'br', 'hr']);

export function japaneseText(blog: Pick<BlogSource, 'original_content' | 'bilingual_content'>): { text: string; source: Evidence['source'] } | null {
  for (const [source, html] of [['original_content', blog.original_content], ['bilingual_ja', blog.bilingual_content]] as const) {
    if (!html?.trim() || html.length > 600_000) continue;
    const parts: string[] = [];
    function walk(node: HtmlNode, japanese: boolean) {
      const attrs = Object.fromEntries((node.attrs || []).map((attr) => [attr.name, attr.value]));
      if (IGNORED_TAGS.has(node.tagName || '') || 'hidden' in attrs || attrs['aria-hidden'] === 'true' || /display\s*:\s*none/i.test(attrs.style || '')) return;
      const lang = attrs.lang?.toLowerCase();
      const active = lang ? /^ja(?:-|$)/.test(lang) : japanese;
      if (node.nodeName === '#text' && active) parts.push(node.value || '');
      if (BREAK_TAGS.has(node.tagName || '')) parts.push('\n');
      for (const child of node.childNodes || []) walk(child, active);
      if (BREAK_TAGS.has(node.tagName || '')) parts.push('\n');
    }
    walk(parseFragment(html), source === 'original_content');
    const text = parts.join('').normalize('NFKC').replace(/https?:\/\/[^\s<>]+/g, ' ')
      .replace(/[\t \u3000]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
    if (text) return { text, source };
  }
  return null; // Never fall back to Chinese or unlabelled bilingual text.
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function namePattern(name: string) {
  return [...name.normalize('NFKC').replace(/\s/g, '')].map((char) =>
    /[﨑崎]/.test(char) ? '[﨑崎]' : /[髙高]/.test(char) ? '[髙高]' : escape(char)).join('[ \\t]*');
}
const HONORIFIC = '(?:ちゃん|さん|さま|様|くん|君|先輩)';
type Hit = { member: Member; start: number; end: number; kind: Evidence['snippets'][number]['kind'] };

export function extractMentions(text: string, author: Member, members: Member[] = MEMBERS) {
  const hits: Hit[] = [];
  const blocked: { start: number; end: number }[] = [];
  const occupied = (start: number, end: number) => blocked.some((hit) => start < hit.end && end > hit.start);
  const isTarget = (member: Member) => member.group === author.group && normalizeName(member.name) !== normalizeName(author.name);
  // Match all groups and the author first, including spans we will NOT count.
  // This prevents 小田倉麗奈 → 守屋麗奈 and 松田好花 → 松田里奈 leakage.
  const fullHits: Hit[] = [];
  for (const member of members) {
    for (const match of text.matchAll(new RegExp(namePattern(member.name), 'g'))) {
      fullHits.push({ member, start: match.index!, end: match.index! + match[0].length, kind: 'full-name' });
      if (fullHits.length > 5000) throw new Error('单篇提及复杂度超过上限，拒绝截断统计');
    }
  }
  fullHits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const anchors: Hit[] = [];
  for (const hit of fullHits) {
    if (occupied(hit.start, hit.end)) continue;
    blocked.push(hit);
    anchors.push(hit);
    if (isTarget(hit.member)) hits.push(hit);
  }

  const aliases = new Map<string, { alias: string; owners: Member[] }>();
  for (const member of members) for (const alias of member.aliases) {
    if ([...alias].length < 2) continue; // No bare single-character matches such as 和/彩/天/林.
    const key = normalizeName(alias);
    const entry = aliases.get(key) || { alias, owners: [] };
    if (!entry.owners.includes(member)) entry.owners.push(member);
    aliases.set(key, entry);
  }
  const aliasCandidates: Hit[] = [];
  for (const { alias, owners } of aliases.values()) {
    for (const match of text.matchAll(new RegExp(`${namePattern(alias)}(${HONORIFIC})?`, 'g'))) {
      const start = match.index!, end = start + match[0].length;
      if (occupied(start, end)) continue;
      // A given name inside an unknown third party's longer name is NOT evidence:
      // 朝日奈央さん must never become 冨里奈央. Prefer missed aliases to fabricated edges.
      const previous = text[start - 1] || '';
      if (/[\p{Script=Han}\p{Script=Latin}\p{Number}]/u.test(previous)) continue;
      if (/^[\p{Script=Hiragana}]+$/u.test(alias) && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(previous) && !'のはとにでやもをが'.includes(previous)) continue;
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const nextBreak = text.indexOf('\n', end);
      const lineEnd = nextBreak < 0 ? text.length : nextBreak;
      const contextual = owners.filter((owner) => anchors.some((anchor) => anchor.member === owner && anchor.start >= lineStart && anchor.end <= lineEnd));
      const candidates = owners.length === 1 && match[1] ? owners : contextual;
      if (candidates.length !== 1) continue;
      aliasCandidates.push({ member: candidates[0], start, end, kind: owners.length > 1 || !match[1] ? 'contextual' : 'honorific' });
      if (aliasCandidates.length > 5000) throw new Error('单篇提及复杂度超过上限，拒绝截断统计');
    }
  }
  aliasCandidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  for (const hit of aliasCandidates) {
    if (occupied(hit.start, hit.end)) continue;
    blocked.push(hit);
    if (isTarget(hit.member)) hits.push(hit);
  }
  return hits.sort((a, b) => a.start - b.start);
}

const SOURCE_HOST: Record<Group, string[]> = { nogizaka: ['www.nogizaka46.com', 'nogizaka46.com'], sakurazaka: ['sakurazaka46.com', 'www.sakurazaka46.com'], hinatazaka: ['www.hinatazaka46.com', 'hinatazaka46.com'] };
export function canonicalSource(value: string, group: Group): string | null {
  try {
    // Older imports retain a genuine relative official diary URL; resolve only
    // that explicit path, never synthesize a URL from a restore ID or shop link.
    const url = value.startsWith('/s/') ? new URL(value, `https://${SOURCE_HOST[group][0]}`) : new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !SOURCE_HOST[group].includes(url.hostname) || !/^\/s\/[^/]+\/diary\/detail\/\d+\/?$/.test(url.pathname)) return null;
    return `https://${SOURCE_HOST[group][0]}${url.pathname.replace(/\/$/, '')}`;
  } catch { return null; }
}

function revisionTime(value = '') {
  const parsed = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function analyzeBlogs(rows: BlogSource[], group: Group, month: string, now = new Date()) {
  if (rows.length > MAX_BLOGS) throw new Error('该月份超出分析容量，未返回截断统计');
  const coverage = { sourceRows: rows.length, duplicateRows: 0, analyzedBlogs: 0, originalBlogs: 0, bilingualJapaneseBlogs: 0, missingJapanese: 0, unknownAuthor: 0, invalidSource: 0, invalidDate: 0, oversized: 0, blogsWithMentions: 0 };
  const unique = new Map<string, BlogSource>();
  for (const row of [...rows].sort((a, b) => revisionTime(b.updated_at) - revisionTime(a.updated_at) || a.id.localeCompare(b.id))) {
    const url = canonicalSource(row.original_url, group);
    if (!url) { coverage.invalidSource++; continue; }
    if (unique.has(url)) { coverage.duplicateRows++; continue; }
    unique.set(url, row);
  }
  const edges = new Map<string, Edge>();
  let evidenceCount = 0;
  let latestSourceUpdate = '';
  const unknownAuthors = new Set<string>();
  for (const [sourceUrl, blog] of unique) {
    if (revisionTime(blog.updated_at) > revisionTime(latestSourceUpdate)) latestSourceUpdate = blog.updated_at || '';
    if (blog.publish_date.replace(/[./]/g, '-').slice(0, 7) !== month) { coverage.invalidDate++; continue; }
    if (blog.oversized || (blog.original_content?.length || 0) > 600_000 || (blog.bilingual_content?.length || 0) > 600_000) { coverage.oversized++; continue; }
    const author = MEMBERS.find((member) => member.group === group && normalizeName(member.name) === normalizeName(blog.member));
    if (!author) { coverage.unknownAuthor++; unknownAuthors.add(blog.member); continue; }
    const source = japaneseText(blog);
    if (!source) { coverage.missingJapanese++; continue; }
    coverage.analyzedBlogs++;
    if (source.source === 'original_content') coverage.originalBlogs++; else coverage.bilingualJapaneseBlogs++;
    const hits = extractMentions(source.text, author);
    if (hits.length) coverage.blogsWithMentions++;
    for (const target of new Set(hits.map((hit) => hit.member))) {
      if (++evidenceCount > 15_000) throw new Error('当月依据数量超过上限，拒绝截断统计');
      const matches = hits.filter((hit) => hit.member === target);
      const key = `${author.name}::${target.name}`;
      const edge = edges.get(key) || { from: author.name, to: target.name, fromGen: author.generation, toGen: target.generation, articleCount: 0, occurrences: 0, evidence: [] };
      edge.articleCount++;
      edge.occurrences += matches.length;
      edge.evidence.push({
        blogId: blog.id, title: blog.title || '无标题博客', publishedAt: blog.publish_date, sourceUrl, source: source.source,
        occurrences: matches.length,
        snippets: matches.slice(0, 3).map((hit) => ({
          before: source.text.slice(Math.max(0, hit.start - 65), hit.start), match: source.text.slice(hit.start, hit.end),
          after: source.text.slice(hit.end, hit.end + 85), kind: hit.kind,
        })),
      });
      edges.set(key, edge);
    }
  }
  const result = [...edges.values()].sort((a, b) => b.articleCount - a.articleCount || b.occurrences - a.occurrences || a.from.localeCompare(b.from, 'ja') || a.to.localeCompare(b.to, 'ja'));
  for (const edge of result) edge.evidence.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.blogId.localeCompare(b.blogId));
  return { version: ANALYSIS_VERSION, group, groupName: GROUP_NAMES[group], month, computedAt: now.toISOString(), latestSourceUpdate: latestSourceUpdate || null, coverage, unknownAuthors: [...unknownAuthors].sort(), members: MEMBERS.filter((member) => member.group === group).map(({ name, generation }) => ({ name, generation })), edges: result };
}
