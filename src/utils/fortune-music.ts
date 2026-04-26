/**
 * Fortune Music event list scraper & parser
 * Fetches https://fortunemusic.jp/event_list/ and extracts sakamichi events
 */

export type GroupId = 'nogizaka' | 'hinatazaka' | 'sakurazaka';

export type ReceptionWindow = {
  label: string;
  start: string;
  end: string;
};

export type FortuneEvent = {
  slug: string;
  group: GroupId;
  title: string;
  sourceUrl: string;
  saleType: string; // 抽選販売 / 先着販売 / mixed
  windows: ReceptionWindow[];
};

export type FortuneEventSlot = {
  slotNumber: number;
  receptionStart: string;
  startTime: string;
  receptionEnd: string;
  endTime: string;
};

export type FortuneEventDetail = {
  dates: string[];
  slots: FortuneEventSlot[];
  members: string[];
};

const SAKAMICHI_PATTERNS: { group: GroupId; pattern: RegExp }[] = [
  { group: 'nogizaka', pattern: /乃木坂46/ },
  { group: 'hinatazaka', pattern: /日向坂46/ },
  { group: 'sakurazaka', pattern: /櫻坂46/ },
];

// Slug prefix → group mapping (primary detection)
const SLUG_GROUP_MAP: Record<string, GroupId> = {
  nogizaka: 'nogizaka',
  hinatazaka: 'hinatazaka',
  sakurazaka: 'sakurazaka',
};

// Known non-sakamichi slug prefixes to skip (sub-units, other artists)
const SKIP_SLUG_PREFIXES = ['rosy', 'joy', 'yuri', 'asuka', 'sayuringo', 'guttsu'];

function extractSlug(href: string): string | null {
  // href like /hinatazaka_202605/ or https://fortunemusic.jp/nogizaka_202604/
  const match = href.match(/\/([a-z]+_\d{6}[^/]*?)\/?(?:\?|$)/);
  return match ? match[1] : null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|section|article|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function normalizeJapaneseText(text: string): string {
  return text
    .replace(/([一-龥ぁ-んァ-ヶー0-9０-９])\s+([一-龥ぁ-んァ-ヶー])/g, '$1$2')
    .replace(/([（『「【])\s+/g, '$1')
    .replace(/\s+([）』」】])/g, '$1')
    .replace(/([『「【])\s+/g, '$1')
    .replace(/\s+([』」】])/g, '$1')
    .replace(/\s+([、。・：；])/g, '$1')
    .replace(/([『「（【])\s*([^『「」』（）【】]+?)\s*([」』）】])/g, '$1$2$3')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractTitleFromCard(text: string, group: GroupId): string {
  const groupPattern = SAKAMICHI_PATTERNS.find((entry) => entry.group === group)?.pattern;
  if (!groupPattern) return '';

  const compact = text.replace(/\s+/g, ' ').trim();
  const groupMatch = compact.match(groupPattern);
  if (!groupMatch) return '';

  const afterGroup = compact.slice(groupMatch.index! + groupMatch[0].length).trim();
  const titleEnd = afterGroup.search(/(?=第[0-9１-９]+次受付|【第[0-9１-９]+次|【抽選\/第|【先着\/第|抽選販売|先着販売|\d{4}年\d{1,2}月\d{1,2}日)/);
  const title = (titleEnd > 0 ? afterGroup.slice(0, titleEnd) : afterGroup).trim();

  return normalizeJapaneseText(title.replace(/^[\s\-–—]+/, '').replace(/[\s\-–—]+$/, ''));
}

function parseWindows(text: string): ReceptionWindow[] {
  const windows: ReceptionWindow[] = [];

  // 使用全局扫描模式，不再依赖换行符，确保能抓到同一行内的多个轮次
  // 匹配模式：[轮次标签] + [日期范围]
  const pairRegex = /(?:(第[0-9１-９]+次(?:[～~－-][^受]+)?受付|【[^受]*第?[0-9１-９]+次?[^】]*受付[^】]*】|先着販売\/第[0-9１-９]+次|第[0-9１-９]+次|【抽選販売】|【先着販売】))\s*(\d{4}年\d{1,2}月\d{1,2}日[（(][^)）]+[)）]\d{1,2}[：:]\d{2})\s*[～~～]\s*(\d{4}年\d{1,2}月\d{1,2}日[（(][^)）]+[)）]\d{1,2}[：:]\d{2})/g;

  let match;
  while ((match = pairRegex.exec(text)) !== null) {
    windows.push({
      label: normalizeJapaneseText(match[1].replace(/[【】]/g, '').trim()),
      start: normalizeJapaneseText(match[2]),
      end: normalizeJapaneseText(match[3]),
    });
  }

  // 兜底匹配短格式
  if (windows.length === 0) {
    const shortPairRegex = /(?:(第[0-9１-９]+次受付|第[0-9１-９]+次))\s*(\d{1,2}月\d{1,2}日[（(][^)）]+[)）]\d{1,2}[：:]\d{2})\s*[～~～\-]\s*(\d{1,2}月\d{1,2}日[（(][^)）]+[)）]\d{1,2}[：:]\d{2})/g;
    while ((match = shortPairRegex.exec(text)) !== null) {
      windows.push({
        label: normalizeJapaneseText(match[1].trim()),
        start: normalizeJapaneseText(match[2]),
        end: normalizeJapaneseText(match[3]),
      });
    }
  }

  return windows;
}

