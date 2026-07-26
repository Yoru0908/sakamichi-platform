import type { MiguriGroupId } from '@/utils/auth-api';

export type ScheduleFeedKind = 'official' | 'lottery';
export type ScheduleCategory =
  | 'tv'
  | 'radio'
  | 'live'
  | 'web'
  | 'release'
  | 'birthday'
  | 'miguri'
  | 'other';

export interface ScheduleEvent {
  uid: string;
  group: MiguriGroupId;
  feedKind: ScheduleFeedKind;
  title: string;
  description: string;
  location: string;
  url: string;
  startIso: string;
  endIso: string;
  dateKey: string;
  endDateKey: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  category: ScheduleCategory;
  categoryLabel: string;
  members: string;
}

export const SCHEDULE_GROUPS: Array<{
  id: MiguriGroupId;
  label: string;
  shortLabel: string;
  color: string;
  softColor: string;
}> = [
  {
    id: 'nogizaka',
    label: '乃木坂46',
    shortLabel: '乃木坂',
    color: '#742581',
    softColor: '#f6eff8',
  },
  {
    id: 'sakurazaka',
    label: '櫻坂46',
    shortLabel: '櫻坂',
    color: '#d85f88',
    softColor: '#fff1f5',
  },
  {
    id: 'hinatazaka',
    label: '日向坂46',
    shortLabel: '日向坂',
    color: '#1689bd',
    softColor: '#eef8fc',
  },
];

export const SCHEDULE_CATEGORIES: Array<{
  id: 'all' | ScheduleCategory;
  label: string;
}> = [
  { id: 'all', label: '全部' },
  { id: 'tv', label: '电视' },
  { id: 'radio', label: '广播' },
  { id: 'live', label: '演出' },
  { id: 'web', label: '配信' },
  { id: 'release', label: '发行' },
  { id: 'birthday', label: '生日' },
  { id: 'miguri', label: 'Miguri' },
];

const CATEGORY_LABELS: Record<ScheduleCategory, string> = {
  tv: '电视',
  radio: '广播',
  live: '演出',
  web: '配信',
  release: '发行',
  birthday: '生日',
  miguri: 'Miguri',
  other: '其他',
};

function decodeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseProperty(line: string): {
  name: string;
  params: string;
  value: string;
} | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex < 0) return null;
  const key = line.slice(0, colonIndex);
  const semicolonIndex = key.indexOf(';');
  return {
    name: (semicolonIndex >= 0 ? key.slice(0, semicolonIndex) : key).toUpperCase(),
    params: semicolonIndex >= 0 ? key.slice(semicolonIndex + 1) : '',
    value: line.slice(colonIndex + 1),
  };
}

