import type {
  MiguriEntry,
  MiguriEntryStatus,
  MiguriEvent,
  MiguriGroupId,
  MiguriWindow,
} from '@/utils/auth-api';

export type EntryLike = Pick<MiguriEntry, 'id' | 'member' | 'date' | 'slot' | 'tickets' | 'status'>;
export type DashboardEntryLike = EntryLike & Partial<Pick<
  MiguriEntry,
  'category' | 'venue' | 'eventTitle' | 'group' | 'source'
>>;
export type EventState = 'active' | 'upcoming' | 'ended' | 'waiting';
export type MiguriDashboardBreakdown = {
  label: string;
  tickets: number;
  percentage: number;
};
export type MiguriDashboardRow = {
  member: string;
  category: NonNullable<MiguriEntry['category']>;
  tickets: number;
  slots: Array<{ slot: number; tickets: number }>;
};
export type MiguriDashboardStop = {
  date: string;
  venues: string[];
  tickets: number;
  rows: MiguriDashboardRow[];
};
export type FortuneImportRow = {
  member: string;
  date: string;
  slot: number;
  count: number;
};
export type PendingMeguriDraft = {
  id: string;
  eventSlug: string;
  date: string;
  slots: number[];
  member: string;
  tickets: number;
  status: MiguriEntryStatus;
};
export type FortuneMeetsSource = {
  artist: `${string}46`;
  event: string;
};

const FORTUNE_MEETS_ARTIST_BY_GROUP: Record<MiguriGroupId, FortuneMeetsSource['artist']> = {
  nogizaka: 'nogizaka46',
  sakurazaka: 'sakurazaka46',
  hinatazaka: 'hinatazaka46',
};

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values));
}

function normalizeDigits(value: string) {
  return value.replace(/[０-９]/g, (char) => String('０１２３４５６７８９'.indexOf(char)));
}

export function resolveFortuneMeetsSource(
  group: MiguriGroupId,
  eventTitle: string,
): FortuneMeetsSource | null {
  const normalizedTitle = normalizeDigits(eventTitle);
  const ordinal = normalizedTitle.match(/(\d{1,3})(st|nd|rd|th)/i);
  if (!ordinal) return null;
  return {
    artist: FORTUNE_MEETS_ARTIST_BY_GROUP[group],
    event: `${ordinal[1]}${ordinal[2].toLowerCase()}`,
  };
}

function parseCountCell(value: string): number | null {
  const match = normalizeDigits(value).match(/-?\d+/);
  if (!match) return null;
  const count = Number(match[0]);
  return Number.isFinite(count) ? count : null;
}

function normalizeHeaderCell(value: string) {
  return normalizeDigits(value).replace(/[\s\u3000]+/g, '').trim();
}

function detectCountColumnIndex(headers: string[]) {
  const normalized = headers.map(normalizeHeaderCell);
  const preferred = ['当選数', '数量', '応募数'];
  for (const key of preferred) {
    const index = normalized.findIndex((header) => header === key || header.includes(key));
    if (index >= 0) return index;
  }
  return -1;
}

export function parseFortuneImportText(text: string): FortuneImportRow[] {
  const results: FortuneImportRow[] = [];
  let countColumnIndex = -1;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const cols = line.split('\t').map((col) => col.trim());
    const headerIndex = detectCountColumnIndex(cols);
    if (headerIndex >= 0 && cols.some((col) => normalizeHeaderCell(col).includes('商品名'))) {
      countColumnIndex = headerIndex;
      continue;
    }

    const m = line.match(/(.+?)[\s\u3000]*[\u3010\[]((\d+)\/(\d+))\s*第([0-9０-９]+)部[\u3011\]]/);
    if (!m) continue;

    const candidateIndexes = [countColumnIndex, 3, 2]
      .filter((index, pos, arr) => index >= 0 && arr.indexOf(index) === pos && index < cols.length);
    let count: number | null = null;
    for (const index of candidateIndexes) {
      count = parseCountCell(cols[index]);
      if (count !== null) break;
    }

    results.push({
      member: m[1].replace(/[\s\u3000]+/g, ' ').trim(),
      date: m[2],
      slot: Number(normalizeDigits(m[5])),
      count: count ?? 1,
    });
  }

  return results;
}

