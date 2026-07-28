import type { Env } from '../types.ts';
import { getAuthUserId, getUserMemberPreferences } from './preferences.ts';
import { error, success } from '../utils/response.ts';
import {
  deleteMiguriEntryFromGoogleCalendar,
  loadGoogleCalendarSyncStatus,
  syncMiguriEntriesToGoogleCalendar,
  syncMiguriEntryToGoogleCalendar,
} from './google-calendar.ts';
import { fetchFortuneMeetsAnalysis } from '../utils/fortunemeets.ts';
import {
  buildIcsCalendar,
  decodeHtmlEntities,
  toUtcCalendarString,
  type CalendarEvent,
} from '../utils/ics.ts';

export { buildIcsCalendar } from '../utils/ics.ts';

export type MiguriWindow = {
  label: string;
  start: string;
  end: string;
};

export type MiguriSyncSlot = {
  slotNumber: number;
  receptionStart: string;
  startTime: string;
  receptionEnd: string;
  endTime: string;
};

export type MiguriSyncEvent = {
  slug: string;
  group: 'nogizaka' | 'hinatazaka' | 'sakurazaka';
  title: string;
  sourceUrl: string;
  saleType: string;
  windows: MiguriWindow[];
  dates: string[];
  slots: MiguriSyncSlot[];
  members: string[];
};

export type MiguriSyncPayload = {
  events: MiguriSyncEvent[];
};

type NormalizedWindow = MiguriWindow & {
  eventSlug: string;
  sortOrder: number;
};

type NormalizedSlot = MiguriSyncSlot & {
  eventSlug: string;
  eventDate: string;
};

type NormalizedSlotMember = {
  eventSlug: string;
  eventDate: string;
  slotNumber: number;
  memberName: string;
};

type MiguriEntryStatus = 'planned' | 'won' | 'paid';

