// In-person / online events of the three groups for 46log /events (plan E4). The rows live in 坂ログ's events table (one Homeserver
// job, one Jev review queue, one venue list — plan A); this route reads one group's year through the SAKA46LOG service binding with
// a read-only token and caches it at the edge. Fields are listed explicitly: 坂ログ's attendee counts are its own users' data.

import type { Env } from '../types.ts';
import { error, json } from '../utils/response.ts';

/** First year on each official schedule: Nogizaka 2011-08, Sakurazaka 2020-10 (改名), Hinatazaka 2019-02 (改名). */
export const EVENT_GROUPS = { nogizaka: 2011, sakurazaka: 2020, hinatazaka: 2019 } as const;
export type EventGroup = keyof typeof EVENT_GROUPS;

type SourceEvent = {
  id: string; date: string; title: string; kind: string; category: 'attend' | 'online';
  shows: { label: string; start: string }[]; members: { id: string; name: string }[]; wholeGroup: boolean; sourceUrl: string;
  venue: { id: number; name: string; prefecture: string | null } | null;
};

const jstYear = (now: Date) => new Date(now.getTime() + 9 * 3600e3).getUTCFullYear();

/** grp and year from the query, or null (unknown group, or a year before the group's first / after next year). */
export function eventsQuery(url: URL, now = new Date()): { grp: EventGroup; year: number } | null {
  const grp = url.searchParams.get('grp') ?? '', year = Number(url.searchParams.get('year'));
  if (!Object.hasOwn(EVENT_GROUPS, grp)) return null;
  const first = EVENT_GROUPS[grp as EventGroup];
  return Number.isInteger(year) && year >= first && year <= jstYear(now) + 1 ? { grp: grp as EventGroup, year } : null;
}

const publicEvent = (e: SourceEvent) => ({
  id: e.id, date: e.date, title: e.title, kind: e.kind, category: e.category, shows: e.shows, members: e.members,
  wholeGroup: e.wholeGroup, sourceUrl: e.sourceUrl, venue: e.venue,
});

export async function handleGetSakamichiEvents(req: Request, env: Env, now = new Date()): Promise<Response> {
  const url = new URL(req.url), q = eventsQuery(url, now);
  if (!q) return error('invalid grp or year', 400);
  if (!env.SAKA46LOG || !env.EVENTS_READ_TOKEN) return error('events source not configured', 503);

  const cache = typeof caches === 'undefined' ? null : caches.default;
  const key = new Request(`${url.origin}${url.pathname}?grp=${q.grp}&year=${q.year}`);
  const hit = await cache?.match(key);
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
  await cache?.put(key, out.clone());
  return out;
}
