import type { Env } from '../types.ts';
import { getAuthUserId } from './preferences.ts';
import { error, success } from '../utils/response.ts';
import { syncMiguriEntriesToGoogleCalendar } from './google-calendar.ts';

export const MIGURI_IMPORT_SOURCES = ['fortunemusic', 'fortunemeets'] as const;
export const MIGURI_IMPORT_CATEGORIES = ['個別ミーグリ', '全国ミーグリ', 'リアミ', 'サイン会', 'その他'] as const;
export const MIGURI_IMPORT_MAX_RECORDS = 500;

export type MiguriImportSource = (typeof MIGURI_IMPORT_SOURCES)[number];
export type MiguriImportCategory = (typeof MIGURI_IMPORT_CATEGORIES)[number];
export type MiguriImportGroup = 'nogizaka' | 'hinatazaka' | 'sakurazaka';

export type MiguriImportRecord = {
  source: MiguriImportSource;
  sourceKey: string;
  category: MiguriImportCategory;
  member: string;
  date: string;
  slot: number;
  appliedTickets: number;
  wonTickets: number;
  paidTickets: number;
  unitPriceYen: number;
  spendYen: number;
  signLots: number;
  applicationRound: string;
  sourceSyncedAt: string;
  eventSlug: string;
  title: string;
  venue: string;
  group: MiguriImportGroup | null;
  resultStatus?: 'pending' | 'won' | 'lost' | 'paid';
};

export type NormalizedImportRecord = MiguriImportRecord & {
  tickets: number;
  status: 'planned' | 'won' | 'lost' | 'paid';
  resultStatus: 'pending' | 'won' | 'lost' | 'paid';
};

const GROUPS: MiguriImportGroup[] = ['nogizaka', 'hinatazaka', 'sakurazaka'];
const MAX_TEXT_LENGTH = 200;
const MAX_TICKETS = 999;
const MAX_SLOT = 99;
const MAX_UNIT_PRICE_YEN = 100_000;
const MAX_SPEND_YEN = 100_000_000;
const QUERY_CHUNK_SIZE = 80;
const WRITE_CHUNK_SIZE = 50;

function normalizeMemberName(name: string): string {
  return name.replace(/[\s\u3000]+/g, '').trim();
}

function normalizeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\s\u3000]+/g, ' ').trim();
  if (normalized.length > maxLength) return null;
  return normalized;
}

function normalizeCount(value: unknown): number | null {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0 || count > MAX_TICKETS) return null;
  return count;
}

function normalizeMoney(value: unknown, max: number): number | null {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > max) return null;
  return amount;
}

function normalizeIsoTimestamp(value: unknown): string | null {
  if (value === '') return '';
  const text = normalizeText(value, 40);
  if (text === null) return null;
  if (!text) return '';
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2015 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function normalizeImportRecord(input: unknown): NormalizedImportRecord | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  if (!MIGURI_IMPORT_SOURCES.includes(raw.source as MiguriImportSource)) return null;
  const source = raw.source as MiguriImportSource;

  const rawSourceKey = normalizeText(raw.sourceKey, 160);
  if (!rawSourceKey || !/^[\w:./|@+-]+$/.test(rawSourceKey)) return null;
  const sourceKey = rawSourceKey.startsWith(`${source}:`)
    ? rawSourceKey
    : `${source}:${rawSourceKey}`;

  if (typeof raw.member !== 'string') return null;
  const member = normalizeMemberName(raw.member);
  if (!member || member.length > 60) return null;

  const date = normalizeText(raw.date, 10);
  if (!date || !isIsoDate(date)) return null;

  const slot = Number(raw.slot ?? 0);
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) return null;

  const appliedTickets = normalizeCount(raw.appliedTickets);
  const wonTickets = normalizeCount(raw.wonTickets);
  const paidTickets = normalizeCount(raw.paidTickets);
  const signLots = normalizeCount(raw.signLots ?? 0);
  const unitPriceYen = normalizeMoney(raw.unitPriceYen ?? 0, MAX_UNIT_PRICE_YEN);
  const spendYen = normalizeMoney(raw.spendYen ?? 0, MAX_SPEND_YEN);
  if (
    appliedTickets === null
    || wonTickets === null
    || paidTickets === null
    || signLots === null
    || unitPriceYen === null
    || spendYen === null
  ) return null;

  const category = MIGURI_IMPORT_CATEGORIES.includes(raw.category as MiguriImportCategory)
    ? (raw.category as MiguriImportCategory)
    : 'その他';
  const tickets = category === 'サイン会' && signLots > 0
    ? signLots
    : paidTickets || wonTickets || appliedTickets;
  if (tickets <= 0) return null;

  const inferredResultStatus = paidTickets > 0
    ? 'paid'
    : wonTickets > 0
      ? 'won'
      : 'pending';
  const resultStatus = raw.resultStatus === undefined
    ? inferredResultStatus
    : ['pending', 'won', 'lost', 'paid'].includes(`${raw.resultStatus}`)
      ? raw.resultStatus as NormalizedImportRecord['resultStatus']
      : null;
  if (!resultStatus) return null;

  const group = GROUPS.includes(raw.group as MiguriImportGroup)
    ? (raw.group as MiguriImportGroup)
    : null;
  const eventSlug = normalizeText(raw.eventSlug ?? '', 80);
  const title = normalizeText(raw.title ?? '');
  const venue = normalizeText(raw.venue ?? '', 80);
  const applicationRound = normalizeText(raw.applicationRound ?? '', 40);
  const sourceSyncedAt = normalizeIsoTimestamp(raw.sourceSyncedAt ?? '');
  if (
    eventSlug === null
    || title === null
    || venue === null
    || applicationRound === null
    || sourceSyncedAt === null
  ) return null;
  if (eventSlug && !/^[\w-]+$/.test(eventSlug)) return null;

  return {
    source,
    sourceKey,
    category,
    member,
    date,
    slot,
    appliedTickets,
    wonTickets,
    paidTickets,
    unitPriceYen,
    spendYen,
    signLots,
    applicationRound,
    sourceSyncedAt,
    tickets,
    status: resultStatus === 'pending' ? 'planned' : resultStatus,
    resultStatus,
    eventSlug,
    title,
    venue,
    group,
  };
}