function normalizeMemberName(name: string): string {
  return name.replace(/[\s\u3000]+/g, '').trim();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function toGroupLabel(group: MiguriSyncEvent['group']): string {
  if (group === 'nogizaka') return '乃木坂46';
  if (group === 'hinatazaka') return '日向坂46';
  return '櫻坂46';
}

function nanoid(size = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  for (const byte of bytes) id += chars[byte % chars.length];
  return id;
}

function buildCalendarEvent(entry: {
  id: string;
  memberName: string;
  eventDate: string;
  slotNumber: number;
  tickets: number;
  eventTitle: string | null;
  groupId: MiguriSyncEvent['group'];
  startTime: string | null;
  endTime: string | null;
  sourceUrl?: string;
  updatedAt?: string;
  category?: string | null;
  venue?: string | null;
}): CalendarEvent {
  const category = entry.category || 'ミーグリ';
  const unit = category === 'サイン会' ? '口' : '枚';
  const slotLabel = entry.slotNumber > 0 ? `第${entry.slotNumber}部` : '部数未指定';
  const base = {
    uid: `miguri-entry:${entry.id}@46log.com`,
    title: `${toGroupLabel(entry.groupId)} ${category}｜${entry.memberName}｜${entry.tickets}${unit}`,
    description: `${decodeHtmlEntities(entry.eventTitle || 'Miguri')}\n${slotLabel}\n${entry.memberName} ${entry.tickets}${unit}`,
    location: entry.venue || 'Fortune Music Online',
    url: entry.sourceUrl,
    updatedAt: entry.updatedAt,
  };

  if (!entry.startTime || !entry.endTime) {
    const [year, month, day] = entry.eventDate.split('-').map(Number);
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    return {
      ...base,
      startAt: entry.eventDate,
      endAt: nextDay,
      allDay: true,
    };
  }

  return {
    ...base,
    startAt: `${entry.eventDate}T${entry.startTime}:00+09:00`,
    endAt: `${entry.eventDate}T${entry.endTime}:00+09:00`,
  };
}

export function buildGoogleCalendarUrl(event: Omit<CalendarEvent, 'uid'>): string {
  const dates = event.allDay
    ? `${event.startAt.replaceAll('-', '')}/${event.endAt.replaceAll('-', '')}`
    : `${toUtcCalendarString(event.startAt).replace(/\.\d+Z$/, 'Z')}/${toUtcCalendarString(event.endAt).replace(/\.\d+Z$/, 'Z')}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: event.description,
    location: event.location,
    dates,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function normalizeMiguriPayload(payload: MiguriSyncPayload): {
  events: MiguriSyncEvent[];
  windows: NormalizedWindow[];
  slots: NormalizedSlot[];
  slotMembers: NormalizedSlotMember[];
} {
  const events = payload.events.map((event) => ({
    ...event,
    dates: unique(event.dates.filter(Boolean)).sort(),
    slots: [...event.slots].sort((left, right) => left.slotNumber - right.slotNumber),
    members: unique(event.members.map(normalizeMemberName).filter(Boolean)),
  }));

  const windows = events.flatMap((event) => event.windows.map((window, index) => ({
    ...window,
    eventSlug: event.slug,
    sortOrder: index,
  })));

  const slots = events.flatMap((event) => event.dates.flatMap((eventDate) => event.slots.map((slot) => ({
    ...slot,
    eventSlug: event.slug,
    eventDate,
  }))));

  const slotMembers = events.flatMap((event) =>
    event.dates.flatMap((eventDate) =>
      event.slots.flatMap((slot) =>
        event.members.map((memberName) => ({
          eventSlug: event.slug,
          eventDate,
          slotNumber: slot.slotNumber,
          memberName,
        })),
      ),
    ),
  );

  return { events, windows, slots, slotMembers };
}

async function loadFavorites(req: Request, env: Env): Promise<string[]> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return [];
  const prefs = await getUserMemberPreferences(env, userId, { includeFollowedMembers: false });

  const favoriteRows = await env.DB.prepare(
    'SELECT member_name, added_at FROM user_favorites WHERE user_id = ? ORDER BY added_at, member_name',
  ).bind(userId).all<{ member_name: string; added_at: string }>();

  return unique([
    normalizeMemberName(prefs.oshiMember || ''),
    ...(favoriteRows.results || []).map((row) => normalizeMemberName(row.member_name)),
  ].filter(Boolean));
}

function mapEntryRow(row: any) {
  return {
    id: row.id,
    eventSlug: row.event_slug,
    eventTitle: row.event_title,
    group: row.group_id,
    member: row.member_name,
    date: row.event_date,
    slot: row.slot_number,
    tickets: row.tickets,
    status: row.status,
    startTime: row.start_time,
    endTime: row.end_time,
    source: row.source || 'manual',
    sourceKey: row.source_key || null,
    category: row.category || null,
    venue: row.venue || null,
    appliedTickets: row.applied_tickets ?? 0,
    wonTickets: row.won_tickets ?? 0,
    paidTickets: row.paid_tickets ?? 0,
  };
}

const ENTRY_SELECT_COLUMNS = `e.id, e.event_slug, e.member_name, e.event_date, e.slot_number, e.tickets, e.status,
           e.source, e.source_key, e.category, e.venue, e.applied_tickets, e.won_tickets, e.paid_tickets,
           COALESCE(m.title, e.import_title) AS event_title,
           COALESCE(m.group_id, e.import_group) AS group_id,
           s.start_time, s.end_time`;

type EventResponseShape = {
  slug: string;
  group: MiguriSyncEvent['group'];
  title: string;
  sourceUrl: string;
  saleType: string;
  windows: MiguriWindow[];
  dates: string[];
  members: string[];
  slots: Array<{
    date: string;
    slotNumber: number;
    receptionStart: string;
    startTime: string;
    receptionEnd: string;
    endTime: string;
    members: string[];
  }>;
  syncedAt: string;
};

async function loadEntries(env: Env, userId: string | null) {
  if (!userId) return [];
  const rows = await env.MIGURI_DB.prepare(`
    SELECT ${ENTRY_SELECT_COLUMNS}
    FROM miguri_user_entries e
    LEFT JOIN miguri_events m ON m.slug = e.event_slug
    LEFT JOIN miguri_event_slots s
      ON s.event_slug = e.event_slug AND s.event_date = e.event_date AND s.slot_number = e.slot_number
    WHERE e.user_id = ?
    ORDER BY e.event_date, e.slot_number, e.member_name
  `).bind(userId).all<any>();

  return (rows.results || []).map(mapEntryRow);
}

async function loadEntryById(env: Env, userId: string, entryId: string) {
  const rows = await env.MIGURI_DB.prepare(`
    SELECT ${ENTRY_SELECT_COLUMNS}
    FROM miguri_user_entries e
    LEFT JOIN miguri_events m ON m.slug = e.event_slug
    LEFT JOIN miguri_event_slots s
      ON s.event_slug = e.event_slug AND s.event_date = e.event_date AND s.slot_number = e.slot_number
    WHERE e.id = ? AND e.user_id = ?
  `).bind(entryId, userId).all<any>();

  const row = rows.results?.[0];
  return row ? mapEntryRow(row) : null;
}

async function loadEventResponse(env: Env) {
  const [eventsResult, windowsResult, slotsResult, membersResult] = await Promise.all([
    env.MIGURI_DB.prepare(`
      SELECT slug, group_id, title, source_url, sale_type, status, synced_at, raw_payload
      FROM miguri_events
      WHERE status != 'archived'
      ORDER BY synced_at DESC, slug DESC
    `).all<any>(),
    env.MIGURI_DB.prepare(`
      SELECT event_slug, label, start_at, end_at, sort_order
      FROM miguri_event_windows
      ORDER BY event_slug, sort_order, start_at
    `).all<any>(),
    env.MIGURI_DB.prepare(`
      SELECT event_slug, event_date, slot_number, reception_start, start_time, reception_end, end_time
      FROM miguri_event_slots
      ORDER BY event_slug, event_date, slot_number
    `).all<any>(),
    env.MIGURI_DB.prepare(`
      SELECT event_slug, event_date, slot_number, member_name
      FROM miguri_slot_members
      ORDER BY event_slug, event_date, slot_number, member_name
    `).all<any>(),
  ]);

  const slotMemberMap = new Map<string, string[]>();
  for (const row of membersResult.results || []) {
    const key = `${row.event_slug}__${row.event_date}__${row.slot_number}`;
    const list = slotMemberMap.get(key) || [];
    list.push(row.member_name);
    slotMemberMap.set(key, list);
  }

  const eventMap = new Map<string, EventResponseShape>();
  for (const row of eventsResult.results || []) {
    const rawPayload = (() => {
      try {
        return row.raw_payload ? JSON.parse(row.raw_payload) : null;
      } catch {
        return null;
      }
    })();

    eventMap.set(row.slug, {
      slug: row.slug,
      group: row.group_id,
      title: row.title,
      sourceUrl: row.source_url,
      saleType: row.sale_type,
      windows: [],
      dates: Array.isArray(rawPayload?.dates) ? rawPayload.dates.filter((value: unknown): value is string => typeof value === 'string') : [],
      members: Array.isArray(rawPayload?.members) ? rawPayload.members.filter((value: unknown): value is string => typeof value === 'string') : [],
      slots: [],
      syncedAt: row.synced_at,
    });
  }

  for (const row of windowsResult.results || []) {
    const event = eventMap.get(row.event_slug);
    if (!event) continue;
    event.windows.push({
      label: row.label,
      start: row.start_at,
      end: row.end_at,
    });
  }

  for (const row of slotsResult.results || []) {
    const event = eventMap.get(row.event_slug);
    if (!event) continue;
    event.dates.push(row.event_date);
    event.slots.push({
      date: row.event_date,
      slotNumber: row.slot_number,
      receptionStart: row.reception_start,
      startTime: row.start_time,
      receptionEnd: row.reception_end,
      endTime: row.end_time,
      members: slotMemberMap.get(`${row.event_slug}__${row.event_date}__${row.slot_number}`) || [],
    });
  }

  for (const event of eventMap.values()) {
    event.dates = unique(event.dates).sort();
    const slotMembers = unique(event.slots.flatMap((slot) => slot.members)).sort((left, right) => left.localeCompare(right, 'ja'));
    event.members = slotMembers.length > 0
      ? slotMembers
      : unique(event.members).sort((left, right) => left.localeCompare(right, 'ja'));
  }

  return Array.from(eventMap.values());
}

export async function handleGetMiguriEvents(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  const [events, favorites, entries, googleCalendar] = await Promise.all([
    loadEventResponse(env),
    loadFavorites(req, env),
    loadEntries(env, userId),
    loadGoogleCalendarSyncStatus(env, userId),
  ]);

  return success({
    data: {
      events,
      favorites,
      entries,
      googleCalendar,
    },
  });
}

export async function handleCreateMiguriEntries(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('需要登录', 401);

  let body: {
    eventSlug: string;
    date: string;
    slots: number[];
    members: string[];
    tickets: number;
    status: MiguriEntryStatus;
  };

  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  if (!body.eventSlug || !body.date || !Array.isArray(body.slots) || !Array.isArray(body.members)) {
    return error('缺少必要字段', 400);
  }

  if (body.slots.length === 0 || body.members.length === 0) {
    return error('至少选择一个部数和成员', 400);
  }

  const tickets = Math.max(1, Number(body.tickets || 1));
  const status: MiguriEntryStatus = ['planned', 'won', 'paid'].includes(body.status) ? body.status : 'planned';
  const normalizedSlots = unique(body.slots.map(Number)).filter((slot) => Number.isFinite(slot) && slot > 0);
  const normalizedMembers = unique(body.members.map(normalizeMemberName)).filter(Boolean);

  if (normalizedSlots.length === 0 || normalizedMembers.length === 0) {
    return error('至少选择一个有效部数和成员', 400);
  }

  for (const slotNumber of normalizedSlots) {
    const slotExists = await env.MIGURI_DB.prepare(
      'SELECT 1 FROM miguri_event_slots WHERE event_slug = ? AND event_date = ? AND slot_number = ?',
    ).bind(body.eventSlug, body.date, slotNumber).first();

    if (!slotExists) {
      return error(`目标部数不存在：第 ${slotNumber} 部`, 400);
    }

    for (const memberName of normalizedMembers) {
      const memberExists = await env.MIGURI_DB.prepare(
        'SELECT 1 FROM miguri_slot_members WHERE event_slug = ? AND event_date = ? AND slot_number = ? AND member_name = ?',
      ).bind(body.eventSlug, body.date, slotNumber, memberName).first();

      if (!memberExists) {
        return error(`成员 ${memberName} 不在 ${body.date} 第 ${slotNumber} 部中`, 400);
      }
    }
  }

  const affectedIds: string[] = [];

  for (const slotNumber of normalizedSlots) {
    for (const memberName of normalizedMembers) {
      const existing = await env.MIGURI_DB.prepare(
        'SELECT id, tickets FROM miguri_user_entries WHERE user_id = ? AND event_slug = ? AND event_date = ? AND slot_number = ? AND member_name = ?',
      ).bind(userId, body.eventSlug, body.date, slotNumber, memberName).first<{ id: string; tickets: number }>();

      if (existing) {
        await env.MIGURI_DB.prepare(
          'UPDATE miguri_user_entries SET tickets = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?',
        ).bind(existing.tickets + tickets, status, existing.id).run();
        affectedIds.push(existing.id);
      } else {
        const id = nanoid();
        affectedIds.push(id);
        await env.MIGURI_DB.prepare(`
          INSERT INTO miguri_user_entries (id, user_id, event_slug, member_name, event_date, slot_number, tickets, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, userId, body.eventSlug, memberName, body.date, slotNumber, tickets, status).run();
      }
    }
  }

  const placeholders = affectedIds.map(() => '?').join(', ');
  const rows = affectedIds.length === 0
    ? { results: [] }
    : await env.MIGURI_DB.prepare(`
        SELECT ${ENTRY_SELECT_COLUMNS}
        FROM miguri_user_entries e
        LEFT JOIN miguri_events m ON m.slug = e.event_slug
        LEFT JOIN miguri_event_slots s
          ON s.event_slug = e.event_slug AND s.event_date = e.event_date AND s.slot_number = e.slot_number
        WHERE e.id IN (${placeholders})
        ORDER BY e.event_date, e.slot_number, e.member_name
      `).bind(...affectedIds).all<any>();

  try {
    await syncMiguriEntriesToGoogleCalendar(env, userId, affectedIds);
  } catch (err) {
    console.error('[Miguri] Google Calendar sync failed after create:', err);
  }

  return success({
    data: {
      entries: (rows.results || []).map(mapEntryRow),
    },
  }, 201);
}

