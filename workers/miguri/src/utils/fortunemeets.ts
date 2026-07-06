export type FortuneMeetsGroupId = 'nogizaka' | 'hinatazaka' | 'sakurazaka';
export type FortuneMeetsMode = 'real' | 'online';

export type FortuneMeetsSource = {
  artist: string;
  event: string;
};

type RawApplyTableItem = {
  id?: string;
  date?: string;
  part?: string;
  members?: string[];
  closedMembers?: string[];
};

type RawAward = {
  id?: number;
  name?: string;
  applyTable?: RawApplyTableItem[];
};

type RawApplication = {
  awards?: RawAward[];
};

type RawConfig = {
  eventId?: string;
  eventName?: string;
  artistName?: string;
  applications?: RawApplication[];
};

const GROUP_BY_ARTIST: Record<string, FortuneMeetsGroupId> = {
  nogizaka46: 'nogizaka',
  hinatazaka46: 'hinatazaka',
  sakurazaka46: 'sakurazaka',
};

const GROUP_BY_NAME: Record<string, FortuneMeetsGroupId> = {
  '乃木坂46': 'nogizaka',
  '日向坂46': 'hinatazaka',
  '櫻坂46': 'sakurazaka',
  '樱坂46': 'sakurazaka',
};

const GROUP_LABELS: Record<FortuneMeetsGroupId, string> = {
  nogizaka: '乃木坂46',
  hinatazaka: '日向坂46',
  sakurazaka: '櫻坂46',
};

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeMember(name: string): string {
  return decodeHtml(name || '').replace(/[\s\u3000]+/g, '').trim();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function inferGroup(config: RawConfig, source: FortuneMeetsSource): FortuneMeetsGroupId {
  if (GROUP_BY_ARTIST[source.artist]) return GROUP_BY_ARTIST[source.artist];
  return GROUP_BY_NAME[`${config.artistName || ''}`] || 'sakurazaka';
}

function configUrl(source: FortuneMeetsSource): string {
  return `https://ticket.fortunemeets.app/data/${encodeURIComponent(source.artist)}/${encodeURIComponent(source.event)}/config.json`;
}

function pageUrl(source: FortuneMeetsSource): string {
  return `https://ticket.fortunemeets.app/${encodeURIComponent(source.artist)}/${encodeURIComponent(source.event)}#/`;
}

function parseDateLabel(rawDate: string): { date: string; dateLabel: string; venue: string } {
  const text = decodeHtml(rawDate || '').trim();
  const [datePart, ...venueParts] = text.split('＠');
  const match = datePart.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\((.)\))?/);
  return {
    date: match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : datePart,
    dateLabel: datePart,
    venue: venueParts.join('＠').trim(),
  };
}

function parsePart(rawPart: string): { part: number; partLabel: string } {
  const label = decodeHtml(rawPart || '').trim();
  const normalized = label
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/[一]/g, '1')
    .replace(/[二]/g, '2')
    .replace(/[三]/g, '3')
    .replace(/[四]/g, '4')
    .replace(/[五]/g, '5')
    .replace(/[六]/g, '6')
    .replace(/[七]/g, '7')
    .replace(/[八]/g, '8')
    .replace(/[九]/g, '9');
  const match = normalized.match(/(\d+)/);
  return { part: match ? Number(match[1]) : 0, partLabel: label };
}

function awardMode(award: RawAward): FortuneMeetsMode | null {
  const name = award.name || '';
  if (name.includes('リアルミート')) return 'real';
  if (name.includes('オンラインミート')) return 'online';
  return null;
}

function shortAwardTitle(rawName: string): string {
  const name = decodeHtml(rawName || '');
  const singleMatch = name.match(/(\d+(?:st|nd|rd|th).*?Single『.*?』)/);
  if (singleMatch) return singleMatch[1];
  const titleMatch = name.match(/Single『(.*?)』/);
  if (titleMatch) return titleMatch[1];
  return name.replace(/^購入者応募抽選企画！/, '').slice(0, 80);
}