function detectSaleType(text: string): string {
  const hasLottery = text.includes('抽選');
  const hasFirstCome = text.includes('先着');
  if (hasLottery && hasFirstCome) return '抽選/先着';
  if (hasLottery) return '抽選販売';
  if (hasFirstCome) return '先着販売';
  return '';
}

function normalizeEventDate(value: string): string | null {
  const match = value.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function extractSection(text: string, label: string): string {
  const start = text.indexOf(label);
  if (start === -1) return '';
  const rest = text.slice(start + label.length);
  const next = rest.search(/【[^】]+】/);
  return normalizeJapaneseText((next === -1 ? rest : rest.slice(0, next)).trim());
}

function parseDates(text: string): string[] {
  const section = extractSection(text, '【日程】');
  const matches = section.match(/\d{4}年\s*\d{1,2}月\s*\d{1,2}日/g) || [];
  return Array.from(new Set(matches.map(normalizeEventDate).filter((value): value is string => Boolean(value))));
}

function parseSlots(text: string): FortuneEventSlot[] {
  const section = extractSection(text, '【時間】');
  const slots: FortuneEventSlot[] = [];
  const slotRegex = /第\s*([0-9１-９]+)部\s*受付\s*([0-9]{1,2}:[0-9]{2})\s*\/\s*開始\s*([0-9]{1,2}:[0-9]{2})\s*\/\s*受付締切\s*([0-9]{1,2}:[0-9]{2})\s*\/\s*終了予定\s*([0-9]{1,2}:[0-9]{2})/g;

  let match: RegExpExecArray | null;
  while ((match = slotRegex.exec(section)) !== null) {
    const slotNumber = Number(match[1].replace(/[１-９]/g, (char) => String('０１２３４５６７８９'.indexOf(char))));
    slots.push({
      slotNumber,
      receptionStart: match[2],
      startTime: match[3],
      receptionEnd: match[4],
      endTime: match[5],
    });
  }

  return slots;
}

function parseMembers(text: string): string[] {
  const section = extractSection(text, '【参加メンバー】');
  if (!section) return [];
  return Array.from(new Set(
    section
      .split(/[、,\n]/)
      .map((member) => normalizeJapaneseText(member))
      .map((member) => member.replace(/\s+/g, ' ').trim())
      .filter((member) => member && !member.includes('※') && !member.includes('詳しくは')),
  ));
}

export function parseEventDetailHtml(html: string): FortuneEventDetail {
  const text = htmlToText(html);
  return {
    dates: parseDates(text),
    slots: parseSlots(text),
    members: parseMembers(text),
  };
}

export async function fetchFortuneEventDetail(url: string): Promise<FortuneEventDetail> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[fortune-music] detail fetch failed: ${res.status}`);
      return { dates: [], slots: [], members: [] };
    }

    const html = await res.text();
    return parseEventDetailHtml(html);
  } catch (err) {
    console.error('[fortune-music] detail fetch error:', err);
    return { dates: [], slots: [], members: [] };
  }
}

export async function fetchFortuneEventsWithDetails(): Promise<(FortuneEvent & FortuneEventDetail)[]> {
  const events = await fetchFortuneEvents();
  return Promise.all(events.map(async (event) => ({
    ...event,
    ...(await fetchFortuneEventDetail(event.sourceUrl)),
  })));
}

export function buildMiguriSyncPayload(events: (FortuneEvent & FortuneEventDetail)[]) {
  return {
    events: events.map((event) => ({
      slug: event.slug,
      group: event.group,
      title: event.title,
      sourceUrl: event.sourceUrl,
      saleType: event.saleType,
      windows: event.windows,
      dates: event.dates,
      slots: event.slots,
      members: event.members,
    })),
  };
}

export type MiguriSyncPayload = ReturnType<typeof buildMiguriSyncPayload>;

export function buildEventDateSlots(detail: FortuneEventDetail) {
  const pairs: Array<{ date: string; slot: FortuneEventSlot }> = [];
  for (const date of detail.dates) {
    for (const slot of detail.slots) {
      pairs.push({ date, slot });
    }
  }
  return pairs;
}

export function buildEntryDateTime(date: string, time: string): string {
  return `${date}T${time}:00+09:00`;
}

export function buildEntryDescription(member: string, slotNumber: number, tickets: number, eventTitle: string): string {
  return `${eventTitle}\n第${slotNumber}部 ${member} ${tickets}枚`;
}

export function buildEntryTitle(member: string, groupLabel: string): string {
  return `${groupLabel} ミーグリ - ${member}`;
}

export function buildEntryLocation(): string {
  return 'Fortune Music Online';
}

export function buildEventTitleFromSlug(slug: string): string {
  return slug.replace(/_/g, ' ');
}

export function buildEventSourceUrl(slug: string): string {
  return `https://fortunemusic.jp/${slug}/`;
}

