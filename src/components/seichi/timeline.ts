import catalogue from './release-catalog.json';
import { getMarkerKind } from './marker-style';

export type TimelineInfo = { date: string; title: string; label: string; key: string; basis: 'cd-release' | 'title-date' };
export type SortOrder = 'original' | 'newest' | 'oldest';
type Location = { properties: { name?: string; category?: string; subcategory?: string; sceneTitle?: string; sceneNote?: string; source?: { group?: string; layer?: string } } };
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s「」『』“”"'’・!?！？、。.,‐–—-]/g, '');
const tracks = new Map<string, typeof catalogue.tracks>();
for (const track of catalogue.tracks) {
  const key = normalize(track.title);
  tracks.set(key, [...(tracks.get(key) || []), track]);
}
const groupIn = (text: string) => {
  const found = ['櫻坂46', '欅坂46', '日向坂46'].filter(group => text.includes(group));
  return found.length === 1 ? found[0] : '';
};
// Audited hiragana-era tracks reissued on the 2018 album: keep the original
// Keyaki single date rather than incorrectly making the locations look newer.
const sharedHiragana = new Set(['NO WAR in the future', 'W-KEYAKIZAKAの詩', 'それでも歩いてる', 'ひらがなけやき', 'イマニミテイロ', '僕たちは付き合っている', '半分の記憶', '誰よりも高く跳べ！'].map(normalize));
function lookup(title: string, group: string) {
  const matches = tracks.get(normalize(title)) || [];
  const scoped = group ? matches.filter(track => track.group === group) : matches;
  // Fall back only to an unambiguous group (e.g. historical hiragana songs).
  const shared = sharedHiragana.has(normalize(title)) && matches.every(track => ['欅坂46', '日向坂46'].includes(track.group));
  const candidates = shared ? matches : scoped.length ? scoped : matches;
  if (!shared && new Set(candidates.map(track => track.group)).size !== 1) return null;
  return [...candidates].sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}
function quoted(text: string) { return [...text.matchAll(/[「『]([^「」『』]+)[」』]/g)].map(match => match[1]); }
function releaseInfo(candidates: string[], group: string): TimelineInfo | null {
  const found = candidates.map(title => lookup(title, group)).filter(track => track !== null);
  // Multiple works from different dates do NOT imply the latest is the depicted work.
  if (!found.length || new Set(found.map(track => track.date)).size !== 1) return null;
  const track = found[0];
  return { date: track.date, title: track.title, label: 'CD発売日', key: `${track.group}:${track.title}:${track.date}`, basis: 'cd-release' };
}
function validDate(date: string) {
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

export function getTimelineInfo(feature: Location, groupLabel = ''): TimelineInfo | null {
  const p = feature.properties;
  const title = p.sceneTitle || '';
  const subcategory = p.subcategory || '';
  const layer = p.source?.layer || '';
  const primary = `${title} ${subcategory} ${layer}`;
  if (getMarkerKind(feature) === 'music') {
    const group = groupIn(primary) || groupIn(p.sceneNote || '') || groupIn(p.source?.group || '') || groupIn(groupLabel);
    // Explicit work subcategory outranks incidental comparisons in the location notes.
    const direct = releaseInfo([subcategory], group);
    if (direct) return direct;
    const named = releaseInfo(quoted(primary), group);
    if (named) return named;
    // Titles such as "We got your back / 渋谷1号踏切". Never match bare venue names.
    if (title && title !== p.name) {
      const prefix = releaseInfo([title.split(/\s[/／]\s/)[0]], group);
      if (prefix) return prefix;
    }
    const note = releaseInfo(quoted(p.sceneNote || ''), group);
    if (note) return note;
    return null;
  }
  // Only an explicit full date in the project title; never crawl timestamps, URL IDs,
  // addresses, history in notes, years alone or ambiguous MM/DD fragments.
  const dates = [...new Set([...primary.matchAll(/(?<!\d)(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})(?:日|\b)/g)]
    .map(match => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`).filter(validDate))];
  if (dates.length !== 1) return null;
  return { date: dates[0], title: title || subcategory, label: '企画タイトルの日付', key: `title:${dates[0]}:${title || subcategory}`, basis: 'title-date' };
}

export function compareTimeline(a: TimelineInfo | null | undefined, b: TimelineInfo | null | undefined, order: SortOrder): number {
  if (order === 'original') return 0;
  if (!a || !b) return a ? -1 : b ? 1 : 0; // Undated always last, in both directions.
  const dateOrder = a.date.localeCompare(b.date);
  return (order === 'newest' ? -dateOrder : dateOrder) || a.key.localeCompare(b.key, 'ja');
}
