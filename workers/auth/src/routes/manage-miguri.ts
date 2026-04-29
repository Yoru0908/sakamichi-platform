import type { Env } from '../types.ts';
import { error, success } from '../utils/response.ts';
import { buildMiguriSyncPayload, fetchFortuneEventsWithDetails, type EnrichedFortuneEvent } from '../../../../src/utils/fortune-music.ts';
import { getAuthUser } from './preferences.ts';
import { syncAllConnectedMiguriGoogleCalendars } from './google-calendar.ts';
import { normalizeMiguriPayload, type MiguriSyncPayload } from './miguri.ts';

async function authorizeManageRequest(req: Request, env: Env): Promise<boolean> {
  const syncSecret = req.headers.get('x-miguri-sync-secret');
  if (syncSecret && env.MIGURI_SYNC_SECRET && syncSecret === env.MIGURI_SYNC_SECRET) {
    return true;
  }

  const auth = await getAuthUser(req, env);
  return auth?.role === 'admin';
}

export function diffArchivedEventSlugs(existingSlugs: string[], incomingSlugs: string[]): string[] {
  if (incomingSlugs.length === 0) return [];

  const incoming = new Set(incomingSlugs);
  return Array.from(new Set(existingSlugs)).filter((slug) => !incoming.has(slug));
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

export type MiguriSyncResult = {
  eventCount: number;
  archivedEventCount: number;
  archivedEventSlugs: string[];
  windowCount: number;
  slotCount: number;
  slotMemberCount: number;
};

export async function persistMiguriSyncPayload(env: Env, body: MiguriSyncPayload): Promise<MiguriSyncResult> {
  const normalized = normalizeMiguriPayload(body);
  const now = new Date().toISOString();
  const incomingSlugs = normalized.events.map((event) => event.slug);
  const archivedSlugs = await archiveMissingEvents(env, incomingSlugs);

  for (const event of normalized.events) {
    await env.MIGURI_DB.prepare(`
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
    ).run();
  }

  const eventSlugs = normalized.events.map((event) => event.slug);
  for (const slug of eventSlugs) {
    await env.MIGURI_DB.prepare('DELETE FROM miguri_event_windows WHERE event_slug = ?').bind(slug).run();
    await env.MIGURI_DB.prepare('DELETE FROM miguri_slot_members WHERE event_slug = ?').bind(slug).run();
    await env.MIGURI_DB.prepare('DELETE FROM miguri_event_slots WHERE event_slug = ?').bind(slug).run();
  }

  for (const window of normalized.windows) {
    await env.MIGURI_DB.prepare(`
      INSERT INTO miguri_event_windows (event_slug, label, start_at, end_at, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(window.eventSlug, window.label, window.start, window.end, window.sortOrder).run();
  }

  for (const slot of normalized.slots) {
    await env.MIGURI_DB.prepare(`
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
    ).run();
  }

  for (const slotMember of normalized.slotMembers) {
    await env.MIGURI_DB.prepare(`
      INSERT INTO miguri_slot_members (event_slug, event_date, slot_number, member_name)
      VALUES (?, ?, ?, ?)
    `).bind(
      slotMember.eventSlug,
      slotMember.eventDate,
      slotMember.slotNumber,
      slotMember.memberName,
    ).run();
  }

  return {
    eventCount: normalized.events.length,
    archivedEventCount: archivedSlugs.length,
    archivedEventSlugs: archivedSlugs,
    windowCount: normalized.windows.length,
    slotCount: normalized.slots.length,
    slotMemberCount: normalized.slotMembers.length,
  };
}

export async function syncMiguriFromSource(
  env: Env,
  loadEvents: () => Promise<EnrichedFortuneEvent[]> = fetchFortuneEventsWithDetails,
): Promise<MiguriSyncResult> {
  const events = await loadEvents();
  const payload = buildMiguriSyncPayload(events);
  const result = await persistMiguriSyncPayload(env, payload);
  try {
    await syncAllConnectedMiguriGoogleCalendars(env);
  } catch (err) {
    console.error('[Miguri] Google Calendar bulk refresh failed after source sync:', err);
  }
  return result;
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

  const result = await persistMiguriSyncPayload(env, body);
  try {
    await syncAllConnectedMiguriGoogleCalendars(env);
  } catch (err) {
    console.error('[Miguri] Google Calendar bulk refresh failed after manual sync:', err);
  }
  return success({ data: result });
}
