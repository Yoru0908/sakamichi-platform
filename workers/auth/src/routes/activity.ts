// 46log 活跃度 (2026-10-25): one beacon per page view with the visible time spent on it → Workers Analytics Engine
// (never D1: a write per page view must not touch the shared D1 quota). Only ACTIVITY_VIEWER_IDS can read the totals.
import type { Env } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, success } from '../utils/response';

const MAX_MS = 30 * 60 * 1000;
const VID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SITE = '46log.com';

const cookie = (req: Request, name: string) => req.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;

/** Production or a Pages preview. A missing / foreign Origin is a cross-site form, not our beacon. */
function beaconHost(origin: string | null, env: Env): string | null {
  if (!origin) return null;
  const allowed = env.CORS_ORIGIN.split(',').map(s => s.trim());
  if (!allowed.includes(origin) && !/^https:\/\/[a-z0-9-]+\.sakamichi-platform-test\.pages\.dev$/.test(origin)) return null;
  return new URL(origin).host;
}

// POST /api/user/activity — text/plain (sendBeacon), body {v, p, ms, n, b}. Always 204: a stats beacon never errors.
export async function handleActivityBeacon(req: Request, env: Env): Promise<Response> {
  const done = new Response(null, { status: 204 });
  try {
    const host = beaconHost(req.headers.get('Origin'), env);
    if (!host || !env.ACTIVITY) return done;
    const text = await req.text();
    if (text.length > 1024) return done;
    const b = JSON.parse(text) as { v?: unknown; p?: unknown; ms?: unknown; n?: unknown; b?: unknown };
    if (typeof b.v !== 'string' || !VID.test(b.v) || typeof b.p !== 'string' || !b.p.startsWith('/')) return done;
    // Pages serves /about and /about/ alike: one row per page.
    const path = (b.p.split(/[?#]/)[0].replace(/(.)\/+$/, '$1') || '/').slice(0, 200), ms = Math.min(Math.max(Math.round(Number(b.ms) || 0), 0), MAX_MS);
    const token = cookie(req, 'access_token'), user = token ? await verifyAccessToken(token, env.JWT_SECRET) : null;
    const device = /Mobi|Android|iPhone|iPad/i.test(req.headers.get('User-Agent') ?? '') ? 'mobile' : 'desktop';
    env.ACTIVITY.writeDataPoint({
      indexes: [b.v],
      blobs: [user?.sub ?? '', b.v, path, path.split('/')[1] || 'home', device, host, b.b === 1 ? '1' : '0'],
      doubles: [ms, b.n === 1 ? 1 : 0],
    });
  } catch { /* malformed beacon: drop it */ }
  return done;
}

type Row = Record<string, string | number>;
type Sql = (query: string) => Promise<Row[]>;

/** Workers Analytics Engine SQL API. 64-bit numbers may come back as strings: callers Number() them. */
const sqlApi = (env: Env): Sql => async query => {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: query,
  });
  if (!res.ok) throw new Error(`analytics_sql_${res.status}`);
  return ((await res.json()) as { data: Row[] }).data;
};

const JST_DAY = 'intDiv(toUInt32(timestamp) + 32400, 86400)';
const dayIso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);