function parseWindowDate(value: string): Date | null {
  const match = value.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日.*?(\d{1,2})[：:](\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

type SortableEventLike = Pick<MiguriEvent, 'slug' | 'dates' | 'windows' | 'syncedAt'>;

function getLastEventTimestamp(event: Pick<SortableEventLike, 'dates' | 'windows' | 'syncedAt'>): number {
  const lastDate = event.dates[event.dates.length - 1];
  if (lastDate) {
    const timestamp = new Date(`${lastDate}T23:59:59`).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const windowTimestamps = event.windows
    .map((window) => parseWindowDate(window.end)?.getTime() || parseWindowDate(window.start)?.getTime() || 0)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (windowTimestamps.length > 0) {
    return Math.max(...windowTimestamps);
  }

  const syncedAt = new Date(event.syncedAt).getTime();
  return Number.isFinite(syncedAt) ? syncedAt : 0;
}

export function inferEventState(
  windows: MiguriWindow[],
  lastEventDate?: string,
  now = new Date(),
): EventState {
  const hasActive = windows.some((window) => {
    const start = parseWindowDate(window.start);
    const end = parseWindowDate(window.end);
    return Boolean(start && end && start <= now && end > now);
  });
  if (hasActive) return 'active';

  const hasUpcoming = windows.some((window) => {
    const start = parseWindowDate(window.start);
    return Boolean(start && start > now);
  });
  if (hasUpcoming) return 'upcoming';

  if (lastEventDate) {
    const lastDate = new Date(`${lastEventDate}T23:59:59`);
    if (!Number.isNaN(lastDate.getTime()) && lastDate > now) return 'waiting';
  }

  return 'ended';
}

export function summarizeEntries<T extends EntryLike>(entries: T[]) {
  return {
    totalTickets: entries.reduce((sum, entry) => sum + entry.tickets, 0),
    totalSlots: entries.length,
    uniqueMembers: new Set(entries.map((entry) => entry.member)).size,
    uniqueDates: new Set(entries.map((entry) => entry.date)).size,
  };
}

function dashboardCategory(entry: DashboardEntryLike): NonNullable<MiguriEntry['category']> {
  return entry.category || '個別ミーグリ';
}

const DASHBOARD_CATEGORY_ORDER: Array<NonNullable<MiguriEntry['category']>> = [
  'リアミ',
  'サイン会',
  '個別ミーグリ',
  'その他',
];

function buildBreakdown(values: Map<string, number>): MiguriDashboardBreakdown[] {
  const total = Array.from(values.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(values.entries())
    .map(([label, tickets]) => ({
      label,
      tickets,
      percentage: total > 0 ? tickets / total : 0,
    }))
    .sort((left, right) => right.tickets - left.tickets || left.label.localeCompare(right.label, 'ja'));
}

export function aggregateMiguriDashboard(
  entries: DashboardEntryLike[],
  today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }),
) {
  const visibleEntries = entries.filter((entry) => (
    entry.tickets > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
    && entry.status !== 'lost'
    && (entry.status !== 'planned' || !entry.source || entry.source === 'manual')
  ));
  const categoryTotals = new Map<string, number>();
  const memberTotals = new Map<string, number>();

  for (const entry of visibleEntries) {
    const category = dashboardCategory(entry);
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + entry.tickets);
    memberTotals.set(entry.member, (memberTotals.get(entry.member) || 0) + entry.tickets);
  }

  const upcomingEntries = visibleEntries.filter((entry) => entry.date >= today);
  const stops = new Map<string, {
    venues: Set<string>;
    tickets: number;
    rows: Map<string, MiguriDashboardRow & { slotMap: Map<number, number> }>;
  }>();

  for (const entry of upcomingEntries) {
    const stop = stops.get(entry.date) || {
      venues: new Set<string>(),
      tickets: 0,
      rows: new Map<string, MiguriDashboardRow & { slotMap: Map<number, number> }>(),
    };
    if (entry.venue) stop.venues.add(entry.venue);
    stop.tickets += entry.tickets;

    const category = dashboardCategory(entry);
    const rowKey = `${entry.member}::${category}`;
    const row = stop.rows.get(rowKey) || {
      member: entry.member,
      category,
      tickets: 0,
      slots: [],
      slotMap: new Map<number, number>(),
    };
    row.tickets += entry.tickets;
    row.slotMap.set(entry.slot, (row.slotMap.get(entry.slot) || 0) + entry.tickets);
    stop.rows.set(rowKey, row);
    stops.set(entry.date, stop);
  }

  const nextStops: MiguriDashboardStop[] = Array.from(stops.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, stop]) => ({
      date,
      venues: Array.from(stop.venues).sort((left, right) => left.localeCompare(right, 'ja')),
      tickets: stop.tickets,
      rows: Array.from(stop.rows.values())
        .map(({ slotMap, ...row }) => ({
          ...row,
          slots: Array.from(slotMap.entries())
            .map(([slot, tickets]) => ({ slot, tickets }))
            .sort((left, right) => left.slot - right.slot),
        }))
        .sort((left, right) => (
          left.member.localeCompare(right.member, 'ja')
          || DASHBOARD_CATEGORY_ORDER.indexOf(left.category) - DASHBOARD_CATEGORY_ORDER.indexOf(right.category)
        )),
    }));

  return {
    totalTickets: visibleEntries.reduce((sum, entry) => sum + entry.tickets, 0),
    upcomingDates: nextStops.length,
    nextStops,
    categoryBreakdown: buildBreakdown(categoryTotals),
    memberBreakdown: buildBreakdown(memberTotals),
  };
}