function analyzeAward(award: RawAward, mode: FortuneMeetsMode, config: RawConfig, source: FortuneMeetsSource, now: string) {
  const group = inferGroup(config, source);
  const slots = (award.applyTable || []).map((item) => {
    const parsedDate = parseDateLabel(item.date || '');
    const parsedPart = parsePart(item.part || '');
    return {
      id: item.id || `${parsedDate.date}_${parsedPart.part}`,
      date: parsedDate.date,
      dateLabel: parsedDate.dateLabel,
      venue: parsedDate.venue,
      part: parsedPart.part,
      partLabel: parsedPart.partLabel,
      members: unique((item.members || []).map(normalizeMember).filter(Boolean)),
      closedMembers: unique((item.closedMembers || []).map(normalizeMember).filter(Boolean)),
    };
  }).sort((left, right) => left.date.localeCompare(right.date) || left.part - right.part || left.id.localeCompare(right.id));

  const members = unique(slots.flatMap((slot) => slot.members)).sort((left, right) => left.localeCompare(right, 'ja'));
  const memberTotals: Record<string, number> = {};
  const memberClosedTotals: Record<string, number> = {};
  for (const member of members) {
    memberTotals[member] = 0;
    memberClosedTotals[member] = 0;
  }

  for (const slot of slots) {
    const closedSet = new Set(slot.closedMembers);
    for (const member of slot.members) {
      memberTotals[member] = (memberTotals[member] || 0) + 1;
      if (closedSet.has(member)) memberClosedTotals[member] = (memberClosedTotals[member] || 0) + 1;
    }
  }

  const memberSummaries = members.map((member) => ({
    name: member,
    closedCount: memberClosedTotals[member] || 0,
    totalCount: memberTotals[member] || 0,
  })).sort((left, right) => right.closedCount - left.closedCount || right.totalCount - left.totalCount || left.name.localeCompare(right.name, 'ja'));

  const totalCells = Object.values(memberTotals).reduce((sum, value) => sum + value, 0);
  const closedCells = Object.values(memberClosedTotals).reduce((sum, value) => sum + value, 0);

  return {
    awardId: Number(award.id || 0),
    mode,
    name: decodeHtml(award.name || ''),
    title: shortAwardTitle(award.name || ''),
    group,
    groupName: GROUP_LABELS[group],
    sourceUrl: pageUrl(source),
    sourceConfigUrl: configUrl(source),
    slots,
    members,
    memberTotals,
    memberClosedTotals,
    memberSummaries,
    totalCells,
    closedCells,
    openCells: Math.max(0, totalCells - closedCells),
    closedRate: totalCells > 0 ? Math.round((closedCells / totalCells) * 1000) / 10 : 0,
    updatedAt: now,
  };
}

export function analyzeFortuneMeetsConfig(config: RawConfig, source: FortuneMeetsSource) {
  const now = new Date().toISOString();
  const group = inferGroup(config, source);
  const awards = (config.applications || [])
    .flatMap((application) => application.awards || [])
    .map((award) => ({ award, mode: awardMode(award) }))
    .filter((item): item is { award: RawAward; mode: FortuneMeetsMode } => Boolean(item.mode))
    .map(({ award, mode }) => analyzeAward(award, mode, config, source, now));

  return {
    eventId: config.eventId || `${source.artist}_${source.event}`,
    eventName: decodeHtml(config.eventName || ''),
    artistName: decodeHtml(config.artistName || GROUP_LABELS[group]),
    group,
    groupName: GROUP_LABELS[group],
    sourceUrl: pageUrl(source),
    sourceConfigUrl: configUrl(source),
    awards,
    updatedAt: now,
  };
}

export async function fetchFortuneMeetsAnalysis(source: FortuneMeetsSource, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(configUrl(source), {
    headers: {
      'User-Agent': 'Mozilla/5.0 46log-miguri-worker',
      'Accept': 'application/json,text/plain,*/*',
    },
  });
  if (!res.ok) throw new Error(`Fortune Meets config fetch failed: ${res.status}`);
  const config = await res.json() as RawConfig;
  return analyzeFortuneMeetsConfig(config, source);
}