export async function handleUpdateMiguriEntry(req: Request, env: Env, entryId: string): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('需要登录', 401);

  let body: {
    member: string;
    date: string;
    slot: number;
    tickets: number;
    status: MiguriEntryStatus;
  };

  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  const existing = await env.MIGURI_DB.prepare(
    'SELECT id, event_slug FROM miguri_user_entries WHERE id = ? AND user_id = ?',
  ).bind(entryId, userId).first<{ id: string; event_slug: string }>();

  if (!existing) return error('记录不存在', 404);

  const memberName = normalizeMemberName(body.member || '');
  const eventDate = `${body.date || ''}`.trim();
  const slotNumber = Number(body.slot);
  const tickets = Math.max(1, Number(body.tickets || 1));
  const status: MiguriEntryStatus = ['planned', 'won', 'paid'].includes(body.status) ? body.status : 'planned';

  if (!memberName || !eventDate || !Number.isFinite(slotNumber) || slotNumber <= 0) {
    return error('缺少必要字段', 400);
  }

  const slotExists = await env.MIGURI_DB.prepare(
    'SELECT 1 FROM miguri_event_slots WHERE event_slug = ? AND event_date = ? AND slot_number = ?',
  ).bind(existing.event_slug, eventDate, slotNumber).first();

  if (!slotExists) return error('目标部数不存在', 400);

  const memberExists = await env.MIGURI_DB.prepare(
    'SELECT 1 FROM miguri_slot_members WHERE event_slug = ? AND event_date = ? AND slot_number = ? AND member_name = ?',
  ).bind(existing.event_slug, eventDate, slotNumber, memberName).first();

  if (!memberExists) return error('该成员不在目标部数中', 400);

  await env.MIGURI_DB.prepare(`
    UPDATE miguri_user_entries
    SET member_name = ?,
        event_date = ?,
        slot_number = ?,
        tickets = ?,
        status = ?,
        updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).bind(memberName, eventDate, slotNumber, tickets, status, entryId, userId).run();

  const entry = await loadEntryById(env, userId, entryId);
  if (!entry) return error('记录不存在', 404);

  try {
    await syncMiguriEntryToGoogleCalendar(env, userId, entryId);
  } catch (err) {
    console.error('[Miguri] Google Calendar sync failed after update:', err);
  }

  return success({
    data: {
      entry,
    },
  });
}

export async function handleDeleteMiguriEntry(req: Request, env: Env, entryId: string): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('需要登录', 401);

  const row = await env.MIGURI_DB.prepare(
    'SELECT id FROM miguri_user_entries WHERE id = ? AND user_id = ?',
  ).bind(entryId, userId).first();
  if (!row) return error('记录不存在', 404);

  try {
    await deleteMiguriEntryFromGoogleCalendar(env, userId, entryId);
  } catch (err) {
    console.error('[Miguri] Google Calendar delete sync failed:', err);
  }

  await env.MIGURI_DB.prepare('DELETE FROM miguri_user_entries WHERE id = ? AND user_id = ?')
    .bind(entryId, userId).run();

  return success({ message: '已删除' });
}

async function loadCalendarEvents(req: Request, env: Env, entryId?: string | null) {
  const userId = await getAuthUserId(req, env);
  if (!userId) return null;

  const sql = `
    SELECT e.id, e.event_slug, e.member_name, e.event_date, e.slot_number, e.tickets, e.updated_at,
           e.category, e.venue,
           COALESCE(m.title, e.import_title) AS event_title,
           COALESCE(m.group_id, e.import_group) AS group_id,
           m.source_url,
           s.start_time, s.end_time
    FROM miguri_user_entries e
    LEFT JOIN miguri_events m ON m.slug = e.event_slug
    LEFT JOIN miguri_event_slots s
      ON s.event_slug = e.event_slug AND s.event_date = e.event_date AND s.slot_number = e.slot_number
    WHERE e.user_id = ?
      AND (e.status IN ('won', 'paid') OR COALESCE(e.source, 'manual') = 'manual')
      ${entryId ? 'AND e.id = ?' : ''}
    ORDER BY e.event_date, e.slot_number, e.member_name
  `;

  const rows = entryId
    ? await env.MIGURI_DB.prepare(sql).bind(userId, entryId).all<any>()
    : await env.MIGURI_DB.prepare(sql).bind(userId).all<any>();

  return (rows.results || [])
    .filter((row) => row.group_id)
    .map((row) => buildCalendarEvent({
      id: row.id,
      memberName: row.member_name,
      eventDate: row.event_date,
      slotNumber: row.slot_number,
      tickets: row.tickets,
      eventTitle: row.event_title || row.event_slug || 'Miguri',
      groupId: row.group_id,
      startTime: row.start_time,
      endTime: row.end_time,
      sourceUrl: row.source_url || undefined,
      updatedAt: row.updated_at || undefined,
      category: row.category,
      venue: row.venue,
    }));
}

export async function handleGetMiguriCalendarIcs(req: Request, env: Env): Promise<Response> {
  const events = await loadCalendarEvents(req, env);
  if (events === null) return error('需要登录', 401);

  return new Response(buildIcsCalendar(events, {
    name: '我的 Miguri',
    description: '在 46log Miguri 中保存的个人行程',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="miguri.ics"',
    },
  });
}

export async function handleGetMiguriGoogleCalendarUrl(req: Request, env: Env): Promise<Response> {
  const entryId = new URL(req.url).searchParams.get('entryId');
  if (!entryId) return error('缺少 entryId', 400);

  const events = await loadCalendarEvents(req, env, entryId);
  if (events === null) return error('需要登录', 401);
  if (events.length === 0) return error('记录不存在', 404);

  const { uid: _uid, ...event } = events[0];
  return success({
    data: {
      url: buildGoogleCalendarUrl(event),
    },
  });
}

// ── Sold-out analysis endpoint ──

export async function handleGetMiguriSoldOut(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const eventSlug = url.searchParams.get('event');
  if (!eventSlug) return error('缺少 event 参数', 400);

  // Load event metadata
  const eventRow = await env.MIGURI_DB.prepare(
    'SELECT slug, group_id, title, source_url FROM miguri_events WHERE slug = ?',
  ).bind(eventSlug).first<{ slug: string; group_id: string; title: string; source_url: string }>();
  if (!eventRow) return error('活动不存在', 404);

  // Load snapshots (rounds)
  const snapshotRows = await env.MIGURI_DB.prepare(
    'SELECT round_number, window_label, captured_at, member_count, cell_count FROM miguri_soldout_snapshots WHERE event_slug = ? ORDER BY round_number',
  ).bind(eventSlug).all<{ round_number: number; window_label: string; captured_at: string; member_count: number; cell_count: number }>();

  // Load all sold-out cells
  const cellRows = await env.MIGURI_DB.prepare(
    'SELECT round_number, event_date, slot_number, member_name FROM miguri_soldout_cells WHERE event_slug = ? ORDER BY round_number, event_date, slot_number, member_name',
  ).bind(eventSlug).all<{ round_number: number; event_date: string; slot_number: number; member_name: string }>();

  // Load current slot structure (dates, slots, members)
  const slotRows = await env.MIGURI_DB.prepare(
    'SELECT DISTINCT event_date, slot_number FROM miguri_event_slots WHERE event_slug = ? ORDER BY event_date, slot_number',
  ).bind(eventSlug).all<{ event_date: string; slot_number: number }>();

  const memberRows = await env.MIGURI_DB.prepare(
    'SELECT DISTINCT member_name FROM miguri_slot_members WHERE event_slug = ? UNION SELECT DISTINCT member_name FROM miguri_soldout_cells WHERE event_slug = ?',
  ).bind(eventSlug, eventSlug).all<{ member_name: string }>();

  // Build dates and slot numbers
  const dates = Array.from(new Set((slotRows.results || []).map((r) => r.event_date))).sort();
  const slotNumbers = Array.from(new Set((slotRows.results || []).map((r) => r.slot_number))).sort((a, b) => a - b);
  const allMembers = (memberRows.results || []).map((r) => r.member_name).sort((a, b) => a.localeCompare(b, 'ja'));

  // Load current available cells to compute totalCount per member
  const availableRows = await env.MIGURI_DB.prepare(
    'SELECT event_date, slot_number, member_name FROM miguri_slot_members WHERE event_slug = ?',
  ).bind(eventSlug).all<{ event_date: string; slot_number: number; member_name: string }>();

  // Build per-member available cells set (current + already sold out = total)
  const memberTotalCells = new Map<string, number>();
  const memberAvailableCells = new Map<string, Set<string>>();
  for (const row of (availableRows.results || [])) {
    const key = `${row.event_date}::${row.slot_number}`;
    if (!memberAvailableCells.has(row.member_name)) memberAvailableCells.set(row.member_name, new Set());
    memberAvailableCells.get(row.member_name)!.add(key);
  }

  // Count sold-out cells per member
  const memberSoldOutCells = new Map<string, Map<string, number>>(); // memberName -> cellKey -> roundNumber
  for (const cell of (cellRows.results || [])) {
    if (!memberSoldOutCells.has(cell.member_name)) memberSoldOutCells.set(cell.member_name, new Map());
    const key = `${cell.event_date}::${cell.slot_number}`;
    memberSoldOutCells.get(cell.member_name)!.set(key, cell.round_number);
  }

  // Total = union of available and sold-out cell keys.
  // miguri_slot_members is repopulated from Fortune's event-level member list on every sync
  // (Fortune doesn't expose per-slot availability), so sold-out cells remain in both tables.
  // Summing the two sets would double-count; use a union to get the correct distinct count.
  for (const member of allMembers) {
    const available = memberAvailableCells.get(member) || new Set<string>();
    const soldOut = memberSoldOutCells.get(member);
    const allKeys = new Set(available);
    if (soldOut) {
      for (const key of soldOut.keys()) allKeys.add(key);
    }
    memberTotalCells.set(member, allKeys.size);
  }

  return success({
    data: {
      event: {
        slug: eventRow.slug,
        group: eventRow.group_id,
        title: eventRow.title,
        sourceUrl: eventRow.source_url,
      },
      dates,
      slotNumbers,
      members: allMembers,
      rounds: (snapshotRows.results || []).map((r) => ({
        round: r.round_number,
        windowLabel: r.window_label,
        capturedAt: r.captured_at,
        memberCount: r.member_count,
        cellCount: r.cell_count,
      })),
      cells: (cellRows.results || []).map((c) => ({
        round: c.round_number,
        date: c.event_date,
        slot: c.slot_number,
        member: c.member_name,
      })),
      memberTotals: Object.fromEntries(memberTotalCells),
    },
  });
}

export async function handleGetMiguriLottery(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const artist = (url.searchParams.get('artist') || 'sakurazaka46').trim();
  const event = (url.searchParams.get('event') || '15th').trim();

  if (!/^[a-z0-9_-]+$/i.test(artist) || !/^[a-z0-9_-]+$/i.test(event)) {
    return error('无效的 artist 或 event 参数', 400);
  }

  try {
    const data = await fetchFortuneMeetsAnalysis({ artist, event });
    return success({ data });
  } catch (err) {
    console.error('[Miguri] fortune meets fetch failed:', err);
    return error(err instanceof Error ? err.message : 'Fortune Meets 数据读取失败', 502);
  }
}
