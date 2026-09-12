import type { MiguriGroupId, MiguriSoldOutHistoryEvent } from '@/utils/auth-api';

export const SOLDOUT_GROUP_LABELS: Record<MiguriGroupId, string> = {
  nogizaka: '乃木坂46', sakurazaka: '櫻坂46', hinatazaka: '日向坂46',
};
export type SoldOutHistoryFilters = {
  group: MiguriGroupId | 'all';
  scope: 'recorded' | 'archived' | 'all';
  query: string;
};

export function filterSoldOutHistory(events: MiguriSoldOutHistoryEvent[], filters: SoldOutHistoryFilters) {
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s/g, '');
  const query = normalize(filters.query);
  return events.filter((event) => (
    (filters.group === 'all' || event.group === filters.group)
    && (filters.scope === 'all' || event.roundCount > 0)
    && (filters.scope !== 'archived' || event.archived)
    && (!query || normalize(`${SOLDOUT_GROUP_LABELS[event.group]} ${event.title} ${event.slug}`).includes(query))
  )).sort((a, b) => (
    Number(b.archived) - Number(a.archived)
    || (b.lastCapturedAt || '').localeCompare(a.lastCapturedAt || '')
    || (b.lastDate || '').localeCompare(a.lastDate || '')
    || a.slug.localeCompare(b.slug)
  ));
}

export function formatSoldOutCapture(value: string | null) {
  if (!value) return '未采集';
  // SQLite CURRENT_TIMESTAMP is UTC, not the browser's local timezone.
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z' : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour12: false,
  }) + ' JST';
}