/** Totals for the last `days` JST days of 46log.com, automated browsers excluded. Pure, so tests can feed it rows. */
export async function activityReport(sql: Sql, days: number, names: (ids: string[]) => Promise<Map<string, string | null>>) {
  const where = `FROM activity_46log WHERE timestamp > NOW() - INTERVAL '${days}' DAY AND blob6 = '${SITE}' AND blob7 = '0'`;
  const sum = `SUM(_sample_interval * double2) AS views, SUM(_sample_interval * double1) AS ms`;
  const [people, pages, sections] = await Promise.all([
    sql(`SELECT blob1 AS uid, blob2 AS vid, blob5 AS device, ${JST_DAY} AS day, ${sum} ${where} GROUP BY uid, vid, device, day FORMAT JSON`),
    sql(`SELECT blob3 AS path, ${sum} ${where} GROUP BY path ORDER BY views DESC LIMIT 30 FORMAT JSON`),
    sql(`SELECT blob4 AS section, ${sum} ${where} GROUP BY section ORDER BY views DESC LIMIT 20 FORMAT JSON`),
  ]);
  // A browser that was signed in once is that account's: the 15-minute access cookie often lapses before a long page ends.
  const owner = new Map<string, string>();
  for (const r of people) if (r.uid) owner.set(String(r.vid), String(r.uid));
  const person = (r: Row) => (r.uid ? `u:${r.uid}` : owner.has(String(r.vid)) ? `u:${owner.get(String(r.vid))}` : `v:${r.vid}`);

  const daily = new Map<number, { users: Set<string>; visitors: Set<string>; views: number; ms: number }>();
  const byPerson = new Map<string, { days: Set<number>; last: number; views: number; ms: number }>();
  const devices = { mobile: 0, desktop: 0 };
  for (const r of people) {
    const key = person(r), day = Number(r.day), views = Number(r.views), ms = Number(r.ms);
    const d = daily.get(day) ?? { users: new Set(), visitors: new Set(), views: 0, ms: 0 };
    (key.startsWith('u:') ? d.users : d.visitors).add(key); d.views += views; d.ms += ms; daily.set(day, d);
    const p = byPerson.get(key) ?? { days: new Set(), last: 0, views: 0, ms: 0 };
    p.days.add(day); p.last = Math.max(p.last, day); p.views += views; p.ms += ms; byPerson.set(key, p);
    devices[r.device === 'mobile' ? 'mobile' : 'desktop'] += views;
  }
  const everyone = [...byPerson.entries()], users = everyone.filter(([k]) => k.startsWith('u:'));
  const top = users.sort((a, b) => b[1].ms - a[1].ms).slice(0, 50);
  const nameOf = await names(top.map(([k]) => k.slice(2)));
  const total = (list: typeof everyone) => ({ people: list.length, returning: list.filter(([, p]) => p.days.size > 1).length, views: list.reduce((n, [, p]) => n + p.views, 0), ms: list.reduce((n, [, p]) => n + p.ms, 0) });
  const rows = (list: Row[], key: string) => list.map(r => ({ [key]: String(r[key]), views: Number(r.views), ms: Number(r.ms) }));
  return {
    days,
    summary: { users: total(users), visitors: total(everyone.filter(([k]) => k.startsWith('v:'))) },
    daily: [...daily.entries()].sort((a, b) => a[0] - b[0]).map(([day, d]) => ({ day: dayIso(day), users: d.users.size, visitors: d.visitors.size, views: d.views, ms: d.ms })),
    devices,
    users: top.map(([k, p]) => ({ id: k.slice(2), name: nameOf.get(k.slice(2)) ?? null, lastDay: dayIso(p.last), activeDays: p.days.size, views: p.views, ms: p.ms })),
    pages: rows(pages, 'path'),
    sections: rows(sections, 'section'),
  };
}

// GET /api/manage/activity?days=7|30|90 — admin role AND listed in ACTIVITY_VIEWER_IDS.
export async function handleActivityReport(req: Request, env: Env): Promise<Response> {
  const token = cookie(req, 'access_token'), payload = token ? await verifyAccessToken(token, env.JWT_SECRET) : null;
  const viewers = (env.ACTIVITY_VIEWER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!payload) return error('unauthorized', 401); // the site refreshes the 15-minute cookie and retries
  if (!viewers.includes(payload.sub)) return error('Forbidden', 403);
  const admin = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'admin'").bind(payload.sub).first();
  if (!admin) return error('Forbidden', 403);
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) return error('analytics_token_missing', 503);
  const days = [7, 30, 90].includes(Number(new URL(req.url).searchParams.get('days'))) ? Number(new URL(req.url).searchParams.get('days')) : 30;
  const names = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string | null>();
    const r = await env.DB.prepare(`SELECT id, display_name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: string; display_name: string | null }>();
    return new Map((r.results ?? []).map(u => [u.id, u.display_name]));
  };
  try { return success({ data: await activityReport(sqlApi(env), days, names) }); }
  catch (e) { console.error('[activity] report failed:', e instanceof Error ? e.message : e); return error('analytics_query_failed', 502); }
}