export function normalizeImportRecords(input: unknown): {
  records: NormalizedImportRecord[];
  invalidIndexes: number[];
  duplicateCount: number;
} {
  if (!Array.isArray(input)) {
    return { records: [], invalidIndexes: [], duplicateCount: 0 };
  }

  const deduped = new Map<string, NormalizedImportRecord>();
  const invalidIndexes: number[] = [];
  let duplicateCount = 0;

  input.forEach((item, index) => {
    const record = normalizeImportRecord(item);
    if (!record) {
      invalidIndexes.push(index);
      return;
    }
    if (deduped.has(record.sourceKey)) duplicateCount += 1;
    deduped.set(record.sourceKey, record);
  });

  return {
    records: Array.from(deduped.values()),
    invalidIndexes,
    duplicateCount,
  };
}

function nanoid(size = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  for (const byte of bytes) id += chars[byte % chars.length];
  return id;
}

async function findExistingSourceKeys(
  env: Env,
  userId: string,
  sourceKeys: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const sourceKeyChunk of chunk(sourceKeys, QUERY_CHUNK_SIZE)) {
    const placeholders = sourceKeyChunk.map(() => '?').join(', ');
    const rows = await env.MIGURI_DB.prepare(`
      SELECT source_key
      FROM miguri_user_entries
      WHERE user_id = ? AND source_key IN (${placeholders})
    `).bind(userId, ...sourceKeyChunk).all<{ source_key: string }>();
    for (const row of rows.results || []) found.add(row.source_key);
  }
  return found;
}

async function findKnownEventSlugs(
  env: Env,
  requestedSlugs: string[],
): Promise<Set<string>> {
  const known = new Set<string>();
  for (const slugChunk of chunk(requestedSlugs, QUERY_CHUNK_SIZE)) {
    const placeholders = slugChunk.map(() => '?').join(', ');
    const rows = await env.MIGURI_DB.prepare(
      `SELECT slug FROM miguri_events WHERE slug IN (${placeholders})`,
    ).bind(...slugChunk).all<{ slug: string }>();
    for (const row of rows.results || []) known.add(row.slug);
  }
  return known;
}

