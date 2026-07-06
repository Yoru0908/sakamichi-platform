import type { Env } from '../types.ts';
import { error, success } from '../utils/response.ts';
import { buildMiguriSyncPayload, fetchFortuneEventsWithDetails, type EnrichedFortuneEvent } from '../../../../src/utils/fortune-music.ts';
import { getAuthUser } from './preferences.ts';
import { syncAllConnectedMiguriGoogleCalendars } from './google-calendar.ts';
import { normalizeMiguriPayload, type MiguriSyncPayload } from './miguri.ts';

type MiguriSyncEvent = MiguriSyncPayload['events'][number];

class MiguriSyncProtectionError extends Error {
  anomalies: string[];

  constructor(anomalies: string[]) {
    super(`Miguri 同步保护已触发：${anomalies.join('；')}`);
    this.name = 'MiguriSyncProtectionError';
    this.anomalies = anomalies;
  }
}

function countUniqueMembers(event: { members?: string[] }): number {
  return new Set((event.members || []).map((member) => member.trim()).filter(Boolean)).size;
}

function normalizeNapcatEndpoint(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/send_group_msg') ? trimmed : `${trimmed}/send_group_msg`;
}

function parseNotifyGroups(value?: string): string[] {
  return (value || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isMiguriWeiboEnabled(env: Env): boolean {
  return env.MIGURI_WEIBO_ENABLED === 'true';
}

function groupHashtag(group: MiguriSyncEvent['group']): string {
  if (group === 'nogizaka') return '#乃木坂46#';
  if (group === 'hinatazaka') return '#日向坂46#';
  if (group === 'sakurazaka') return '#櫻坂46#';
  return '#坂道#';
}

function groupLabel(group: MiguriSyncEvent['group']): string {
  if (group === 'nogizaka') return '乃木坂46';
  if (group === 'hinatazaka') return '日向坂46';
  if (group === 'sakurazaka') return '櫻坂46';
  return '坂道';
}

async function publishMiguriWeibo(
  env: Env,
  payload: { text: string; category: string; meta?: Record<string, unknown> },
): Promise<void> {
  if (!isMiguriWeiboEnabled(env)) return;

  const webhookUrl = env.MIGURI_WEIBO_WEBHOOK_URL?.trim();
  const webhookSecret = env.MIGURI_WEIBO_WEBHOOK_SECRET?.trim()
    || env.MIGURI_ALERT_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !webhookSecret) {
    console.error('[Miguri] Weibo webhook is enabled but URL/secret is missing');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify({
        text: payload.text,
        category: payload.category,
        meta: payload.meta || {},
      }),
    });

    if (!response.ok) {
      console.error('[Miguri] Weibo publish webhook failed:', response.status, await response.text());
    }
  } catch (err) {
    console.error('[Miguri] Weibo publish webhook request failed:', err);
  }
}

async function notifyMiguriWebhook(env: Env, text: string, groups: string[]): Promise<boolean> {
  const webhookUrl = env.MIGURI_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return false;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (env.MIGURI_ALERT_WEBHOOK_SECRET?.trim()) {
    headers['x-webhook-secret'] = env.MIGURI_ALERT_WEBHOOK_SECRET.trim();
  }

  try {
    const payload = groups.length > 0
      ? { message: text, groupIds: groups }
      : { message: text };
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[Miguri] Webhook relay notification failed:', response.status, await response.text());
      return false;
    }
  } catch (err) {
    console.error('[Miguri] Webhook relay notification request failed:', err);
    return false;
  }

  return true;
}

