import {
  decodeHtmlEntities,
  type CalendarEvent,
} from '../utils/ics.ts';

export type OfficialScheduleGroup = 'nogizaka' | 'sakurazaka' | 'hinatazaka';

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type EventTiming = Pick<CalendarEvent, 'startAt' | 'endAt' | 'allDay'>;

const GROUP_LABELS: Record<OfficialScheduleGroup, string> = {
  nogizaka: '乃木坂46',
  sakurazaka: '櫻坂46',
  hinatazaka: '日向坂46',
};

const NOGIZAKA_CATEGORIES: Record<string, string> = {
  birthday: '誕生日',
  book: '雑誌・書籍',
  live: 'ライブ',
  movie: '映画',
  radio: 'ラジオ',
  release: 'リリース',
  stage: '舞台',
  tv: 'テレビ',
  web: '配信・Web',
};

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function matchText(value: string, pattern: RegExp): string {
  const match = value.match(pattern);
  return match ? stripHtml(match[1]) : '';
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function jstInstant(date: string, hour: number, minute: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute))
    .toISOString();
}

export function scheduleTiming(
  date: string,
  rawTime: string,
  defaultDurationMinutes = 60,
): EventTiming {
  const time = stripHtml(rawTime).replace(/\s+/g, '');
  const match = time.match(/(\d{1,2}):(\d{2})(?:[～〜~-](\d{1,2}):(\d{2}))?/);
  if (!match) {
    return {
      startAt: date,
      endAt: addDays(date, 1),
      allDay: true,
    };
  }

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const startAt = jstInstant(date, startHour, startMinute);
  let endAt: string;

  if (match[3] && match[4]) {
    let endHour = Number(match[3]);
    const endMinute = Number(match[4]);
    const startTotal = startHour * 60 + startMinute;
    let endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) {
      endHour += 24;
      endTotal += 24 * 60;
    }
    endAt = jstInstant(date, endHour, endMinute);
  } else {
    endAt = new Date(
      new Date(startAt).getTime() + defaultDurationMinutes * 60_000,
    ).toISOString();
  }

  return { startAt, endAt };
}

function scheduleDescription(
  group: OfficialScheduleGroup,
  category: string,
  members: string[] = [],
): string {
  return [
    `${GROUP_LABELS[group]}公式スケジュール`,
    category ? `種別：${category}` : '',
    members.length > 0 ? `メンバー：${members.join('、')}` : '',
  ].filter(Boolean).join('\n');
}

function stableUid(
  group: OfficialScheduleGroup,
  code: string,
  date: string,
  time: string,
): string {
  const timeKey = time.match(/\d{1,2}:\d{2}/)?.[0]?.replace(':', '') || 'allday';
  return `official:${group}:${code}:${date}:${timeKey}@46log.com`;
}

export function parseNogizakaSchedule(payload: string): CalendarEvent[] {
  const open = payload.indexOf('(');
  const close = payload.lastIndexOf(')');
  if (open < 0 || close <= open) {
    throw new Error('Nogizaka schedule response is not valid JSONP');
  }

  const parsed = JSON.parse(payload.slice(open + 1, close)) as {
    data?: Array<{
      code?: string;
      title?: string;
      date?: string;
      start_time?: string;
      end_time?: string;
      cate?: string;
      link?: string;
    }>;
  };

  return (parsed.data || []).flatMap((row) => {
    const date = row.date?.replace(/\//g, '-');
    const title = stripHtml(row.title || '');
    if (!row.code || !date || !title) return [];

    const rawTime = row.start_time
      ? `${row.start_time}${row.end_time ? `～${row.end_time}` : '～'}`
      : '';
    const category = NOGIZAKA_CATEGORIES[row.cate || ''] || row.cate || 'その他';
    return [{
      uid: stableUid('nogizaka', row.code, date, rawTime),
      title,
      description: scheduleDescription('nogizaka', category),
      location: '乃木坂46公式サイト',
      ...scheduleTiming(date, rawTime),
      url: row.link || undefined,
    }];
  });
}

export function parseSakurazakaSchedule(html: string): CalendarEvent[] {
  const marker = /<div class="module-modal js-schedule-detail\s+([^"]+)">/g;
  const matches = [...html.matchAll(marker)];
  const events: CalendarEvent[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const code = match[1].trim().split(/\s+/)[0];
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? html.length;
    const block = html.slice(start, end);
    const dateLine = matchText(block, /<p class="date[^"]*">([\s\S]*?)<\/p>/i);
    const dateMatch = dateLine.match(/^(\d{4})\.(\d{2})\.(\d{2})([\s\S]*)$/);
    const title = matchText(block, /<h2 class="title">([\s\S]*?)<\/h2>/i);
    if (!dateMatch || !title) continue;

    const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    const rawTime = dateMatch[4].trim();
    const category = matchText(block, /<p class="type">([\s\S]*?)<\/p>/i);
    const memberBlock = block.match(/<ul class="members[^"]*">([\s\S]*?)<\/ul>/i)?.[1] || '';
    const members = [...memberBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((member) => stripHtml(member[1]))
      .filter(Boolean);
    const yearMonth = date.slice(0, 7).replace('-', '');
    const sourceUrl = `https://www.sakurazaka46.com/s/s46/media/list?dy=${yearMonth}#${code}`;

    events.push({
      uid: stableUid('sakurazaka', code, date, rawTime),
      title,
      description: scheduleDescription('sakurazaka', category, members),
      location: '櫻坂46公式サイト',
      ...scheduleTiming(date, rawTime),
      url: sourceUrl,
    });
  }

  return events;
}