async function loadImportedEntries(
  env: Env,
  userId: string,
  sourceKeys: string[],
) {
  const entries: unknown[] = [];
  for (const sourceKeyChunk of chunk(sourceKeys, QUERY_CHUNK_SIZE)) {
    const placeholders = sourceKeyChunk.map(() => '?').join(', ');
    const rows = await env.MIGURI_DB.prepare(`
      SELECT e.id, e.event_slug, e.member_name, e.event_date, e.slot_number, e.tickets, e.status,
             e.source, e.source_key, e.category, e.venue,
             e.applied_tickets, e.won_tickets, e.paid_tickets,
             e.unit_price_yen, e.spend_yen, e.sign_lots,
             e.application_round, e.source_synced_at,
             COALESCE(m.title, e.import_title) AS event_title,
             COALESCE(m.group_id, e.import_group) AS group_id,
             s.start_time, s.end_time
      FROM miguri_user_entries e
      LEFT JOIN miguri_events m ON m.slug = e.event_slug
      LEFT JOIN miguri_event_slots s
        ON s.event_slug = e.event_slug
       AND s.event_date = e.event_date
       AND s.slot_number = e.slot_number
      WHERE e.user_id = ? AND e.source_key IN (${placeholders})
      ORDER BY e.event_date, e.slot_number, e.member_name
    `).bind(userId, ...sourceKeyChunk).all<any>();

    entries.push(...(rows.results || []).map((row) => ({
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
      source: row.source,
      sourceKey: row.source_key,
      category: row.category,
      venue: row.venue,
      appliedTickets: row.applied_tickets,
      wonTickets: row.won_tickets,
      paidTickets: row.paid_tickets,
      unitPriceYen: row.unit_price_yen ?? 0,
      spendYen: row.spend_yen ?? 0,
      signLots: row.sign_lots ?? 0,
      applicationRound: row.application_round || null,
      sourceSyncedAt: row.source_synced_at || null,
    })));
  }
  return entries;
}

export async function handleImportMiguriEntries(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('需要登录 46log 后才能自动保存', 401);

  let body: { records?: unknown };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  if (!body || !Array.isArray(body.records)) return error('缺少 records', 400);
  if (body.records.length === 0) return error('没有可导入的记录', 400);
  if (body.records.length > MIGURI_IMPORT_MAX_RECORDS) return error('单次导入记录过多', 413);

  const { records, invalidIndexes, duplicateCount } = normalizeImportRecords(body.records);
  if (invalidIndexes.length > 0) {
    return error(`第 ${invalidIndexes.slice(0, 5).map((index) => index + 1).join('、')} 条记录格式无效`, 400);
  }

  const sourceKeys = records.map((record) => record.sourceKey);
  const existingKeys = await findExistingSourceKeys(env, userId, sourceKeys);
  const requestedEventSlugs = Array.from(new Set(records.map((record) => record.eventSlug).filter(Boolean)));
  const knownEventSlugs = await findKnownEventSlugs(env, requestedEventSlugs);

  const statements = records.map((record) => env.MIGURI_DB.prepare(`
    INSERT INTO miguri_user_entries (
      id, user_id, event_slug, member_name, event_date, slot_number, tickets, status,
      source, source_key, category, venue, import_title, import_group,
      applied_tickets, won_tickets, paid_tickets,
      unit_price_yen, spend_yen, sign_lots, application_round, source_synced_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, source_key) WHERE source_key IS NOT NULL DO UPDATE SET
      event_slug = excluded.event_slug,
      member_name = excluded.member_name,
      event_date = excluded.event_date,
      slot_number = excluded.slot_number,
      tickets = excluded.tickets,
      status = excluded.status,
      source = excluded.source,
      category = excluded.category,
      venue = excluded.venue,
      import_title = excluded.import_title,
      import_group = excluded.import_group,
      applied_tickets = excluded.applied_tickets,
      won_tickets = excluded.won_tickets,
      paid_tickets = excluded.paid_tickets,
      unit_price_yen = excluded.unit_price_yen,
      spend_yen = excluded.spend_yen,
      sign_lots = excluded.sign_lots,
      application_round = excluded.application_round,
      source_synced_at = excluded.source_synced_at,
      updated_at = datetime('now')
  `).bind(
    nanoid(),
    userId,
    knownEventSlugs.has(record.eventSlug) ? record.eventSlug : '',
    record.member,
    record.date,
    record.slot,
    record.tickets,
    record.status,
    record.source,
    record.sourceKey,
    record.category,
    record.venue,
    record.title,
    record.group,
    record.appliedTickets,
    record.wonTickets,
    record.paidTickets,
    record.unitPriceYen,
    record.spendYen,
    record.signLots,
    record.applicationRound,
    record.sourceSyncedAt,
  ));

  for (const statementChunk of chunk(statements, WRITE_CHUNK_SIZE)) {
    await env.MIGURI_DB.batch(statementChunk);
  }

  const entries = await loadImportedEntries(env, userId, sourceKeys);
  const affectedIds = entries.map((entry: any) => entry.id);
  try {
    await syncMiguriEntriesToGoogleCalendar(env, userId, affectedIds);
  } catch (err) {
    console.error('[Miguri] Google Calendar sync failed after import:', err);
  }

  return success({
    data: {
      entries,
      imported: entries.length,
      created: records.filter((record) => !existingKeys.has(record.sourceKey)).length,
      updated: records.filter((record) => existingKeys.has(record.sourceKey)).length,
      duplicates: duplicateCount,
    },
  });
}