async function notifyNapcat(env: Env, text: string): Promise<void> {
  const groups = parseNotifyGroups(env.NAPCAT_NOTIFY_GROUPS);
  if (await notifyMiguriWebhook(env, text, groups)) return;

  const baseUrl = env.NAPCAT_NOTIFY_URL?.trim();

  if (!baseUrl || groups.length === 0) return;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (env.NAPCAT_NOTIFY_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${env.NAPCAT_NOTIFY_TOKEN.trim()}`;
  }

  const endpoint = normalizeNapcatEndpoint(baseUrl);
  const results = await Promise.allSettled(groups.map((groupId) => fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      group_id: Number(groupId),
      message: [
        {
          type: 'text',
          data: { text },
        },
      ],
    }),
  })));

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.error('[Miguri] Napcat notification failed:', failures.length);
  }
}

async function notifyNewWindows(
  env: Env,
  newWindows: { eventSlug: string; label: string }[],
  payload: MiguriSyncPayload,
): Promise<void> {
  const groups = parseNotifyGroups(env.MIGURI_NEW_WINDOW_NOTIFY_GROUPS);

  const eventMap = new Map<string, MiguriSyncEvent>();
  for (const event of payload.events) {
    eventMap.set(event.slug, event);
  }

  const lines = newWindows.map((w) => {
    const title = eventMap.get(w.eventSlug)?.title || w.eventSlug;
    return `・${title}\n  ${w.label}`;
  });
  const shortLines = newWindows.map((w) => {
    const event = eventMap.get(w.eventSlug);
    return `・${event ? groupLabel(event.group) : '坂道'} ${w.eventSlug}\n  ${w.label}`;
  });

  const text = [
    '🎫 Miguri 新受付検出',
    ...lines,
  ].join('\n');

  if (groups.length > 0) {
    try {
      await notifyMiguriWebhook(env, text, groups);
    } catch (err) {
      console.error('[Miguri] New window notification failed:', err);
    }
  }

  const firstEvent = eventMap.get(newWindows[0]?.eventSlug || '');
  const hashtags = Array.from(new Set(
    newWindows
      .map((window) => eventMap.get(window.eventSlug)?.group)
      .filter((group): group is MiguriSyncEvent['group'] => Boolean(group))
      .map(groupHashtag),
  ));
  const weiboText = [
    '【ミーグリ新受付】',
    ...shortLines,
    '',
    firstEvent?.sourceUrl || 'https://46log.com/miguri',
    '',
    `${hashtags.join(' ')} #ミーグリ#`,
  ].join('\n');

  await publishMiguriWeibo(env, {
    text: weiboText,
    category: 'miguri_new_window',
    meta: { newWindows },
  });
}

function getWindowUrl(titleMap: Map<string, MiguriSyncEvent>, title: string): string {
  for (const event of titleMap.values()) {
    if (event.title === title) return event.sourceUrl;
  }
  return 'https://46log.com/miguri';
}

function parseJapaneseDateString(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function getTodayJST(): { year: number; month: number; day: number } {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate() };
}

async function notifyTodayWindows(
  env: Env,
  payload: MiguriSyncPayload,
): Promise<void> {
  const groups = parseNotifyGroups(env.MIGURI_NEW_WINDOW_NOTIFY_GROUPS);

  const today = getTodayJST();

  const eventMap = new Map<string, MiguriSyncEvent>();
  for (const event of payload.events) {
    eventMap.set(event.slug, event);
  }

  const todayWindows: { title: string; label: string; time: string; group: MiguriSyncEvent['group']; sourceUrl: string }[] = [];
  for (const event of payload.events) {
    for (const window of event.windows || []) {
      const parsed = parseJapaneseDateString(window.start || '');
      if (!parsed) continue;
      if (parsed.year === today.year && parsed.month === today.month && parsed.day === today.day) {
        const timeMatch = (window.start || '').match(/(\d{1,2}:\d{2})\s*$/);
        todayWindows.push({
          title: eventMap.get(event.slug)?.title || event.slug,
          label: window.label,
          time: timeMatch ? timeMatch[1] : '',
          group: event.group,
          sourceUrl: event.sourceUrl,
        });
      }
    }
  }

  if (todayWindows.length === 0) return;

  const lines = todayWindows.map((w) =>
    `・${w.title}\n  ${w.label}${w.time ? `（${w.time}〜）` : ''}`,
  );
  const shortLines = todayWindows.map((w) =>
    `・${groupLabel(w.group)}\n  ${w.label}${w.time ? `（${w.time}〜）` : ''}`,
  );

  const text = [
    '📅 本日の受付開始',
    ...lines,
  ].join('\n');

  if (groups.length > 0) {
    try {
      await notifyMiguriWebhook(env, text, groups);
    } catch (err) {
      console.error('[Miguri] Today window notification failed:', err);
    }
  }

  const hashtags = Array.from(new Set(todayWindows.map((window) => groupHashtag(window.group))));
  const firstUrl = todayWindows[0]?.sourceUrl || getWindowUrl(eventMap, todayWindows[0]?.title || '');
  const weiboText = [
    '【本日ミーグリ受付開始】',
    ...shortLines,
    '',
    firstUrl,
    '',
    `${hashtags.join(' ')} #ミーグリ#`,
  ].join('\n');

  await publishMiguriWeibo(env, {
    text: weiboText,
    category: 'miguri_today_window',
    meta: { todayWindows },
  });
}