export function toGroupLabel(group: GroupId): string {
  if (group === 'nogizaka') return '乃木坂46';
  if (group === 'hinatazaka') return '日向坂46';
  return '櫻坂46';
}

export function normalizeMemberName(name: string): string {
  return normalizeJapaneseText(name);
}

export function sortEventDates(dates: string[]): string[] {
  return [...dates].sort((a, b) => a.localeCompare(b));
}

export function sortEventSlots(slots: FortuneEventSlot[]): FortuneEventSlot[] {
  return [...slots].sort((a, b) => a.slotNumber - b.slotNumber);
}

export function dedupeMembers(members: string[]): string[] {
  return Array.from(new Set(members.map(normalizeMemberName).filter(Boolean)));
}

export function enrichFortuneEvent(event: FortuneEvent, detail: FortuneEventDetail) {
  return {
    ...event,
    dates: sortEventDates(detail.dates),
    slots: sortEventSlots(detail.slots),
    members: dedupeMembers(detail.members),
  };
}

export type EnrichedFortuneEvent = ReturnType<typeof enrichFortuneEvent>;

export function isMiguriDetailComplete(detail: FortuneEventDetail): boolean {
  return detail.dates.length > 0 && detail.slots.length > 0 && detail.members.length > 0;
}

export function parseFortuneEventWithDetail(listHtml: string, detailHtmlBySlug: Record<string, string>) {
  return parseEventListHtml(listHtml).map((event) => enrichFortuneEvent(event, parseEventDetailHtml(detailHtmlBySlug[event.slug] || '')));
}

export function emptyFortuneEventDetail(): FortuneEventDetail {
  return { dates: [], slots: [], members: [] };
}

