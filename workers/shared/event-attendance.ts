/** Portable attendance v1 domain. No React, authentication, database or network dependencies. */
export type AttendanceGroup = 'nogizaka' | 'sakurazaka' | 'hinatazaka';
export const COST_KEYS = ['ticket', 'travel', 'stay', 'goods', 'other'] as const;
export type EventCosts = Partial<Record<typeof COST_KEYS[number], number>>;
export interface EventMemoData { note: string; cost: EventCosts }
export interface EventHistoryRecord extends EventMemoData {
  id: string; grp: AttendanceGroup; date: string; title: string; markedAt: number; updatedAt: number | null;
  sourceStatus: 'saved-snapshot';
}
export interface EventPublicProfile { public: boolean; name: string }
export interface AttendanceSummary { records: number; attendedDays: number; attendedEvents: number; plannedDays: number; plannedEvents: number; costRecorded: number; totalYen: number }
export interface EventHistoryPayload { records: EventHistoryRecord[]; summary: AttendanceSummary; nextOffset: number | null }
export interface EventRankingEntry { rank: number; name: string; days: number; events: number }
export const attendanceToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
export const attendanceStatus = (date: string, today = attendanceToday()) => date > today ? 'planned' as const : 'attended' as const;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function validateEventMemo(value: unknown): EventMemoData | null {
  if (!record(value) || Object.keys(value).some(k => !['note', 'cost'].includes(k)) || typeof value.note !== 'string' || value.note.length > 4000 || !record(value.cost)) return null;
  const cost: EventCosts = {};
  for (const [key, amount] of Object.entries(value.cost)) {
    if (!(COST_KEYS as readonly string[]).includes(key) || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0 || amount > 9_999_999) return null;
    cost[key as typeof COST_KEYS[number]] = amount;
  }
  return { note: value.note.trim(), cost };
}
export function validateEventProfile(value: unknown): EventPublicProfile | null {
  if (!record(value) || Object.keys(value).some(k => !['public', 'name'].includes(k)) || typeof value.public !== 'boolean' || typeof value.name !== 'string') return null;
  const name = value.name.trim();
  if (name.length > 40 || /[\u0000-\u001f\u007f]/.test(name) || (value.public && !name)) return null;
  return { public: value.public, name };
}
export function eventCostTotal(cost: EventCosts): number {
  return COST_KEYS.reduce((total, key) => total + (cost[key] ?? 0), 0);
}
/** Dates are de-duplicated across groups. Missing costs remain unknown; explicit zero is a recorded cost. */
export function summarizeAttendance(records: { id: string; date: string; cost: EventCosts }[], today = attendanceToday()): AttendanceSummary {
  const unique = [...new Map(records.map(r => [r.id, r])).values()];
  const attended = unique.filter(r => attendanceStatus(r.date, today) === 'attended');
  const planned = unique.filter(r => attendanceStatus(r.date, today) === 'planned');
  return { records: unique.length, attendedDays: new Set(attended.map(r => r.date)).size, attendedEvents: attended.length,
    plannedDays: new Set(planned.map(r => r.date)).size, plannedEvents: planned.length,
    costRecorded: unique.filter(r => Object.keys(r.cost).length > 0).length,
    totalYen: unique.reduce((total, r) => total + eventCostTotal(r.cost), 0) };
}
