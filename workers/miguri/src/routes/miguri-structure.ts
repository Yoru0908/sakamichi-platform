import type { Env } from '../types.ts';
import type { MiguriSyncEvent, normalizeMiguriPayload } from './miguri.ts';

export function validateEventStructure(event: MiguriSyncEvent): string[] {
  const errors: string[] = [];
  const dates = new Set(event.dates);
  const overrides = new Set<string>();
  const members = new Set(event.members.map((name) => name.replace(/\s/g, '')));
  for (const schedule of event.dateSchedules || []) {
    if (!dates.has(schedule.date) || overrides.has(schedule.date)) errors.push(`特殊日程无效或重复: ${schedule.date}`);
    overrides.add(schedule.date);
    if (!schedule.members.length || schedule.members.some((member) => !members.has(member.replace(/\s/g, '')))) {
      errors.push(`特殊日程成员无法确认: ${schedule.date}`);
    }
  }
  for (const [label, slots] of [['通常日程', event.slots], ...(event.dateSchedules || []).map((s) => [s.date, s.slots] as const)] as const) {
    const numbers = new Set<number>();
    if (!slots.length) errors.push(`${label} 部次为空`);
    for (const slot of slots) {
      if (!Number.isInteger(slot.slotNumber) || slot.slotNumber < 1 || numbers.has(slot.slotNumber)) {
        errors.push(`${label} 部次无效或重复: ${slot.slotNumber}`);
      }
      numbers.add(slot.slotNumber);
      const times = [slot.receptionStart, slot.startTime, slot.receptionEnd, slot.endTime];
      if (times.some((value) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) || times.some((value, index) => index > 0 && value < times[index - 1])) {
        errors.push(`${label} 第${slot.slotNumber}部 时间无效`);
      }
    }
  }
  return errors.map((message) => `${event.slug} ${message}`);
}

// One JSON parameter per table keeps the entire replacement within one D1 batch
// transaction, even for thousands of members. Never commit DELETEs separately.
export function buildStructureStatements(env: Pick<Env, 'MIGURI_DB'>, normalized: ReturnType<typeof normalizeMiguriPayload>) {
  const db = env.MIGURI_DB;
  const statements = normalized.events.flatMap(({ slug }) => [
    db.prepare('DELETE FROM miguri_event_windows WHERE event_slug = ?').bind(slug),
    db.prepare('DELETE FROM miguri_slot_members WHERE event_slug = ?').bind(slug),
    db.prepare('DELETE FROM miguri_event_slots WHERE event_slug = ?').bind(slug),
  ]);
  statements.push(db.prepare(`
    INSERT INTO miguri_event_windows (event_slug, label, start_at, end_at, sort_order)
    SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]') FROM json_each(?)
  `).bind(JSON.stringify(normalized.windows.map((row) => [row.eventSlug, row.label, row.start, row.end, row.sortOrder]))));
  statements.push(db.prepare(`
    INSERT INTO miguri_event_slots (event_slug, event_date, slot_number, reception_start, start_time, reception_end, end_time)
    SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]') FROM json_each(?)
  `).bind(JSON.stringify(normalized.slots.map((row) => [row.eventSlug, row.eventDate, row.slotNumber, row.receptionStart, row.startTime, row.receptionEnd, row.endTime]))));
  statements.push(db.prepare(`
    INSERT INTO miguri_slot_members (event_slug, event_date, slot_number, member_name)
    SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]') FROM json_each(?)
  `).bind(JSON.stringify(normalized.slotMembers.map((row) => [row.eventSlug, row.eventDate, row.slotNumber, row.memberName]))));
  return statements;
}