export function mergeFortuneEventDetail(base: FortuneEventDetail, next: Partial<FortuneEventDetail>): FortuneEventDetail {
  return {
    dates: next.dates ? sortEventDates(next.dates) : base.dates,
    slots: next.slots ? sortEventSlots(next.slots) : base.slots,
    members: next.members ? dedupeMembers(next.members) : base.members,
  };
}

export function parseFortuneDetailSection(text: string, label: string): string {
  return extractSection(text, label);
}

export function parseFortuneMemberList(text: string): string[] {
  return parseMembers(text);
}

export function parseFortuneSlotList(text: string): FortuneEventSlot[] {
  return parseSlots(text);
}

export function parseFortuneDateList(text: string): string[] {
  return parseDates(text);
}

export function toFortuneDetailText(html: string): string {
  return htmlToText(html);
}

export function normalizeFortuneDetailText(text: string): string {
  return normalizeJapaneseText(text);
}

export function parseFortuneDetailFromText(text: string): FortuneEventDetail {
  return {
    dates: parseDates(text),
    slots: parseSlots(text),
    members: parseMembers(text),
  };
}

export function joinFortuneMembers(members: string[]): string {
  return dedupeMembers(members).join('、');
}

export function hasFortuneDates(detail: FortuneEventDetail): boolean {
  return detail.dates.length > 0;
}

export function hasFortuneSlots(detail: FortuneEventDetail): boolean {
  return detail.slots.length > 0;
}

export function hasFortuneMembers(detail: FortuneEventDetail): boolean {
  return detail.members.length > 0;
}

export function buildFortuneDetailSummary(detail: FortuneEventDetail) {
  return {
    dateCount: detail.dates.length,
    slotCount: detail.slots.length,
    memberCount: detail.members.length,
  };
}

export function buildFortuneDetailPayload(event: FortuneEvent, detail: FortuneEventDetail) {
  return {
    ...event,
    ...enrichFortuneEvent(event, detail),
  };
}

export function normalizeFortuneUrl(url: string): string {
  return url.startsWith('http') ? url : `https://fortunemusic.jp${url.startsWith('/') ? url : `/${url}`}`;
}

export function parseFortuneDateValue(value: string): string | null {
  return normalizeEventDate(value);
}

export function parseFortuneSlotNumber(value: string): number {
  return Number(value.replace(/[０-９]/g, (char) => String('０１２３４５６７８９'.indexOf(char))));
}

export function normalizeFortuneMembers(members: string[]): string[] {
  return dedupeMembers(members);
}

export function normalizeFortuneSlots(slots: FortuneEventSlot[]): FortuneEventSlot[] {
  return sortEventSlots(slots);
}

export function normalizeFortuneDates(dates: string[]): string[] {
  return sortEventDates(dates);
}

export function parseFortuneDetail(html: string): FortuneEventDetail {
  return parseEventDetailHtml(html);
}

export function buildFortuneSyncEvent(event: FortuneEvent & FortuneEventDetail) {
  return {
    slug: event.slug,
    group: event.group,
    title: event.title,
    sourceUrl: event.sourceUrl,
    saleType: event.saleType,
    windows: event.windows,
    dates: event.dates,
    slots: event.slots,
    members: event.members,
  };
}

export function buildFortuneSyncEvents(events: (FortuneEvent & FortuneEventDetail)[]) {
  return events.map(buildFortuneSyncEvent);
}

export function buildFortuneSyncBody(events: (FortuneEvent & FortuneEventDetail)[]) {
  return { events: buildFortuneSyncEvents(events) };
}

export function isFortuneEventDetailEmpty(detail: FortuneEventDetail): boolean {
  return detail.dates.length === 0 && detail.slots.length === 0 && detail.members.length === 0;
}

export function parseFortuneDateSection(text: string): string[] {
  return parseDates(text);
}

export function parseFortuneTimeSection(text: string): FortuneEventSlot[] {
  return parseSlots(text);
}

export function parseFortuneMembersSection(text: string): string[] {
  return parseMembers(text);
}

export function getFortuneSection(text: string, label: string): string {
  return extractSection(text, label);
}

export function cleanFortuneText(html: string): string {
  return htmlToText(html);
}

