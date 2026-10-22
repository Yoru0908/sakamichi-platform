// 46log /events (plan E4/E5): the three groups' in-person / online days from GET /api/miguri/sakamichi-events, as cards, with the
// viewer's 行く / 参加した marks. Page logic follows 坂ログ /events (month jump, これから / 過去, one toggle per day).
import { parseSakamichiEventId } from '../../../workers/shared/sakamichi-event-id.ts';

export type EventGroupId = 'nogizaka' | 'sakurazaka' | 'hinatazaka';
/** First year on each official schedule (the API refuses earlier years). */
export const FIRST_YEAR: Record<EventGroupId, number> = { nogizaka: 2011, sakurazaka: 2020, hinatazaka: 2019 };

export interface Venue { id: number; name: string; prefecture: string | null }
export interface SakamichiEvent {
  id: string; date: string; title: string; kind: string; category: 'attend' | 'online';
  shows: { label: string; start: string }[]; members: { id: string; name: string }[]; wholeGroup: boolean; sourceUrl: string;
  venue: Venue | null;
}
export interface EventCard {
  key: string; title: string; kind: string; category: 'attend' | 'online'; sourceUrl: string;
  days: SakamichiEvent[];
  /** Each venue with its dates, in date order; name null = days without a known venue. */
  venues: { name: string | null; prefecture: string | null; dates: string[] }[];
  members: { id: string; name: string }[]; wholeGroup: boolean;
}

/** A title that comes back after more than this many days is a new event (2019 Hinatazaka: 個別握手会 at the same hall 7 times). */
export const SAME_RUN_GAP_DAYS = 14;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400e3;

/** Days of one title and category become one card: a stage run, a tour (each stop keeps its dates). */
export function toCards(events: SakamichiEvent[]): EventCard[] {
  const open = new Map<string, EventCard>(), cards: EventCard[] = [];
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const key = `${e.category}\u0000${e.title}`, last = open.get(key);
    const card = last && dayNumber(e.date) - dayNumber(last.days[last.days.length - 1].date) <= SAME_RUN_GAP_DAYS ? last : undefined;
    const c = card ?? { key: `${key}\u0000${e.date}`, title: e.title, kind: e.kind, category: e.category, sourceUrl: e.sourceUrl, days: [], venues: [], members: [], wholeGroup: false };
    if (!card) { open.set(key, c); cards.push(c); }
    c.days.push(e);
    c.wholeGroup ||= e.wholeGroup;
    for (const m of e.members) if (!c.members.some((x) => x.id === m.id)) c.members.push(m);
    const name = e.venue?.name ?? null, v = c.venues.find((x) => x.name === name);
    if (v) v.dates.push(e.date); else c.venues.push({ name, prefecture: e.venue?.prefecture ?? null, dates: [e.date] });
  }
  return cards;
}

export type CategoryFilter = 'all' | 'attend' | 'online' | 'mine';
/** Category (or 'mine': a card with a marked day), then a free-text match on the title, official kind, venues and members. */
export function filterCards(cards: EventCard[], category: CategoryFilter, query: string, mine: ReadonlySet<string> = new Set()): EventCard[] {
  const q = query.trim().toLowerCase();
  const kept = (c: EventCard) => category === 'all' || (category === 'mine' ? c.days.some((d) => mine.has(d.id)) : c.category === category);
  return cards.filter((c) => kept(c) && (!q || [c.title, c.kind, ...c.venues.map((v) => v.name ?? ''), ...c.members.map((m) => m.name)]
    .some((s) => s.toLowerCase().includes(q))));
}

export const jstToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
/** 坂ログ markLabel: 行く / 行く予定 before the day, 参加した？ / 参加した from the day on. */
export const markKey = (date: string, marked: boolean, today: string) =>
  date > today ? (marked ? 'events.mark.going' : 'events.mark.go') : (marked ? 'events.mark.attended' : 'events.mark.attended_q');
/** A card has ended once its last day is before today (a tour still running stays in これから). */
export const isPastCard = (c: EventCard, today: string) => c.days[c.days.length - 1].date < today;
/** Days and shows of some cards (DAY1 / DAY2 count one day each, 昼 / 夜 one show each — as on 坂ログ). */
export const dayAndShowCount = (cards: EventCard[]) => ({
  days: cards.reduce((n, c) => n + c.days.length, 0),
  shows: cards.reduce((n, c) => n + c.days.reduce((m, d) => m + Math.max(1, d.shows.length), 0), 0),
});

/** Group and year of an event id (?event= links): "h_…" Hinatazaka, "n_…" Nogizaka, else Sakurazaka (same rule as the API). */
export function eventGroupYear(id: string): { grp: EventGroupId; year: number } | null {
  return parseSakamichiEventId(id);
}

/** Cards by the month of their first day ("2026-10"), months in order. */
export function byMonth(cards: EventCard[]): [string, EventCard[]][] {
  const months = new Map<string, EventCard[]>();
  for (const c of cards) {
    const m = c.days[0].date.slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), c]);
  }
  return [...months.entries()];
}

/** Years the API serves for a group, newest first (up to next year, JST). */
export function yearsOf(grp: EventGroupId, now = new Date()): number[] {
  const last = new Date(now.getTime() + 9 * 3600e3).getUTCFullYear() + 1, out: number[] = [];
  for (let y = last; y >= FIRST_YEAR[grp]; y--) out.push(y);
  return out;
}