function parseIcsDate(value: string, params: string): {
  iso: string;
  dateKey: string;
  allDay: boolean;
} | null {
  const allDay = params.toUpperCase().includes('VALUE=DATE') || /^\d{8}$/.test(value);
  if (allDay) {
    const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) return null;
    const dateKey = `${match[1]}-${match[2]}-${match[3]}`;
    return {
      iso: new Date(`${dateKey}T00:00:00+09:00`).toISOString(),
      dateKey,
      allDay: true,
    };
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utcSuffix] = match;
  const iso = utcSuffix === 'Z'
    ? new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    )).toISOString()
    : new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`).toISOString();
  return {
    iso,
    dateKey: formatJstDateKey(iso),
    allDay: false,
  };
}

function inferGroup(text: string, fallbackGroup?: MiguriGroupId): MiguriGroupId | null {
  if (/乃木坂46|nogizaka/i.test(text)) return 'nogizaka';
  if (/櫻坂46|桜坂46|sakurazaka/i.test(text)) return 'sakurazaka';
  if (/日向坂46|hinatazaka/i.test(text)) return 'hinatazaka';
  return fallbackGroup || null;
}

function inferCategory(
  title: string,
  description: string,
  feedKind: ScheduleFeedKind,
): ScheduleCategory {
  if (feedKind === 'lottery' || /ミーグリ|ミート＆グリート|抽選応募|受付期間/.test(`${title}\n${description}`)) {
    return 'miguri';
  }
  const text = `${title}\n${description}`.toLowerCase();
  const declaredType = description.match(/種別：([^\n]+)/)?.[1]?.toLowerCase() || '';
  if (/ラジオ|radio/.test(declaredType)) return 'radio';
  if (/テレビ|tv/.test(declaredType)) return 'tv';
  if (/ライブ|舞台|イベント|公演/.test(declaredType)) return 'live';
  if (/web|配信/.test(declaredType)) return 'web';
  if (/リリース|雑誌|書籍|新聞/.test(declaredType)) return 'release';
  if (/誕生日|生誕|birthday/.test(text)) return 'birthday';
  if (/ラジオ|radio|fm\b|am\b/.test(text)) return 'radio';
  if (/テレビ|tv/.test(text)) return 'tv';
  if (/ライブ|コンサート|舞台|ミュージカル|イベント|公演/.test(text)) return 'live';
  if (/配信|youtube|showroom|web|ウェブ|ファンクラブ|さくみみ/.test(text)) return 'web';
  if (/リリース|発売|雑誌|新聞|書籍|シングル|アルバム/.test(text)) return 'release';
  return 'other';
}

function extractMembers(description: string): string {
  return description.match(/メンバー：([^\n]+)/)?.[1]?.trim() || '';
}

export function formatJstDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatJstTime(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function parseScheduleIcs(
  text: string,
  feedKind: ScheduleFeedKind,
  fallbackGroup?: MiguriGroupId,
): ScheduleEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VEVENT\r?\n[\s\S]*?\r?\nEND:VEVENT/g) || [];

  return blocks.flatMap((block): ScheduleEvent[] => {
    const fields = new Map<string, { params: string; value: string }>();
    for (const line of block.split(/\r?\n/).slice(1, -1)) {
      const property = parseProperty(line);
      if (property) fields.set(property.name, { params: property.params, value: property.value });
    }

    const startField = fields.get('DTSTART');
    if (!startField) return [];
    const start = parseIcsDate(startField.value, startField.params);
    if (!start) return [];

    const endField = fields.get('DTEND');
    const parsedEnd = endField ? parseIcsDate(endField.value, endField.params) : null;
    const fallbackEndIso = new Date(new Date(start.iso).getTime() + (start.allDay ? 86400000 : 3600000)).toISOString();
    const end = parsedEnd || {
      iso: fallbackEndIso,
      dateKey: formatJstDateKey(fallbackEndIso),
      allDay: start.allDay,
    };

    const title = decodeIcsText(fields.get('SUMMARY')?.value || '未命名日程');
    const description = decodeIcsText(fields.get('DESCRIPTION')?.value || '');
    const uid = decodeIcsText(fields.get('UID')?.value || `${title}:${start.iso}`);
    const group = inferGroup(`${uid}\n${title}\n${description}`, fallbackGroup);
    if (!group) return [];
    const category = inferCategory(title, description, feedKind);

    return [{
      uid,
      group,
      feedKind,
      title,
      description,
      location: decodeIcsText(fields.get('LOCATION')?.value || ''),
      url: decodeIcsText(fields.get('URL')?.value || ''),
      startIso: start.iso,
      endIso: end.iso,
      dateKey: start.dateKey,
      endDateKey: end.dateKey,
      startTime: start.allDay ? '' : formatJstTime(start.iso),
      endTime: start.allDay ? '' : formatJstTime(end.iso),
      allDay: start.allDay,
      category,
      categoryLabel: CATEGORY_LABELS[category],
      members: extractMembers(description),
    }];
  });
}

export function dedupeScheduleEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.uid}|${event.startIso}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupMeta(groupId: MiguriGroupId) {
  return SCHEDULE_GROUPS.find((group) => group.id === groupId) || SCHEDULE_GROUPS[0];
}
