// In-person / online events of the three groups for 46log /events (plan E4) and 46log's own 参加ログ marks on them (E5). The rows
// live in 坂ログ's events table (one Homeserver job, one Jev review queue, one venue list — plan A); this route reads one group's
// year through the SAKA46LOG service binding with a read-only token and caches it at the edge. Fields are listed explicitly:
// 坂ログ's attendee counts are its own users' data. Marks are 46log accounts' (miguri D1 sakamichi_event_marks, migration 014).

import { attendanceToday, summarizeAttendance, validateEventMemo, validateEventProfile, type EventMemoData } from '../../../shared/event-attendance.ts';
import type { Env } from '../types.ts';
import { error, json } from '../utils/response.ts';
import { getAuthUserId } from './preferences.ts';
import { parseSakamichiEventId } from '../../../shared/sakamichi-event-id.ts';
import { SAKAMICHI_EVENTS_CACHE_REVISION } from '../../../shared/sakamichi-events-cache.ts';

/** First year on each official schedule: Nogizaka 2011-08, Sakurazaka 2020-10 (改名), Hinatazaka 2019-02 (改名). */
export const EVENT_GROUPS = { nogizaka: 2011, sakurazaka: 2020, hinatazaka: 2019 } as const;
export type EventGroup = keyof typeof EVENT_GROUPS;
type Query = { grp: EventGroup; year: number };

type SourceEvent = {
  id: string; date: string; title: string; kind: string; category: 'attend' | 'online';
  shows: { label: string; start: string }[]; members: { id: string; name: string }[]; wholeGroup: boolean; sourceUrl: string;
  venue: { id: number; name: string; prefecture: string | null } | null;
};

const LIST_PATH = '/api/miguri/sakamichi-events';
const jstYear = (now: Date) => new Date(now.getTime() + 9 * 3600e3).getUTCFullYear();
const servedYear = (grp: EventGroup, year: number, now: Date) => Number.isInteger(year) && year >= EVENT_GROUPS[grp] && year <= jstYear(now) + 1;

/** grp and year from the query, or null (unknown group, or a year before the group's first / after next year). */
export function eventsQuery(url: URL, now = new Date()): Query | null {
  const grp = url.searchParams.get('grp') ?? '', year = Number(url.searchParams.get('year'));
  if (!Object.hasOwn(EVENT_GROUPS, grp)) return null;
  return servedYear(grp as EventGroup, year, now) ? { grp: grp as EventGroup, year } : null;
}

/** An event id's group and year: Sakurazaka "<n>:<date>", Hinatazaka "h_<code>:<date>", Nogizaka "n_<code>:<date>". */
export function markTarget(raw: string, now = new Date()): (Query & { id: string }) | null {
  let id: string;
  try { id = decodeURIComponent(raw); } catch { return null; }
  const target = parseSakamichiEventId(id);
  if (!target) return null;
  const { grp, year } = target;
  return servedYear(grp, year, now) ? { id, grp, year } : null;
}

const publicEvent = (e: SourceEvent): SourceEvent => ({
  id: e.id, date: e.date, title: e.title, kind: e.kind, category: e.category, shows: e.shows, members: e.members,
  wholeGroup: e.wholeGroup, sourceUrl: e.sourceUrl, venue: e.venue,
});

const edge = () => (typeof caches === 'undefined' ? null : caches.default);

/** The public list of one group-year, from the edge cache or 坂ログ (then cached). */
async function yearList(env: Env, origin: string, q: Query, now: Date): Promise<Response> {
  if (!env.SAKA46LOG || !env.EVENTS_READ_TOKEN) return error('events source not configured', 503);
  const key = new Request(`${origin}${LIST_PATH}?grp=${q.grp}&year=${q.year}&revision=${SAKAMICHI_EVENTS_CACHE_REVISION}`), hit = await edge()?.match(key);
  if (hit) return hit;
  const res = await env.SAKA46LOG.fetch(`https://saka46log.com/internal/events?grp=${q.grp}&year=${q.year}`, {
    headers: { Authorization: `Bearer ${env.EVENTS_READ_TOKEN}` },
  });
  if (!res.ok) return error('events source unavailable', 502);
  const body = await res.json() as { data?: { events?: SourceEvent[] } }, events = (body.data?.events ?? []).map(publicEvent);
  // Old years also change during quarter-by-quarter backfills and corrections. Bound every populated year to 10 minutes;
  // empty years retry sooner. The revision above retires the former 24-hour edge entries.
  const maxAge = !events.length ? 60 : 600;
  const out = json({ success: true, data: { grp: q.grp, year: q.year, events } }, 200, { 'Cache-Control': `public, max-age=${maxAge}` });
  await edge()?.put(key, out.clone());
  return out;
}