export function groupEntriesByDateAndSlot<T extends EntryLike>(entries: T[]) {
  const groups: Record<string, Record<number, T[]>> = {};

  for (const entry of entries) {
    if (!groups[entry.date]) groups[entry.date] = {};
    if (!groups[entry.date][entry.slot]) groups[entry.date][entry.slot] = [];
    groups[entry.date][entry.slot].push(entry);
  }

  return groups;
}

export function buildPendingMeguriDraft(
  value: {
    eventSlug: string;
    date: string;
    slots: number[];
    member: string;
    tickets: number;
    status: MiguriEntryStatus;
  },
  createId: () => string,
): PendingMeguriDraft {
  return {
    id: createId(),
    eventSlug: value.eventSlug,
    date: value.date,
    slots: uniqueNumbers(value.slots.map(Number))
      .filter((slot) => Number.isFinite(slot) && slot > 0)
      .sort((left, right) => left - right),
    member: value.member.trim(),
    tickets: Math.max(1, Number(value.tickets || 1)),
    status: value.status,
  };
}

export function countPendingDraftRecords(drafts: PendingMeguriDraft[]) {
  return drafts.reduce((sum, draft) => sum + draft.slots.length, 0);
}

export function sortEventsForDisplay<T extends SortableEventLike>(events: T[]): T[] {
  return [...events].sort((left, right) => (
    getLastEventTimestamp(right) - getLastEventTimestamp(left)
    || right.syncedAt.localeCompare(left.syncedAt)
    || left.slug.localeCompare(right.slug)
  ));
}

export function hasEventDatePassed(dateValue?: string, now = new Date()): boolean {
  if (!dateValue) return false;
  const endOfDay = new Date(`${dateValue}T23:59:59`);
  if (Number.isNaN(endOfDay.getTime())) return false;
  return endOfDay < now;
}