export function parseHinatazakaSchedule(
  html: string,
  yearMonth: string,
): CalendarEvent[] {
  if (!/^\d{6}$/.test(yearMonth)) {
    throw new Error(`Invalid Hinatazaka schedule month: ${yearMonth}`);
  }

  const events: CalendarEvent[] = [];
  const groups = html.split('<div class="p-schedule__list-group">').slice(1);

  for (const groupBlock of groups) {
    const rawDay = matchText(
      groupBlock,
      /<div class="c-schedule__date--list">[\s\S]*?<span>([\s\S]*?)<\/span>/i,
    );
    const day = Number(rawDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    const date = `${yearMonth.slice(0, 4)}-${yearMonth.slice(4)}-${String(day).padStart(2, '0')}`;

    for (const item of groupBlock.matchAll(/<li class="p-schedule__item">([\s\S]*?)<\/li>/gi)) {
      const block = item[1];
      const href = block.match(/<a[^>]+href="([^"]+)"/i)?.[1] || '';
      const code = href.match(/\/media\/detail\/([^?/"']+)/)?.[1];
      const title = matchText(block, /<p class="c-schedule__text">([\s\S]*?)<\/p>/i);
      if (!code || !title) continue;

      const category = matchText(
        block,
        /<div class="c-schedule__category[^"]*">([\s\S]*?)<\/div>/i,
      );
      const rawTime = matchText(
        block,
        /<div class="c-schedule__time--list">([\s\S]*?)<\/div>/i,
      );
      const sourceUrl = new URL(href, 'https://www.hinatazaka46.com').toString();

      events.push({
        uid: stableUid('hinatazaka', code, date, rawTime),
        title,
        description: scheduleDescription('hinatazaka', category),
        location: '日向坂46公式サイト',
        ...scheduleTiming(date, rawTime),
        url: sourceUrl,
      });
    }
  }

  return events;
}

export function officialScheduleMonths(
  baseDate = new Date(),
  startOffset = -1,
  count = 7,
): string[] {
  const jst = new Date(baseDate.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const monthIndex = jst.getUTCMonth();

  return Array.from({ length: count }, (_, index) => {
    const month = new Date(Date.UTC(year, monthIndex + startOffset + index, 1));
    return `${month.getUTCFullYear()}${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function officialMonthUrl(group: OfficialScheduleGroup, yearMonth: string): string {
  if (group === 'nogizaka') {
    return `https://www.nogizaka46.com/s/n46/api/list/schedule?dy=${yearMonth}`;
  }
  if (group === 'sakurazaka') {
    return `https://www.sakurazaka46.com/s/s46/media/list?dy=${yearMonth}&ima=0000`;
  }
  return `https://www.hinatazaka46.com/s/official/media/list?dy=${yearMonth}&ima=0000`;
}

export async function fetchOfficialScheduleMonth(
  group: OfficialScheduleGroup,
  yearMonth: string,
  fetcher: FetchLike = fetch,
): Promise<CalendarEvent[]> {
  const response = await fetcher(officialMonthUrl(group, yearMonth), {
    headers: {
      Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en;q=0.8',
      'User-Agent': '46log-calendar/1.0 (+https://46log.com)',
    },
  });
  if (!response.ok) {
    throw new Error(`${GROUP_LABELS[group]} schedule fetch failed: ${response.status}`);
  }

  const body = await response.text();
  if (group === 'nogizaka') return parseNogizakaSchedule(body);
  if (group === 'sakurazaka') return parseSakurazakaSchedule(body);
  return parseHinatazakaSchedule(body, yearMonth);
}

export async function loadOfficialScheduleEvents(
  group: OfficialScheduleGroup,
  months = officialScheduleMonths(),
  fetcher: FetchLike = fetch,
): Promise<CalendarEvent[]> {
  const results = await Promise.allSettled(
    months.map((month) => fetchOfficialScheduleMonth(group, month, fetcher)),
  );
  const successful = results.filter(
    (result): result is PromiseFulfilledResult<CalendarEvent[]> => result.status === 'fulfilled',
  );
  if (successful.length === 0) {
    throw new Error(`${GROUP_LABELS[group]} official schedule is unavailable`);
  }

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[Official Schedule] partial month failure:', group, result.reason);
    }
  }

  const unique = new Map<string, CalendarEvent>();
  for (const result of successful) {
    for (const event of result.value) unique.set(event.uid, event);
  }
  return [...unique.values()].sort((left, right) => (
    new Date(left.startAt).getTime() - new Date(right.startAt).getTime()
    || left.uid.localeCompare(right.uid, 'ja')
  ));
}

export function officialScheduleGroupLabel(group: OfficialScheduleGroup): string {
  return GROUP_LABELS[group];
}