export function normalizeFortuneText(text: string): string {
  return normalizeJapaneseText(text);
}

export function parseFortuneDatesFromHtml(html: string): string[] {
  return parseDates(htmlToText(html));
}

export function parseFortuneSlotsFromHtml(html: string): FortuneEventSlot[] {
  return parseSlots(htmlToText(html));
}

export function parseFortuneMembersFromHtml(html: string): string[] {
  return parseMembers(htmlToText(html));
}

export function enrichFortuneEvents(events: FortuneEvent[], detailMap: Record<string, FortuneEventDetail>) {
  return events.map((event) => enrichFortuneEvent(event, detailMap[event.slug] || emptyFortuneEventDetail()));
}

export function buildFortuneDetailMap(detailEntries: Array<{ slug: string; detail: FortuneEventDetail }>) {
  return Object.fromEntries(detailEntries.map((entry) => [entry.slug, entry.detail]));
}

export function parseFortuneEventDetailSafe(html: string): FortuneEventDetail {
  try {
    return parseEventDetailHtml(html);
  } catch {
    return emptyFortuneEventDetail();
  }
}

export async function fetchFortuneEvents(): Promise<FortuneEvent[]> {
  try {
    const res = await fetch('https://fortunemusic.jp/event_list/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[fortune-music] fetch failed: ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseEventListHtml(html);
  } catch (err) {
    console.error('[fortune-music] fetch error:', err);
    return [];
  }
}

export function parseEventListHtml(html: string): FortuneEvent[] {
  const events: FortuneEvent[] = [];

  // Parse each event card anchor directly to avoid mixing neighboring cards.
  const cardRegex = /<a\b[^>]*href="(\/[a-z]+_\d{6}[^"]*?\/?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const href = match[1];
    const cardHtml = match[2];
    const slug = extractSlug(href);
    if (!slug) continue;
    // Skip known non-sakamichi slugs (sub-units, other artists)
    const slugPrefix = slug.split('_')[0];
    if (SKIP_SLUG_PREFIXES.includes(slugPrefix)) continue;

    const chunk = htmlToText(cardHtml);

    // 排除广告条目
    if (chunk.includes('マイアーティスト')) continue;

    // Detect group: prefer slug prefix, fall back to text pattern
    let group: GroupId | null = null;
    const groupFromSlug = slug.split('_')[0];
    if (groupFromSlug in SLUG_GROUP_MAP) {
      group = SLUG_GROUP_MAP[groupFromSlug];
    } else {
      for (const { group: g, pattern } of SAKAMICHI_PATTERNS) {
        if (pattern.test(chunk)) {
          group = g;
          break;
        }
      }
    }
    if (!group) continue;

    const title = extractTitleFromCard(chunk, group);

    if (!title) {
      // Fallback: use slug as title
      events.push({
        slug,
        group,
        title: slug,
        sourceUrl: href.startsWith('http') ? href : `https://fortunemusic.jp${href}`,
        saleType: detectSaleType(chunk),
        windows: parseWindows(chunk),
      });
      continue;
    }

    // Extract windows from the chunk
    const windows = parseWindows(chunk);

    // Detect sale type
    const saleType = detectSaleType(chunk);

    const sourceUrl = href.startsWith('http') ? href : `https://fortunemusic.jp${href}`;

    events.push({
      slug,
      group,
      title: title || slug,
      sourceUrl,
      saleType,
      windows,
    });
  }

  // Deduplicate by slug, keeping the richest parsed candidate.
  const uniqueEvents: FortuneEvent[] = [];
  const bestBySlug = new Map<string, FortuneEvent>();
  for (const event of events) {
    const existing = bestBySlug.get(event.slug);
    if (!existing) {
      bestBySlug.set(event.slug, event);
      continue;
    }

    const existingScore = existing.windows.length * 100 + existing.title.length;
    const nextScore = event.windows.length * 100 + event.title.length;
    if (nextScore > existingScore) {
      bestBySlug.set(event.slug, event);
    }
  }

  uniqueEvents.push(...bestBySlug.values());

  return uniqueEvents;
}
