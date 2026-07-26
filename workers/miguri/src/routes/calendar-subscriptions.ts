import type { Env } from '../types.ts';
import { getAuthUserId } from './preferences.ts';
import { error, success } from '../utils/response.ts';
import {
  buildIcsCalendar,
  decodeHtmlEntities,
  normalizeCalendarDate,
  type CalendarEvent,
} from '../utils/ics.ts';

type MiguriGroup = 'nogizaka' | 'sakurazaka' | 'hinatazaka';
export type CalendarFeedGroup = MiguriGroup | 'all';

type SubscriptionRow = {
  user_id: string;
  subscription_id: string;
  token_version: number;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

const encoder = new TextEncoder();

function base64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function buildSubscriptionToken(
  subscriptionId: string,
  version: number,
  secret: string,
): Promise<string> {
  const payload = `${subscriptionId}.${version}`;
  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${base64url(signature)}`;
}

async function verifySubscriptionToken(
  token: string,
  secret: string,
): Promise<{ subscriptionId: string; version: number } | null> {
  const [subscriptionId, rawVersion, signature, ...extra] = token.split('.');
  const version = Number(rawVersion);
  const signatureBytes = base64urlDecode(signature || '');

  if (
    extra.length > 0
    || !/^[0-9a-f-]{36}$/i.test(subscriptionId || '')
    || !Number.isSafeInteger(version)
    || version < 1
    || !signatureBytes
  ) {
    return null;
  }

  const key = await getSigningKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(`${subscriptionId}.${version}`),
  );
  return valid ? { subscriptionId, version } : null;
}

function groupLabel(group: CalendarFeedGroup): string {
  if (group === 'nogizaka') return '乃木坂46';
  if (group === 'sakurazaka') return '櫻坂46';
  if (group === 'hinatazaka') return '日向坂46';
  return '坂道三团';
}

function calendarUrls(req: Request, token: string) {
  const origin = new URL(req.url).origin;
  const httpsUrl = `${origin}/api/miguri/calendar/personal/${token}.ics`;
  return {
    httpsUrl,
    webcalUrl: httpsUrl.replace(/^https:/, 'webcal:'),
  };
}

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, { status: response.status, headers });
}

async function subscriptionPayload(req: Request, env: Env, row: SubscriptionRow) {
  const token = await buildSubscriptionToken(row.subscription_id, row.token_version, env.JWT_SECRET);
  return {
    active: !row.revoked_at,
    ...calendarUrls(req, token),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadUserSubscription(env: Env, userId: string): Promise<SubscriptionRow | null> {
  return env.MIGURI_DB.prepare(`
    SELECT user_id, subscription_id, token_version, created_at, updated_at, revoked_at
    FROM miguri_calendar_subscriptions
    WHERE user_id = ?
  `).bind(userId).first<SubscriptionRow>();
}

async function createSubscription(env: Env, userId: string): Promise<SubscriptionRow> {
  const subscriptionId = crypto.randomUUID();
  await env.MIGURI_DB.prepare(`
    INSERT INTO miguri_calendar_subscriptions
      (user_id, subscription_id, token_version, created_at, updated_at, revoked_at)
    VALUES (?, ?, 1, datetime('now'), datetime('now'), NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      subscription_id = excluded.subscription_id,
      token_version = 1,
      updated_at = datetime('now'),
      revoked_at = NULL
  `).bind(userId, subscriptionId).run();

  const row = await loadUserSubscription(env, userId);
  if (!row) throw new Error('Failed to create Miguri calendar subscription');
  return row;
}

export async function handleGetCalendarSubscription(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('需要登录', 401);

  const row = await loadUserSubscription(env, userId);
  if (!row || row.revoked_at) {
    return noStore(success({ data: { active: false } }));
  }

  return noStore(success({ data: await subscriptionPayload(req, env, row) }));
}

export async function handleCreateCalendarSubscription(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('需要登录', 401);

  const existing = await loadUserSubscription(env, userId);
  const row = existing && !existing.revoked_at ? existing : await createSubscription(env, userId);
  return noStore(success(
    { data: await subscriptionPayload(req, env, row) },
    existing && !existing.revoked_at ? 200 : 201,
  ));
}

export async function handleRegenerateCalendarSubscription(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('需要登录', 401);

  const existing = await loadUserSubscription(env, userId);
  let row: SubscriptionRow;
  if (!existing || existing.revoked_at) {
    row = await createSubscription(env, userId);
  } else {
    const nextVersion = existing.token_version + 1;
    await env.MIGURI_DB.prepare(`
      UPDATE miguri_calendar_subscriptions
      SET token_version = ?, updated_at = datetime('now')
      WHERE user_id = ? AND token_version = ?
    `).bind(nextVersion, userId, existing.token_version).run();
    row = await loadUserSubscription(env, userId) || { ...existing, token_version: nextVersion };
  }

  return noStore(success({ data: await subscriptionPayload(req, env, row) }));
}

export async function handleRevokeCalendarSubscription(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('需要登录', 401);

  await env.MIGURI_DB.prepare(`
    UPDATE miguri_calendar_subscriptions
    SET revoked_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).bind(userId).run();
  return noStore(success({ data: { active: false } }));
}

export function icsResponse(body: string, filename: string, isPrivate = false): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': isPrivate ? 'private, no-store' : 'public, max-age=900, s-maxage=900',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function loadPersonalCalendarEvents(env: Env, userId: string): Promise<CalendarEvent[]> {
  const rows = await env.MIGURI_DB.prepare(`
    SELECT e.id, e.member_name, e.event_date, e.slot_number, e.tickets, e.updated_at,
           m.title AS event_title, m.group_id, m.source_url,
           s.start_time, s.end_time
    FROM miguri_user_entries e
    LEFT JOIN miguri_events m ON m.slug = e.event_slug
    LEFT JOIN miguri_event_slots s
      ON s.event_slug = e.event_slug AND s.event_date = e.event_date AND s.slot_number = e.slot_number
    WHERE e.user_id = ?
    ORDER BY e.event_date, e.slot_number, e.member_name
  `).bind(userId).all<any>();

  return (rows.results || [])
    .filter((row) => row.start_time && row.end_time && row.group_id)
    .map((row) => ({
      uid: `miguri-entry:${row.id}@46log.com`,
      title: `${groupLabel(row.group_id)} ミーグリ｜${row.member_name}｜第${row.slot_number}部（${row.tickets}枚）`,
      description: `${decodeHtmlEntities(row.event_title || 'Miguri')}\n第${row.slot_number}部\n${row.member_name} ${row.tickets}枚`,
      location: 'Fortune Music Online',
      startAt: `${row.event_date}T${row.start_time}:00+09:00`,
      endAt: `${row.event_date}T${row.end_time}:00+09:00`,
      url: row.source_url || undefined,
      updatedAt: row.updated_at || undefined,
    }));
}

