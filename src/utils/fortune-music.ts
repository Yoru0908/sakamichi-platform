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
  saleType: string;
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

export type EnrichedFortuneEvent = FortuneEvent & FortuneEventDetail;

export type MiguriSyncPayload = {
  events: Array<{
    slug: string;
    group: GroupId;
    title: string;
    sourceUrl: string;
    saleType: string;
    windows: ReceptionWindow[];
    dates: string[];
    slots: FortuneEventSlot[];
    members: string[];
  }>;
};

const SAKAMICHI_PATTERNS: { group: GroupId; pattern: RegExp }[] = [
  { group: 'nogizaka', pattern: /乃木坂46/ },
  { group: 'hinatazaka', pattern: /日向坂46/ },
  { group: 'sakurazaka', pattern: /櫻坂46/ },
];

const SLUG_GROUP_MAP: Record<string, GroupId> = {
  nogizaka: 'nogizaka',
  hinatazaka: 'hinatazaka',
  sakurazaka: 'sakurazaka',
};

const SKIP_SLUG_PREFIXES = ['rosy', 'joy', 'yuri', 'asuka', 'sayuringo', 'guttsu'];

function extractSlug(href: string): string | null {
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
    .replace(/\s+([、。・：；])/g, '$1')
    .replace(/([『「（【])\s*([^『「」』（）【】]+?)\s*([」』）】])/g, '$1$2$3')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeEventDate(value: string): string | null {
  const match = value.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String('０１２３４５６７８９'.indexOf(char)));
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
  const pairRegex = /(?:(第[0-9１-９]+次(?:[～~－-][^受]+)?受付|【[^受]*第?[0-9１-９]+次?[^】]*受付[^】]*】|先着販売\/第[0-9１-９]+次|第[0-9１-９]+次|【抽選販売】|【先着販売】))\s*(\d{4}年\d{1,2}月\d{1,2}日[（(][^)）]+[)）]\d{1,2}[：:]\d{2})\s*[～~～]\s*(\d{4}年\d{1,2}月\d{1,2}日[（(][^)）]+[)）]\d{1,2}[：:]\d{2})/g;

  let match: RegExpExecArray | null;
  while ((match = pairRegex.exec(text)) !== null) {
    windows.push({
      label: normalizeJapaneseText(match[1].replace(/[【】]/g, '').trim()),
      start: normalizeJapaneseText(match[2]),
      end: normalizeJapaneseText(match[3]),
    });
  }

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

function extractSection(text: string, label: string): string {
  const start = text.indexOf(label);
  if (start === -1) return '';
  const rest = text.slice(start + label.length);
  const nextLabel = rest.search(/(?:【[^】]+】|受付スケジュール|イベント概要|参加方法|注意事項|対象商品)/);
  return normalizeJapaneseText((nextLabel === -1 ? rest : rest.slice(0, nextLabel)).trim());
}

function extractSectionRaw(text: string, label: string): string {
  const start = text.indexOf(label);
  if (start === -1) return '';
  const rest = text.slice(start + label.length);
  const nextLabel = rest.search(/(?:【[^】]+】|受付スケジュール|イベント概要|参加方法|注意事項|対象商品)/);
  return (nextLabel === -1 ? rest : rest.slice(0, nextLabel)).trim();
}

function parseDates(text: string): string[] {
  const section = extractSection(text, '【日程】');
  const matches = section.match(/\d{4}年\s*\d{1,2}月\s*\d{1,2}日/g) || [];
  return Array.from(new Set(matches.map(normalizeEventDate).filter((value): value is string => Boolean(value))));
}