async function loadExistingEventSnapshots(env: Env): Promise<Map<string, MiguriSyncEvent>> {
  const rows = await env.MIGURI_DB.prepare(`
    SELECT slug, raw_payload
    FROM miguri_events
    WHERE status != 'archived'
  `).all<{ slug: string; raw_payload: string | null }>();

  const snapshots = new Map<string, MiguriSyncEvent>();
  for (const row of rows.results || []) {
    if (!row.raw_payload) continue;
    try {
      const parsed = JSON.parse(row.raw_payload) as MiguriSyncEvent;
      if (parsed?.slug) snapshots.set(row.slug, parsed);
    } catch (err) {
      console.error('[Miguri] Failed to parse existing raw_payload for protection:', row.slug, err);
    }
  }
  return snapshots;
}

async function assertMiguriSyncPayloadSafe(env: Env, body: MiguriSyncPayload): Promise<void> {
  const anomalies: string[] = [];
  if (!body.events.length) {
    anomalies.push('最新抓取结果为空，已阻止覆盖 D1');
  }

  const existingSnapshots = await loadExistingEventSnapshots(env);
  for (const event of body.events) {
    const memberCount = countUniqueMembers(event);
    if (event.dates.length === 0) {
      anomalies.push(`${event.slug} 日期数量为 0`);
    }
    if (event.slots.length === 0) {
      anomalies.push(`${event.slug} 部数数量为 0`);
    }

    const existing = existingSnapshots.get(event.slug);
    if (!existing) {
      if (memberCount === 0) {
        anomalies.push(`${event.slug} 新活动成员数量为 0`);
      }
      continue;
    }

    const previousMemberCount = countUniqueMembers(existing);
    if (previousMemberCount >= 5 && memberCount === 0) {
      anomalies.push(`${event.slug} 成员数量从 ${previousMemberCount} 降到 0`);
      continue;
    }

    if (previousMemberCount >= 5 && previousMemberCount - memberCount >= 3 && memberCount < previousMemberCount * 0.6) {
      anomalies.push(`${event.slug} 成员数量从 ${previousMemberCount} 降到 ${memberCount}`);
    }
  }

  if (anomalies.length > 0) {
    throw new MiguriSyncProtectionError(Array.from(new Set(anomalies)));
  }
}

function buildMiguriAlertText(source: 'auto' | 'manual', message: string): string {
  return [
    '⚠️ Miguri 同步异常',
    `来源：${source === 'auto' ? '定时同步' : '手动同步'}`,
    message,
  ].join('\n');
}

async function authorizeManageRequest(req: Request, env: Env): Promise<boolean> {
  const syncSecret = req.headers.get('x-miguri-sync-secret');
  if (syncSecret && env.MIGURI_SYNC_SECRET && syncSecret === env.MIGURI_SYNC_SECRET) {
    return true;
  }

  const auth = await getAuthUser(req, env);
  return auth?.role === 'admin';
}

