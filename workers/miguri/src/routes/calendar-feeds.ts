import type { Env } from '../types.ts';
import { error } from '../utils/response.ts';
import {
  buildIcsCalendar,
  type CalendarEvent,
} from '../utils/ics.ts';
import {
  icsResponse,
  loadLotteryCalendarEvents,
} from './calendar-subscriptions.ts';
import {
  loadOfficialScheduleEvents,
  officialScheduleGroupLabel,
  type OfficialScheduleGroup,
} from './official-schedule.ts';

function asScheduleGroup(value: string): OfficialScheduleGroup | null {
  return ['nogizaka', 'sakurazaka', 'hinatazaka'].includes(value)
    ? value as OfficialScheduleGroup
    : null;
}

function sortAndDedupe(events: CalendarEvent[]): CalendarEvent[] {
  const unique = new Map<string, CalendarEvent>();
  for (const event of events) unique.set(event.uid, event);
  return [...unique.values()].sort((left, right) => (
    new Date(left.startAt).getTime() - new Date(right.startAt).getTime()
    || left.uid.localeCompare(right.uid, 'ja')
  ));
}

export async function handleGetOfficialScheduleCalendar(
  _req: Request,
  _env: Env,
  rawGroup: string,
): Promise<Response> {
  const group = asScheduleGroup(rawGroup);
  if (!group) return error('未知的团体', 404);

  const events = await loadOfficialScheduleEvents(group);
  const label = officialScheduleGroupLabel(group);
  return icsResponse(buildIcsCalendar(events, {
    name: `${label} 完整官方日程`,
    description: `46log 自动同步的${label}官网完整日程`,
    refreshInterval: 'PT6H',
  }), `46log-official-schedule-${group}.ics`);
}

export async function handleGetCompleteGroupCalendar(
  _req: Request,
  env: Env,
  rawGroup: string,
): Promise<Response> {
  const group = asScheduleGroup(rawGroup);
  if (!group) return error('未知的团体', 404);

  const [officialEvents, lotteryEvents] = await Promise.all([
    loadOfficialScheduleEvents(group),
    loadLotteryCalendarEvents(env, group),
  ]);
  const events = sortAndDedupe([...officialEvents, ...lotteryEvents]);
  const label = officialScheduleGroupLabel(group);

  return icsResponse(buildIcsCalendar(events, {
    name: `${label} 全部日程`,
    description: `${label}官网完整日程 + Meet & Greet 抽选受付`,
    refreshInterval: 'PT6H',
  }), `46log-complete-${group}.ics`);
}