function parseSlots(text: string): FortuneEventSlot[] {
  const section = text;
  const slots: FortuneEventSlot[] = [];
  const legacyRegex = /第\s*([0-9０-９]+)部\s*受付\s*([0-9０-９]{1,2}[：:][0-9０-９]{2})\s*\/\s*開始\s*([0-9０-９]{1,2}[：:][0-9０-９]{2})\s*\/\s*受付締切\s*([0-9０-９]{1,2}[：:][0-9０-９]{2})\s*\/\s*終了予定\s*([0-9０-９]{1,2}[：:][0-9０-９]{2})/g;
  const currentRegex = /[＜<]\s*第\s*([0-9０-９]+)部\s*[＞>]\s*受付開始\s*([0-9０-９]{1,2}[：:][0-9０-９]{2})\s*\/\s*イベント開始\s*([0-9０-９]{1,2}[：:][0-9０-９]{2})\s*\/\s*受付終了\s*([0-9０-９]{1,2}[：:][0-9０-９]{2})\s*[（(]\s*(?:([0-9０-９]{1,2})時([0-9０-９]{2})分|([0-9０-９]{1,2}[：:][0-9０-９]{2}))\s*終了予定\s*[）)]/g;

  const normalizeTime = (value: string) => {
    const normalized = normalizeDigits(value).replace(/：/g, ':').trim();
    const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return normalized;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  };

  let match: RegExpExecArray | null;
  while ((match = legacyRegex.exec(section)) !== null) {
    slots.push({
      slotNumber: Number(normalizeDigits(match[1])),
      receptionStart: normalizeTime(match[2]),
      startTime: normalizeTime(match[3]),
      receptionEnd: normalizeTime(match[4]),
      endTime: normalizeTime(match[5]),
    });
  }

  while ((match = currentRegex.exec(section)) !== null) {
    slots.push({
      slotNumber: Number(normalizeDigits(match[1])),
      receptionStart: normalizeTime(match[2]),
      startTime: normalizeTime(match[3]),
      receptionEnd: normalizeTime(match[4]),
      endTime: match[7] ? normalizeTime(match[7]) : normalizeTime(`${match[5]}:${match[6]}`),
    });
  }

  return Array.from(new Map(slots.map((slot) => [`${slot.slotNumber}:${slot.receptionStart}:${slot.startTime}:${slot.receptionEnd}:${slot.endTime}`, slot])).values())
    .sort((left, right) => left.slotNumber - right.slotNumber);
}

function parseMembers(text: string): string[] {
  const section = extractSectionRaw(text, '【参加メンバー】');
  if (!section) return [];

  return Array.from(new Set(
    section
      .split(/\n+/)
      .flatMap((line) => line.split(/[、,\/]/))
      .map((member) => normalizeJapaneseText(member))
      .map((member) => member.replace(/\s+/g, ' ').trim())
      .map((member) => member.replace(/\s+/g, ''))
      .filter((member) => member
        && !member.startsWith('※')
        && !member.includes('詳しくは')
        && !member.includes('参加メンバーは都合')
        && !member.includes('スケジュールの都合')
        && !member.includes('不参加とさせていただきます')
        && !member.includes('休業のため')
        && !member.includes('変更となる場合')),
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

    return parseEventDetailHtml(await res.text());
  } catch (err) {
    console.error('[fortune-music] detail fetch error:', err);
    return { dates: [], slots: [], members: [] };
  }
}

export async function fetchFortuneEventsWithDetails(): Promise<EnrichedFortuneEvent[]> {
  const events = await fetchFortuneEvents();
  return Promise.all(events.map(async (event) => ({
    ...event,
    ...(await fetchFortuneEventDetail(event.sourceUrl)),
  })));
}

export function buildMiguriSyncPayload(events: EnrichedFortuneEvent[]): MiguriSyncPayload {
  return {
    events: events.map((event) => ({
      slug: event.slug,
      group: event.group,
      title: event.title,
      sourceUrl: event.sourceUrl,
      saleType: event.saleType,
      windows: event.windows,
      dates: [...event.dates].sort(),
      slots: [...event.slots].sort((a, b) => a.slotNumber - b.slotNumber),
      members: Array.from(new Set(event.members)).sort((a, b) => a.localeCompare(b, 'ja')),
    })),
  };
}

export function parseEventListHtml(html: string): FortuneEvent[] {
  const events: FortuneEvent[] = [];
  const cardRegex = /<a\b[^>]*href="(\/[a-z]+_\d{6}[^"]*?\/?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const href = match[1];
    const cardHtml = match[2];
    const slug = extractSlug(href);
    if (!slug) continue;

    const slugPrefix = slug.split('_')[0];
    if (SKIP_SLUG_PREFIXES.includes(slugPrefix)) continue;

    const chunk = htmlToText(cardHtml);
    if (chunk.includes('マイアーティスト')) continue;

    let group: GroupId | null = null;
    if (slugPrefix in SLUG_GROUP_MAP) {
      group = SLUG_GROUP_MAP[slugPrefix];
    } else {
      for (const { group: candidate, pattern } of SAKAMICHI_PATTERNS) {
        if (pattern.test(chunk)) {
          group = candidate;
          break;
        }
      }
    }
    if (!group) continue;

    const title = extractTitleFromCard(chunk, group);
    events.push({
      slug,
      group,
      title: title || slug,
      sourceUrl: href.startsWith('http') ? href : `https://fortunemusic.jp${href}`,
      saleType: detectSaleType(chunk),
      windows: parseWindows(chunk),
    });
  }

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

  return Array.from(bestBySlug.values());
}
