import type { MiguriEntry, MiguriEntryStatus, MiguriEvent, MiguriWindow } from '@/utils/auth-api';

export type EntryLike = Pick<MiguriEntry, 'id' | 'member' | 'date' | 'slot' | 'tickets' | 'status'>;
export type EventState = 'active' | 'upcoming' | 'ended' | 'waiting';
export type PendingMeguriDraft = {
  id: string;
  eventSlug: string;
  date: string;
  slots: number[];
  member: string;
  tickets: number;
  status: MiguriEntryStatus;
};

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values));
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