export async function handleGetPersonalCalendar(
  req: Request,
  env: Env,
  rawToken: string,
): Promise<Response> {
  const token = await verifySubscriptionToken(rawToken, env.JWT_SECRET);
  if (!token) return error('订阅链接无效', 404);

  const row = await env.MIGURI_DB.prepare(`
    SELECT user_id, subscription_id, token_version, created_at, updated_at, revoked_at
    FROM miguri_calendar_subscriptions
    WHERE subscription_id = ? AND token_version = ? AND revoked_at IS NULL
  `).bind(token.subscriptionId, token.version).first<SubscriptionRow>();
  if (!row) return error('订阅链接已失效', 404);

  const events = await loadPersonalCalendarEvents(env, row.user_id);
  return icsResponse(buildIcsCalendar(events, {
    name: '我的 Miguri',
    description: '在 46log Miguri 中保存的个人行程',
    refreshInterval: 'PT6H',
  }), '46log-my-miguri.ics', true);
}

export async function handleGetLotteryCalendar(
  _req: Request,
  env: Env,
  group: string,
): Promise<Response> {
  if (!['all', 'all-groups', 'nogizaka', 'sakurazaka', 'hinatazaka'].includes(group)) {
    return error('未知的团体', 404);
  }
  const feedGroup: CalendarFeedGroup = group === 'all-groups'
    ? 'all'
    : group as CalendarFeedGroup;
  const events = await loadLotteryCalendarEvents(env, feedGroup);

  const label = groupLabel(feedGroup);
  return icsResponse(buildIcsCalendar(events, {
    name: `${label} Miguri 抽选受付`,
    description: `46log 自动更新的${label} Miguri 抽选受付时间`,
    refreshInterval: 'PT6H',
  }), `46log-miguri-lottery-${feedGroup}.ics`);
}

export async function loadLotteryCalendarEvents(
  env: Env,
  feedGroup: CalendarFeedGroup,
): Promise<CalendarEvent[]> {
  const query = feedGroup === 'all'
    ? `
      SELECT e.slug, e.group_id, e.title, e.source_url, e.sale_type, e.updated_at,
             w.label, w.start_at, w.end_at
      FROM miguri_events e
      INNER JOIN miguri_event_windows w ON w.event_slug = e.slug
      WHERE e.status != 'archived'
      ORDER BY w.start_at, e.group_id, e.slug, w.sort_order
    `
    : `
      SELECT e.slug, e.group_id, e.title, e.source_url, e.sale_type, e.updated_at,
             w.label, w.start_at, w.end_at
      FROM miguri_events e
      INNER JOIN miguri_event_windows w ON w.event_slug = e.slug
      WHERE e.status != 'archived' AND e.group_id = ?
      ORDER BY w.start_at, e.slug, w.sort_order
    `;
  const rows = feedGroup === 'all'
    ? await env.MIGURI_DB.prepare(query).all<any>()
    : await env.MIGURI_DB.prepare(query).bind(feedGroup).all<any>();

  const events: CalendarEvent[] = [];
  for (const row of rows.results || []) {
    const startAt = normalizeCalendarDate(row.start_at);
    const endAt = normalizeCalendarDate(row.end_at);
    if (!startAt || !endAt) {
      console.warn('[Miguri Calendar] skipped invalid reception window:', row.slug, row.label);
      continue;
    }

    const label = decodeHtmlEntities(row.label);
    const title = decodeHtmlEntities(row.title);
    events.push({
      uid: `miguri-window:${row.slug}:${label}@46log.com`,
      title: `${groupLabel(row.group_id)} ミーグリ｜${label}`,
      description: [
        title,
        row.sale_type ? `販売方式：${decodeHtmlEntities(row.sale_type)}` : '',
        `受付期間：${row.start_at} ～ ${row.end_at}`,
        row.source_url ? `公式ページ：${row.source_url}` : '',
      ].filter(Boolean).join('\n'),
      location: 'Fortune Music Online',
      startAt,
      endAt,
      url: row.source_url || undefined,
      updatedAt: row.updated_at || undefined,
    });
  }
  events.sort((left, right) => (
    new Date(left.startAt).getTime() - new Date(right.startAt).getTime()
    || left.uid.localeCompare(right.uid, 'ja')
  ));
  return events;
}