export async function handleGetSakamichiEvents(req: Request, env: Env, now = new Date()): Promise<Response> {
  const url = new URL(req.url), q = eventsQuery(url, now);
  return q ? yearList(env, url.origin, q, now) : error('invalid grp or year', 400);
}

const yearBounds = (q: Query) => [q.grp, `${q.year}-01-01`, `${q.year}-12-31`];

/** GET …/counts?grp=&year= — how many 46log users marked each day. Public; a minute behind (the page adds its own toggles). */
export async function handleGetSakamichiEventCounts(req: Request, env: Env, now = new Date()): Promise<Response> {
  const url = new URL(req.url), q = eventsQuery(url, now);
  if (!q) return error('invalid grp or year', 400);
  const key = new Request(`${url.origin}${LIST_PATH}/counts?grp=${q.grp}&year=${q.year}`), hit = await edge()?.match(key);
  if (hit) return hit;
  const rows = await env.MIGURI_DB.prepare('SELECT event_id id, COUNT(*) n FROM sakamichi_event_marks WHERE grp=? AND date BETWEEN ? AND ? GROUP BY event_id')
    .bind(...yearBounds(q)).all<{ id: string; n: number }>();
  const out = json({ success: true, data: { counts: Object.fromEntries(rows.results.map((r: { id: string; n: number }) => [r.id, r.n])) } }, 200, { 'Cache-Control': 'public, max-age=60' });
  await edge()?.put(key, out.clone());
  return out;
}

/** GET …/marks?grp=&year= — the signed-in user's marked days of that group-year. 401 lets the client refresh its token. */
export async function handleGetMySakamichiEventMarks(req: Request, env: Env, now = new Date()): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('请先登录', 401);
  const q = eventsQuery(new URL(req.url), now);
  if (!q) return error('invalid grp or year', 400);
  const rows = await env.MIGURI_DB.prepare('SELECT event_id id FROM sakamichi_event_marks WHERE user_id=? AND grp=? AND date BETWEEN ? AND ?')
    .bind(userId, ...yearBounds(q)).all<{ id: string }>();
  return json({ success: true, data: { mine: rows.results.map((r: { id: string }) => r.id) } }, 200, { 'Cache-Control': 'private, no-store' });
}

/** PUT / DELETE …/marks/<id> — mark or unmark one published day. Marking twice is harmless. */
export async function handleSetSakamichiEventMark(req: Request, env: Env, rawId: string, on: boolean, now = new Date()): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('请先登录', 401);
  const t = markTarget(rawId, now);
  if (!t) return error('invalid event id', 400);
  if (!on) {
    await env.MIGURI_DB.prepare('DELETE FROM sakamichi_event_marks WHERE user_id=? AND event_id=?').bind(userId, t.id).run();
    return json({ success: true, data: { id: t.id, marked: false } }, 200, { 'Cache-Control': 'no-store' });
  }
  const list = await yearList(env, new URL(req.url).origin, t, now);
  if (!list.ok) return list;
  const { data } = await list.json() as { data: { events: SourceEvent[] } }, e = data.events.find((x) => x.id === t.id);
  if (!e) return error('event not found', 404);
  await env.MIGURI_DB.prepare('INSERT OR IGNORE INTO sakamichi_event_marks(user_id,event_id,grp,date,title,created_at) VALUES(?,?,?,?,?,?)')
    .bind(userId, e.id, t.grp, e.date, e.title, now.getTime()).run();
  return json({ success: true, data: { id: t.id, marked: true } }, 200, { 'Cache-Control': 'no-store' });
}

