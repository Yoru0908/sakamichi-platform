import { resolveMiguriCdPriceYen } from './miguri-cd-prices.ts';
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
  | 'category'
  | 'venue'
  | 'eventTitle'
  | 'group'
  | 'source'
  | 'appliedTickets'
  | 'wonTickets'
  | 'paidTickets'
  | 'unitPriceYen'
  | 'spendYen'
  | 'signLots'
  | 'applicationRound'
  | 'sourceSyncedAt'
>>;
export type EventState = 'active' | 'upcoming' | 'ended' | 'waiting';
export type MiguriDashboardBreakdown = {
  label: string;
  tickets: number;
  spendYen: number;
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
    totalSlots: new Set(
      entries.map((entry) => `${entry.date}::${entry.slot}::${entry.member}`),
    ).size,
    uniqueMembers: new Set(entries.map((entry) => entry.member)).size,
    uniqueDates: new Set(entries.map((entry) => entry.date)).size,
  };
}

function dashboardCategory(
  entry: DashboardEntryLike,
): NonNullable<MiguriEntry['category']> {
  return entry.category || '個別ミーグリ';
}

const CURRENT_RELEASE_PRICE_HINTS: Array<{ pattern: RegExp; priceYen: number }> = [
  {
    pattern: /Lonesome\s*rabbit|What(?:'|’|&#0*39;|&apos;)?s\s*[“"]?KAZOKU/i,
    priceYen: 2000,
  },
  { pattern: /Kind\s+of\s+love/i, priceYen: 2000 },
  { pattern: /最後に階段を駆け上がったのはいつだ/, priceYen: 2000 },
  { pattern: /Same\s+numbers/i, priceYen: 2000 },
  { pattern: /Love\s+yourself/i, priceYen: 2000 },
  { pattern: /UDAGAWA\s+GENERATION/i, priceYen: 2000 },
  { pattern: /卒業写真だけが知ってる/, priceYen: 2000 },
  { pattern: /Monopoly/i, priceYen: 2000 },
];

function inferredReleasePriceYen(entry: DashboardEntryLike) {
  if ((entry.unitPriceYen || 0) > 0) {
    return { priceYen: entry.unitPriceYen || 0, estimated: false };
  }
  if (dashboardCategory(entry) === '個別ミーグリ') {
    return { priceYen: 1200, estimated: true };
  }
  if (
    entry.source === 'fortunemeets'
    || ['全国ミーグリ', 'リアミ', 'サイン会'].includes(dashboardCategory(entry))
  ) {
    return { priceYen: 2000, estimated: true };
  }
  const title = entry.eventTitle || '';
  const known = CURRENT_RELEASE_PRICE_HINTS.find(({ pattern }) => (
    pattern.test(title)
  ));
  if (known) return { priceYen: known.priceYen, estimated: true };
  if (
    !/(?:シングル|single)/i.test(title)
    || /(?:アルバム|album)/i.test(title)
  ) {
    return { priceYen: 0, estimated: false };
  }
  const year = Number(entry.date.slice(0, 4));
  if (year >= 2024) return { priceYen: 2000, estimated: true };
  if (year >= 2020) return { priceYen: 1900, estimated: true };
  if (year >= 2018) return { priceYen: 1884, estimated: true };
  if (year >= 2014) return { priceYen: 1681, estimated: true };
  return { priceYen: 1676, estimated: true };
}

function meetsDiscountMultiplier(value: number) {
  const discountPct = Math.max(0, Math.min(30, Number.isFinite(value) ? value : 0));
  return 1 - discountPct / 100;
}

export function resolveMiguriEntrySpend(
  entry: DashboardEntryLike,
  meetsDiscountPct = 0,
  includeLostMeetsCost = false,
) {
  const wonTickets = Math.max(
    0,
    entry.wonTickets
      || (
        entry.status === 'won' || entry.status === 'paid'
          ? entry.tickets
          : 0
      ),
  );
  const countedTickets = entry.source === 'fortunemeets'
    ? wonTickets
    : Math.max(0, entry.paidTickets || wonTickets);
  if (entry.source === 'fortunemusic') {
    return {
      spendYen: countedTickets * 1200,
      unitPriceYen: 1200,
      estimated: false,
      countedTickets,
      unpricedTickets: 0,
    };
  }
  if (entry.source === 'fortunemeets') {
    const priceYen = resolveMiguriCdPriceYen(entry.group, entry.eventTitle);
    const appliedTickets = Math.max(wonTickets, entry.appliedTickets || 0);
    const hasSerialAllocation =
      (entry.paidTickets || 0) > 0 || (entry.spendYen || 0) === 0;
    const allocatedSerials = hasSerialAllocation
      ? Math.max(0, entry.paidTickets || 0)
      : appliedTickets;
    const officialLostTickets = entry.status === 'planned'
      ? 0
      : Math.max(0, appliedTickets - wonTickets);
    const allocatedLostSerials = Math.min(
      allocatedSerials,
      officialLostTickets,
    );
    const allocatedWonSerials = entry.status === 'planned'
      ? 0
      : Math.max(0, allocatedSerials - allocatedLostSerials);
    const meetsTickets = includeLostMeetsCost
      ? allocatedSerials
      : allocatedWonSerials;
    const discountMultiplier = meetsDiscountMultiplier(meetsDiscountPct);
    return {
      spendYen: Math.round(meetsTickets * priceYen * discountMultiplier),
      unitPriceYen: Math.round(priceYen * discountMultiplier),
      estimated: priceYen > 0 && meetsTickets > 0,
      countedTickets: meetsTickets,
      unpricedTickets: meetsTickets > 0 && priceYen === 0 ? meetsTickets : 0,
    };
  }
  if ((entry.spendYen || 0) > 0) {
    return {
      spendYen: entry.spendYen || 0,
      unitPriceYen: entry.unitPriceYen || 0,
      estimated: false,
      countedTickets,
      unpricedTickets: 0,
    };
  }
  const price = inferredReleasePriceYen(entry);
  return {
    spendYen: countedTickets * price.priceYen,
    unitPriceYen: price.priceYen,
    estimated: price.estimated && countedTickets > 0,
    countedTickets,
    unpricedTickets: countedTickets > 0 && price.priceYen === 0
      ? countedTickets
      : 0,
  };
}

export function resolveMiguriEntryLostSpend(
  entry: DashboardEntryLike,
  meetsDiscountPct = 0,
) {
  if (entry.source !== 'fortunemeets' || entry.status === 'planned') return 0;
  const wonSpend = resolveMiguriEntrySpend(entry, meetsDiscountPct).spendYen;
  const paidSpend = resolveMiguriEntrySpend(
    entry,
    meetsDiscountPct,
    true,
  ).spendYen;
  return Math.max(0, paidSpend - wonSpend);
}

const DASHBOARD_CATEGORY_ORDER: Array<NonNullable<MiguriEntry['category']>> = [
  '個別ミーグリ',
  '全国ミーグリ',
  'リアミ',
  'サイン会',
  'その他',
];

function buildBreakdown(
  ticketValues: Map<string, number>,
  spendValues: Map<string, number>,
): MiguriDashboardBreakdown[] {
  const totalTickets = Array.from(ticketValues.values()).reduce((sum, value) => sum + value, 0);
  const totalSpend = Array.from(spendValues.values()).reduce((sum, value) => sum + value, 0);
  const labels = new Set([...ticketValues.keys(), ...spendValues.keys()]);
  return Array.from(labels)
    .map((label) => {
      const tickets = ticketValues.get(label) || 0;
      const spendYen = spendValues.get(label) || 0;
      return {
        label,
        tickets,
        spendYen,
        percentage: totalSpend > 0
          ? spendYen / totalSpend
          : totalTickets > 0
            ? tickets / totalTickets
            : 0,
      };
    })
    .sort((left, right) => (
      right.spendYen - left.spendYen
      || right.tickets - left.tickets
      || left.label.localeCompare(right.label, 'ja')
    ));
}

export function aggregateMiguriDashboard(
  entries: DashboardEntryLike[],
  today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }),
  meetsDiscountPct = 0,
) {
  const scheduleEntries = entries.filter((entry) => (
    entry.tickets > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
    && entry.status !== 'lost'
    && (entry.status !== 'planned' || !entry.source || entry.source === 'manual')
  ));
  const categoryTickets = new Map<string, number>();
  const categorySpend = new Map<string, number>();
  const memberTickets = new Map<string, number>();
  const memberSpend = new Map<string, number>();
  const roundSpend = new Map<string, number>();
  const scheduledEntryIds = new Set(scheduleEntries.map((entry) => entry.id));
  let estimatedSpendYen = 0;
  let estimatedSpendEntries = 0;
  let lostSpendYen = 0;
  let unpricedWonTickets = 0;

  for (const entry of entries) {
    const category = dashboardCategory(entry);
    const resolvedSpend = resolveMiguriEntrySpend(entry, meetsDiscountPct);
    const spendYen = resolvedSpend.spendYen;
    lostSpendYen += resolveMiguriEntryLostSpend(entry, meetsDiscountPct);
    if (resolvedSpend.estimated) {
      estimatedSpendYen += spendYen;
      estimatedSpendEntries += 1;
    }
    unpricedWonTickets += resolvedSpend.unpricedTickets;
    const scheduledTickets = scheduledEntryIds.has(entry.id) ? Math.max(0, entry.tickets) : 0;
    categoryTickets.set(category, (categoryTickets.get(category) || 0) + scheduledTickets);
    categorySpend.set(category, (categorySpend.get(category) || 0) + spendYen);
    memberTickets.set(entry.member, (memberTickets.get(entry.member) || 0) + scheduledTickets);
    memberSpend.set(entry.member, (memberSpend.get(entry.member) || 0) + spendYen);
    if (spendYen > 0 && entry.applicationRound) {
      roundSpend.set(entry.applicationRound, (roundSpend.get(entry.applicationRound) || 0) + spendYen);
    }
  }

  const upcomingEntries = scheduleEntries.filter((entry) => entry.date >= today);
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

  const eligibleResults = entries.filter((entry) => {
    const category = dashboardCategory(entry);
    return category !== 'サイン会'
      && category !== 'その他'
      && entry.status !== 'planned'
      && (entry.appliedTickets || entry.wonTickets || entry.source === 'manual');
  });
  const totalApplied = eligibleResults.reduce((sum, entry) => (
    sum + Math.max(0, entry.appliedTickets || entry.tickets)
  ), 0);
  const totalWon = eligibleResults.reduce((sum, entry) => (
    sum + Math.max(
      0,
      entry.wonTickets || (entry.status === 'won' || entry.status === 'paid' ? entry.tickets : 0),
    )
  ), 0);
  const totalSpendYen = Array.from(categorySpend.values()).reduce((sum, value) => sum + value, 0);
  const memberBreakdown = buildBreakdown(memberTickets, memberSpend);
  const categoryBreakdown = buildBreakdown(categoryTickets, categorySpend);
  const topMember = memberBreakdown[0] || null;
  const spendShares = memberBreakdown
    .filter((item) => item.spendYen > 0)
    .map((item) => item.spendYen / Math.max(1, totalSpendYen));
  const concentration = spendShares.reduce((sum, share) => sum + share * share, 0);
  const oshiType = concentration >= 0.5
    ? '单推'
    : concentration >= 0.22
      ? '主推明确'
      : concentration >= 0.08
        ? '箱推'
        : 'DD';
  const sourceFreshness = Array.from(new Set(entries
    .filter((entry) => entry.source && entry.source !== 'manual')
    .map((entry) => `${entry.source}:${entry.group || 'all'}:${entry.sourceSyncedAt || ''}`)))
    .map((value) => {
      const [source, group, ...syncedParts] = value.split(':');
      return { source, group, syncedAt: syncedParts.join(':') || null };
    })
    .sort((left, right) => (right.syncedAt || '').localeCompare(left.syncedAt || ''));

  return {
    totalTickets: scheduleEntries.reduce((sum, entry) => sum + entry.tickets, 0),
    totalSpendYen,
    lostSpendYen,
    totalPaidSpendYen: totalSpendYen + lostSpendYen,
    estimatedSpendYen,
    estimatedSpendEntries,
    unpricedWonTickets,
    totalApplied,
    totalWon,
    winRate: totalApplied > 0 ? totalWon / totalApplied : 0,
    costPerWinYen: totalWon > 0 ? totalSpendYen / totalWon : 0,
    topMember: topMember
      ? {
          name: topMember.label,
          share: totalSpendYen > 0 ? topMember.spendYen / totalSpendYen : topMember.percentage,
          spendYen: topMember.spendYen,
        }
      : null,
    oshiType,
    concentration,
    upcomingDates: nextStops.length,
    nextStops,
    categoryBreakdown,
    memberBreakdown,
    spendTimeline: Array.from(roundSpend.entries())
      .map(([label, spendYen]) => ({ label, spendYen }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ja'))
      .slice(-8),
    sourceFreshness,
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

type ReconciliableEntry = EntryLike & Partial<Pick<
  MiguriEntry,
  'eventSlug' | 'source' | 'wonTickets'
>>;

function reconciliationKey(entry: ReconciliableEntry) {
  return [entry.eventSlug || '', entry.date, entry.slot, entry.member].join('::');
}

export function preferOfficialMusicEntries<T extends ReconciliableEntry>(entries: T[]) {
  const officialCombinations = new Set(
    entries
      .filter((entry) => entry.source === 'fortunemusic')
      .map(reconciliationKey),
  );
  return entries.filter(
    (entry) =>
      entry.source !== 'manual'
      || !officialCombinations.has(reconciliationKey(entry)),
  );
}

export function prepareEntriesForCalendar<T extends ReconciliableEntry>(entries: T[]) {
  return preferOfficialMusicEntries(entries).flatMap((entry) => {
    if (entry.source !== 'fortunemusic') return [entry];
    const wonTickets = Math.max(0, Number(entry.wonTickets || 0));
    if (wonTickets === 0) return [];
    return [{ ...entry, tickets: wonTickets } as T];
  });
}

export type CalendarEntryGroup<T extends EntryLike> = {
  key: string;
  date: string;
  slot: number;
  member: string;
  tickets: number;
  entries: T[];
};

export function groupEntriesForCalendar<T extends EntryLike>(entries: T[]) {
  const grouped: Record<string, Record<number, CalendarEntryGroup<T>[]>> = {};
  const byCombination = new Map<string, CalendarEntryGroup<T>>();

  for (const entry of entries) {
    const key = `${entry.date}::${entry.slot}::${entry.member}`;
    const current = byCombination.get(key);
    if (current) {
      current.tickets += entry.tickets;
      current.entries.push(entry);
      continue;
    }
    byCombination.set(key, {
      key,
      date: entry.date,
      slot: entry.slot,
      member: entry.member,
      tickets: entry.tickets,
      entries: [entry],
    });
  }

  for (const group of byCombination.values()) {
    if (!grouped[group.date]) grouped[group.date] = {};
    if (!grouped[group.date][group.slot]) grouped[group.date][group.slot] = [];
    grouped[group.date][group.slot].push(group);
  }
  for (const slots of Object.values(grouped)) {
    for (const groups of Object.values(slots)) {
      groups.sort((left, right) => left.member.localeCompare(right.member, 'ja'));
    }
  }

  return grouped;
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
