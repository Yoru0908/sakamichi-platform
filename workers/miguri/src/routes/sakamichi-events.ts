// In-person / online events of the three groups for 46log /events (plan E4) and 46log's own 参加ログ marks on them (E5). The rows
// live in 坂ログ's events table (one Homeserver job, one Jev review queue, one venue list — plan A); this route reads one group's
// year through the SAKA46LOG service binding with a read-only token and caches it at the edge. Fields are listed explicitly:
// 坂ログ's attendee counts are its own users' data. Marks are 46log accounts' (miguri D1 sakamichi_event_marks, migration 014).

import type { Env } from '../types.ts';
import { error, json } from '../utils/response.ts';
import { getAuthUserId } from './preferences.ts';
import { parseSakamichiEventId } from '../../../shared/sakamichi-event-id.ts';

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
  const key = new Request(`${origin}${LIST_PATH}?grp=${q.grp}&year=${q.year}`), hit = await edge()?.match(key);
  if (hit) return hit;
  const res = await env.SAKA46LOG.fetch(`https://saka46log.com/internal/events?grp=${q.grp}&year=${q.year}`, {
    headers: { Authorization: `Bearer ${env.EVENTS_READ_TOKEN}` },
  });
  if (!res.ok) return error('events source unavailable', 502);
  const body = await res.json() as { data?: { events?: SourceEvent[] } }, events = (body.data?.events ?? []).map(publicEvent);
  // Past years change only on admin fixes and backfills; this year gains rows every morning (JST 06:20 job). An empty year is
  // most likely one not backfilled yet, so it must not stick for a day.
  const maxAge = !events.length ? 60 : q.year < jstYear(now) ? 86400 : 600;
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