// Phase 2: private 46log history and memos. The upstream is never queried for history;
// the original title/date snapshot survives an unpublished or temporarily unavailable source.
type MemoRow = { note: string | null; cost: string | null; updated_at: number | null };
const privateHeaders = { 'Cache-Control': 'private, no-store' };
function readMemo(row?: MemoRow | null): EventMemoData {
  let cost: unknown = {};
  try { cost = JSON.parse(row?.cost || '{}'); } catch { /* keep old corrupt data out of responses */ }
  return validateEventMemo({ note: row?.note || '', cost }) || { note: row?.note || '', cost: {} };
}
async function limitedJson(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  let size = 0, text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 20000) { await reader.cancel(); return null; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch { return null; }
  finally { reader.releaseLock(); }
}
export async function handleGetSakamichiHistory(req: Request, env: Env, now = new Date()): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('请先登录', 401);
  const rawOffset = new URL(req.url).searchParams.get('offset') || '0';
  if (!/^\d{1,7}$/.test(rawOffset)) return error('invalid offset', 400);
  const offset = Number(rawOffset);
  type Row = MemoRow & { event_id: string; grp: EventGroup; date: string; title: string; created_at: number };
  const rows = await env.MIGURI_DB.prepare(`SELECT m.event_id,m.grp,m.date,m.title,m.created_at,n.note,n.cost,n.updated_at
    FROM sakamichi_event_marks m LEFT JOIN sakamichi_event_memos n ON n.user_id=m.user_id AND n.event_id=m.event_id
    WHERE m.user_id=? ORDER BY m.date DESC,m.event_id LIMIT 101 OFFSET ?`).bind(userId, offset).all<Row>();
  const summaryRows = await env.MIGURI_DB.prepare(`SELECT m.event_id,m.date,n.cost FROM sakamichi_event_marks m
    LEFT JOIN sakamichi_event_memos n ON n.user_id=m.user_id AND n.event_id=m.event_id WHERE m.user_id=?`)
    .bind(userId).all<{ event_id: string; date: string; cost: string | null }>();
  return json({ success: true, data: {
    records: rows.results.slice(0, 100).map(r => ({ id: r.event_id, grp: r.grp, date: r.date, title: r.title, markedAt: r.created_at, updatedAt: r.updated_at, sourceStatus: 'saved-snapshot', ...readMemo(r) })),
    summary: summarizeAttendance(summaryRows.results.map(r => ({ id: r.event_id, date: r.date, cost: readMemo({ note: '', cost: r.cost, updated_at: null }).cost })), attendanceToday(now)),
    nextOffset: rows.results.length > 100 ? offset + 100 : null,
  } }, 200, privateHeaders);
}
export async function handleSakamichiEventMemo(req: Request, env: Env, rawId: string, now = new Date()): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('请先登录', 401);
  const target = markTarget(rawId, now);
  if (!target) return error('invalid event id', 400);
  if (req.method === 'PATCH') {
    const body = await limitedJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('invalid memo request', 400);
    const { expectedUpdatedAt, ...memo } = body as Record<string, unknown>;
    if (expectedUpdatedAt !== null && (typeof expectedUpdatedAt !== 'number' || !Number.isSafeInteger(expectedUpdatedAt) || expectedUpdatedAt < 0 || expectedUpdatedAt >= Number.MAX_SAFE_INTEGER)) return error('invalid expectedUpdatedAt', 400);
    const input = validateEventMemo(memo);
    if (!input) return error('invalid memo: note <= 4000 characters; costs are whole yen between 0 and 9999999', 400);
    // Both branches atomically check the version and the owner's active mark. A read-before-write check would race.
    const saved = expectedUpdatedAt === null
      ? await env.MIGURI_DB.prepare(`INSERT INTO sakamichi_event_memos(user_id,event_id,note,cost,updated_at)
          SELECT user_id,event_id,?,?,? FROM sakamichi_event_marks WHERE user_id=? AND event_id=?
          ON CONFLICT(user_id,event_id) DO NOTHING RETURNING note,cost,updated_at`)
          .bind(input.note, JSON.stringify(input.cost), now.getTime(), userId, target.id).first<MemoRow>()
      : await env.MIGURI_DB.prepare(`UPDATE sakamichi_event_memos SET note=?,cost=?,updated_at=MAX(?,updated_at+1)
          WHERE user_id=? AND event_id=? AND updated_at=?
          AND EXISTS(SELECT 1 FROM sakamichi_event_marks WHERE user_id=? AND event_id=?) RETURNING note,cost,updated_at`)
          .bind(input.note, JSON.stringify(input.cost), now.getTime(), userId, target.id, expectedUpdatedAt, userId, target.id).first<MemoRow>();
    if (!saved) {
      const marked = await env.MIGURI_DB.prepare('SELECT 1 present FROM sakamichi_event_marks WHERE user_id=? AND event_id=?').bind(userId, target.id).first();
      return json({ success: false, error: marked ? 'memo_conflict' : 'mark not found', message: marked ? 'memo changed; preserve your draft and reload before merging' : 'mark not found' }, marked ? 409 : 404, privateHeaders);
    }
    return json({ success: true, data: { marked: true, memo: readMemo(saved), updatedAt: saved.updated_at } }, 200, privateHeaders);
  }
  const mark = await env.MIGURI_DB.prepare('SELECT 1 present FROM sakamichi_event_marks WHERE user_id=? AND event_id=?').bind(userId, target.id).first();
  const memo = await env.MIGURI_DB.prepare('SELECT note,cost,updated_at FROM sakamichi_event_memos WHERE user_id=? AND event_id=?').bind(userId, target.id).first<MemoRow>();
  return json({ success: true, data: { marked: !!mark, memo: readMemo(memo), updatedAt: memo?.updated_at ?? null } }, 200, privateHeaders);
}
export async function handleSakamichiEventProfile(req: Request, env: Env, now = new Date()): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('请先登录', 401);
  if (req.method === 'PUT') {
    const input = validateEventProfile(await limitedJson(req));
    if (!input) return error('invalid public profile', 400);
    await env.MIGURI_DB.prepare(`INSERT INTO sakamichi_event_profiles(user_id,public_enabled,public_name,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET public_enabled=excluded.public_enabled,public_name=excluded.public_name,updated_at=excluded.updated_at`)
      .bind(userId, input.public ? 1 : 0, input.name, now.getTime()).run();
  }
  const row = await env.MIGURI_DB.prepare('SELECT public_enabled,public_name FROM sakamichi_event_profiles WHERE user_id=?').bind(userId).first<{ public_enabled: number; public_name: string }>();
  return json({ success: true, data: { public: !!row?.public_enabled, name: row?.public_name || '' } }, 200, privateHeaders);
}
/** Explicit opt-in and past/current dates are in the SQL predicate, not a UI filter. No public response reads memos/costs.
 *  ?grp= ranks one group's events only (2026-10-26); without it, dates count once across all three groups. */
export async function handleGetSakamichiRanking(req: Request, env: Env, now = new Date()): Promise<Response> {
  const grp = new URL(req.url).searchParams.get('grp');
  if (grp !== null && !Object.hasOwn(EVENT_GROUPS, grp)) return error('invalid grp', 400);
  const rows = await env.MIGURI_DB.prepare(`SELECT p.public_name name,COUNT(DISTINCT m.date) days,COUNT(*) events
    FROM sakamichi_event_profiles p JOIN sakamichi_event_marks m ON m.user_id=p.user_id
    WHERE p.public_enabled=1 AND m.date<=?1 AND (?2 IS NULL OR m.grp=?2) GROUP BY p.user_id ORDER BY days DESC,events DESC,p.public_name,p.user_id LIMIT 50`)
    .bind(attendanceToday(now), grp).all<{ name: string; days: number; events: number }>();
  return json({ success: true, data: { ranking: rows.results.map((r, i, all) => ({ rank: all.findIndex(x => x.days === r.days) + 1, ...r })), asOf: attendanceToday(now) } }, 200, { 'Cache-Control': 'no-store' });
}