export type MiguriSyncResult = {
  eventCount: number;
  archivedEventCount: number;
  archivedEventSlugs: string[];
  windowCount: number;
  slotCount: number;
  slotMemberCount: number;
  newWindows?: { eventSlug: string; label: string }[];
};

async function batchExecute(db: D1Database, statements: D1PreparedStatement[], chunkSize = 80): Promise<void> {
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize));
  }
}

// ── Sold-out snapshot logic ──
// Before slot_members are replaced, compare old vs new to detect sold-out cells.

type SlotMemberCell = { eventSlug: string; eventDate: string; slotNumber: number; memberName: string };

function cellKey(cell: Pick<SlotMemberCell, 'eventDate' | 'slotNumber' | 'memberName'>): string {
  return `${cell.eventDate}::${cell.slotNumber}::${cell.memberName}`;
}

async function captureNewSoldOutCells(
  env: Env,
  eventSlug: string,
  incomingMembers: SlotMemberCell[],
  newWindowLabel: string,
): Promise<number> {
  // Load current (old) slot members for this event
  const oldRows = await env.MIGURI_DB.prepare(
    'SELECT event_date, slot_number, member_name FROM miguri_slot_members WHERE event_slug = ?',
  ).bind(eventSlug).all<{ event_date: string; slot_number: number; member_name: string }>();

  const oldCells = (oldRows.results || []);
  if (oldCells.length === 0) return 0; // first sync, nothing to compare

  const incomingSet = new Set(incomingMembers.map((m) => cellKey(m)));
  const oldSet = new Set(oldCells.map((c) => cellKey({ eventDate: c.event_date, slotNumber: c.slot_number, memberName: c.member_name })));

  // Cells that existed before but are NOT in the incoming data = newly sold out
  const newlySoldOut: SlotMemberCell[] = [];
  for (const cell of oldCells) {
    const key = cellKey({ eventDate: cell.event_date, slotNumber: cell.slot_number, memberName: cell.member_name });
    if (!incomingSet.has(key)) {
      newlySoldOut.push({
        eventSlug,
        eventDate: cell.event_date,
        slotNumber: cell.slot_number,
        memberName: cell.member_name,
      });
    }
  }

  if (newlySoldOut.length === 0) return 0;

  // Check if any cells were already recorded as sold-out for this event
  const existingSoldOutRow = await env.MIGURI_DB.prepare(
    'SELECT COALESCE(MAX(round_number), 0) as max_round FROM miguri_soldout_snapshots WHERE event_slug = ?',
  ).bind(eventSlug).first<{ max_round: number }>();
  const nextRound = (existingSoldOutRow?.max_round || 0) + 1;

  // Filter out cells already recorded in a previous round
  const alreadyRecordedRows = await env.MIGURI_DB.prepare(
    'SELECT event_date, slot_number, member_name FROM miguri_soldout_cells WHERE event_slug = ?',
  ).bind(eventSlug).all<{ event_date: string; slot_number: number; member_name: string }>();
  const alreadyRecorded = new Set(
    (alreadyRecordedRows.results || []).map((r) => cellKey({ eventDate: r.event_date, slotNumber: r.slot_number, memberName: r.member_name })),
  );

  const trulyNew = newlySoldOut.filter((c) => !alreadyRecorded.has(cellKey(c)));
  if (trulyNew.length === 0) return 0;

  // Record the snapshot
  await env.MIGURI_DB.prepare(`
    INSERT INTO miguri_soldout_snapshots (event_slug, round_number, window_label, member_count, cell_count)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    eventSlug,
    nextRound,
    newWindowLabel,
    new Set(trulyNew.map((c) => c.memberName)).size,
    trulyNew.length,
  ).run();

  // Record each sold-out cell
  const inserts = trulyNew.map((c) =>
    env.MIGURI_DB.prepare(`
      INSERT OR IGNORE INTO miguri_soldout_cells (event_slug, round_number, event_date, slot_number, member_name)
      VALUES (?, ?, ?, ?, ?)
    `).bind(eventSlug, nextRound, c.eventDate, c.slotNumber, c.memberName),
  );
  await batchExecute(env.MIGURI_DB, inserts);

  return trulyNew.length;
}

export async function persistMiguriSyncPayload(env: Env, body: MiguriSyncPayload): Promise<MiguriSyncResult> {
  await assertMiguriSyncPayloadSafe(env, body);
  const normalized = normalizeMiguriPayload(body);
  const now = new Date().toISOString();
  const incomingSlugs = normalized.events.map((event) => event.slug);
  const archivedSlugs = await archiveMissingEvents(env, incomingSlugs);

  const eventUpserts = normalized.events.map((event) =>
    env.MIGURI_DB.prepare(`
      INSERT INTO miguri_events (slug, group_id, title, source_url, sale_type, status, synced_at, raw_payload)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        group_id = excluded.group_id,
        title = excluded.title,
        source_url = excluded.source_url,
        sale_type = excluded.sale_type,
        status = 'active',
        synced_at = excluded.synced_at,
        raw_payload = excluded.raw_payload,
        updated_at = datetime('now')
    `).bind(
      event.slug,
      event.group,
      event.title,
      event.sourceUrl,
      event.saleType,
      now,
      JSON.stringify(event),
    ),
  );
  await batchExecute(env.MIGURI_DB, eventUpserts);

  const eventSlugs = normalized.events.map((event) => event.slug);

  // Detect new windows before deleting old data
  const existingWindowKeys = new Set<string>();
  for (const slug of eventSlugs) {
    const rows = await env.MIGURI_DB.prepare(
      'SELECT event_slug, label FROM miguri_event_windows WHERE event_slug = ?',
    ).bind(slug).all<{ event_slug: string; label: string }>();
    for (const row of rows.results || []) {
      existingWindowKeys.add(`${row.event_slug}::${row.label}`);
    }
  }
  const newWindows = normalized.windows.filter(
    (w) => !existingWindowKeys.has(`${w.eventSlug}::${w.label}`),
  );

  // ── Sold-out detection: compare old vs incoming slot_members BEFORE deleting ──
  for (const slug of eventSlugs) {
    const incomingForEvent = normalized.slotMembers.filter((sm) => sm.eventSlug === slug);
    // Determine which window just ended (use the latest new window label, or generic)
    const windowLabel = newWindows.find((w) => w.eventSlug === slug)?.label || '';
    try {
      await captureNewSoldOutCells(env, slug, incomingForEvent.map((sm) => ({
        eventSlug: sm.eventSlug,
        eventDate: sm.eventDate,
        slotNumber: sm.slotNumber,
        memberName: sm.memberName,
      })), windowLabel);
    } catch (err) {
      console.error('[Miguri] Sold-out snapshot failed for', slug, err);
    }
  }

  const deleteStatements = eventSlugs.flatMap((slug) => [
    env.MIGURI_DB.prepare('DELETE FROM miguri_event_windows WHERE event_slug = ?').bind(slug),
    env.MIGURI_DB.prepare('DELETE FROM miguri_slot_members WHERE event_slug = ?').bind(slug),
    env.MIGURI_DB.prepare('DELETE FROM miguri_event_slots WHERE event_slug = ?').bind(slug),
  ]);
  await batchExecute(env.MIGURI_DB, deleteStatements);

  const windowInserts = normalized.windows.map((window) =>
    env.MIGURI_DB.prepare(`
      INSERT INTO miguri_event_windows (event_slug, label, start_at, end_at, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(window.eventSlug, window.label, window.start, window.end, window.sortOrder),
  );
  await batchExecute(env.MIGURI_DB, windowInserts);

  const slotInserts = normalized.slots.map((slot) =>
    env.MIGURI_DB.prepare(`
      INSERT INTO miguri_event_slots (event_slug, event_date, slot_number, reception_start, start_time, reception_end, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      slot.eventSlug,
      slot.eventDate,
      slot.slotNumber,
      slot.receptionStart,
      slot.startTime,
      slot.receptionEnd,
      slot.endTime,
    ),
  );
  await batchExecute(env.MIGURI_DB, slotInserts);

  const slotMemberInserts = normalized.slotMembers.map((slotMember) =>
    env.MIGURI_DB.prepare(`
      INSERT INTO miguri_slot_members (event_slug, event_date, slot_number, member_name)
      VALUES (?, ?, ?, ?)
    `).bind(
      slotMember.eventSlug,
      slotMember.eventDate,
      slotMember.slotNumber,
      slotMember.memberName,
    ),
  );
  await batchExecute(env.MIGURI_DB, slotMemberInserts);

  return {
    eventCount: normalized.events.length,
    archivedEventCount: archivedSlugs.length,
    archivedEventSlugs: archivedSlugs,
    windowCount: normalized.windows.length,
    slotCount: normalized.slots.length,
    slotMemberCount: normalized.slotMembers.length,
    newWindows: newWindows.map((w) => ({ eventSlug: w.eventSlug, label: w.label })),
  };
}

export async function syncMiguriFromSource(
  env: Env,
  loadEvents: () => Promise<EnrichedFortuneEvent[]> = fetchFortuneEventsWithDetails,
): Promise<MiguriSyncResult> {
  try {
    const events = await loadEvents();
    const payload = buildMiguriSyncPayload(events);
    const result = await persistMiguriSyncPayload(env, payload);
    try {
      await syncAllConnectedMiguriGoogleCalendars(env);
    } catch (err) {
      console.error('[Miguri] Google Calendar bulk refresh failed after source sync:', err);
    }
    if (result.newWindows && result.newWindows.length > 0) {
      await notifyNewWindows(env, result.newWindows, payload);
    }
    await notifyTodayWindows(env, payload);
    return result;
  } catch (err) {
    const message = err instanceof MiguriSyncProtectionError
      ? buildMiguriAlertText('auto', err.anomalies.join('\n'))
      : buildMiguriAlertText('auto', err instanceof Error ? err.message : String(err));
    await notifyNapcat(env, message);
    throw err;
  }
}

export async function handleMiguriSync(req: Request, env: Env): Promise<Response> {
  const allowed = await authorizeManageRequest(req, env);
  if (!allowed) return error('权限不足', 403);

  let body: MiguriSyncPayload;
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  if (!body?.events || !Array.isArray(body.events)) {
    return error('缺少 events 数组', 400);
  }

  let result: MiguriSyncResult;
  try {
    result = await persistMiguriSyncPayload(env, body);
  } catch (err) {
    if (err instanceof MiguriSyncProtectionError) {
      await notifyNapcat(env, buildMiguriAlertText('manual', err.anomalies.join('\n')));
      return error(err.message, 409);
    }
    throw err;
  }
  try {
    await syncAllConnectedMiguriGoogleCalendars(env);
  } catch (err) {
    console.error('[Miguri] Google Calendar bulk refresh failed after manual sync:', err);
  }
  return success({ data: result });
}

export function diffArchivedEventSlugs(existingSlugs: string[], incomingSlugs: string[]): string[] {
  if (incomingSlugs.length === 0) return [];

  const incoming = new Set(incomingSlugs);
  return Array.from(new Set(existingSlugs)).filter((slug) => !incoming.has(slug));
}

/**
 * Import sold-out snapshot from client-side Fortune Music page scrape.
 * Accepts: { eventSlug, roundLabel, cells: [{ date, slot, member }] }
 * Cells represent ALL currently sold-out member×date×slot combos for that event.
 */
export async function handleMiguriSoldOutImport(req: Request, env: Env): Promise<Response> {
  // Allow server-to-server auth via sync secret, or normal user auth
  const syncSecret = req.headers.get('x-miguri-sync-secret');
  const isServerAuth = syncSecret && env.MIGURI_SYNC_SECRET && syncSecret === env.MIGURI_SYNC_SECRET;
  if (!isServerAuth) {
    const user = await getAuthUser(req, env);
    if (!user) return error('需要登录', 401);
  }

  let body: {
    eventSlug: string;
    roundNumber?: number;
    roundLabel?: string;
    cells: Array<{ date: string; slot: number; member: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  if (!body.eventSlug || !Array.isArray(body.cells)) {
    return error('缺少 eventSlug 或 cells', 400);
  }

  const eventSlug = body.eventSlug;

  // Determine round number: use explicit value if provided, otherwise auto-increment
  const lastSnapshot = await env.MIGURI_DB.prepare(
    'SELECT MAX(round_number) as maxRound FROM miguri_soldout_snapshots WHERE event_slug = ?',
  ).bind(eventSlug).first<{ maxRound: number | null }>();
  const roundNumber = body.roundNumber ?? (lastSnapshot?.maxRound ?? 0) + 1;

  // Get existing sold-out cells to find NEW ones
  const existingCells = await env.MIGURI_DB.prepare(
    'SELECT event_date, slot_number, member_name FROM miguri_soldout_cells WHERE event_slug = ?',
  ).bind(eventSlug).all<{ event_date: string; slot_number: number; member_name: string }>();

  const existingSet = new Set(
    (existingCells.results || []).map((c) => `${c.event_date}__${c.slot_number}__${c.member_name}`),
  );

  // Filter to only truly new cells
  const newCells = body.cells
    .map((c) => ({ date: c.date, slot: Number(c.slot), member: c.member.replace(/[\s\u3000]+/g, '') }))
    .filter((c) => c.date && c.slot > 0 && c.member)
    .filter((c) => !existingSet.has(`${c.date}__${c.slot}__${c.member}`));

  if (newCells.length === 0) {
    return success({ data: { roundNumber, newCells: 0, totalCells: existingSet.size, message: '没有新增完售' } });
  }

  // Insert snapshot
  await env.MIGURI_DB.prepare(
    'INSERT INTO miguri_soldout_snapshots (event_slug, round_number, window_label, member_count, cell_count) VALUES (?, ?, ?, ?, ?)',
  ).bind(
    eventSlug,
    roundNumber,
    body.roundLabel || `手动导入 Round ${roundNumber}`,
    new Set(newCells.map((c) => c.member)).size,
    newCells.length,
  ).run();

  // Insert new cells (use INSERT OR IGNORE to skip duplicates)
  for (const cell of newCells) {
    await env.MIGURI_DB.prepare(
      'INSERT OR IGNORE INTO miguri_soldout_cells (event_slug, round_number, event_date, slot_number, member_name) VALUES (?, ?, ?, ?, ?)',
    ).bind(eventSlug, roundNumber, cell.date, cell.slot, cell.member).run();
  }

  return success({
    data: {
      roundNumber,
      newCells: newCells.length,
      totalCells: existingSet.size + newCells.length,
    },
  });
}

async function archiveMissingEvents(env: Env, incomingSlugs: string[]): Promise<string[]> {
  const rows = await env.MIGURI_DB.prepare(`
    SELECT slug
    FROM miguri_events
    WHERE status != 'archived'
  `).all<{ slug: string }>();

  const existingSlugs = (rows.results || []).map((row) => row.slug);
  const archivedSlugs = diffArchivedEventSlugs(existingSlugs, incomingSlugs);
  if (archivedSlugs.length === 0) return [];

  const placeholders = archivedSlugs.map(() => '?').join(', ');
  await env.MIGURI_DB.prepare(`
    UPDATE miguri_events
    SET status = 'archived',
        updated_at = datetime('now')
    WHERE slug IN (${placeholders})
  `).bind(...archivedSlugs).run();

  return archivedSlugs;
}
