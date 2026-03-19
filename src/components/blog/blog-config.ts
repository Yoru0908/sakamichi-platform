/** Blog configuration constants */

export const API_BASE = 'https://api.sakamichi-tools.cn';
export const LOCAL_API = 'http://localhost:8787';
export const PAGE_SIZE = 32;
export const ALL_PAGE_SIZE = 16;
export const SIDEBAR_LIMIT = 10;
export const DETAIL_LIMIT = 50;
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
export const API_TIMEOUT = 15000;

export const CLOUDINARY_BASE = 'https://res.cloudinary.com/djoegafjn/image/fetch';

export function getCloudinaryUrl(originalUrl: string, width = 600): string {
  if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;
  return `${CLOUDINARY_BASE}/w_${width},q_75,f_auto,c_scale/${encodeURIComponent(originalUrl)}`;
}

export type GroupKey = 'nogizaka' | 'sakurazaka' | 'hinatazaka';

export interface GroupInfo {
  key: GroupKey;
  name: string;
  apiName: string;
  color: string;
}

export const GROUPS: Record<GroupKey, GroupInfo> = {
  nogizaka: { key: 'nogizaka', name: '乃木坂46', apiName: '乃木坂46', color: '#742581' },
  sakurazaka: { key: 'sakurazaka', name: '樱坂46', apiName: '樱坂46', color: '#F19DB5' },
  hinatazaka: { key: 'hinatazaka', name: '日向坂46', apiName: '日向坂46', color: '#7BC7E8' },
};

export function getGroupByName(name: string): GroupInfo | null {
  if (!name) return null;
  const n = name.replace('櫻', '樱');
  for (const g of Object.values(GROUPS)) {
    if (g.name === n || g.apiName === n) return g;
  }
  return null;
}

export function getGroupColor(keyOrName: string): string {
  const g = GROUPS[keyOrName as GroupKey] || getGroupByName(keyOrName);
  return g?.color || '#6b7280';
}

export function getGroupDisplayName(keyOrName: string): string {
  const g = GROUPS[keyOrName as GroupKey] || getGroupByName(keyOrName);
  return g?.name || keyOrName;
}

export function getGroupApiName(keyOrName: string): string {
  const g = GROUPS[keyOrName as GroupKey] || getGroupByName(keyOrName);
  return g?.apiName || keyOrName;
}

export function mapGroupName(groupName: string): GroupKey {
  if (groupName?.includes('乃木坂')) return 'nogizaka';
  if (groupName?.includes('樱坂') || groupName?.includes('櫻坂')) return 'sakurazaka';
  return 'hinatazaka';
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return API_BASE;
  // Always use production API — local API requires explicit opt-in
  return (window as any).__BLOG_API_BASE || API_BASE;
}

/** Format blog date: "2025/10/19 22:45:00" → "2025.10.19 22:45" */
export function formatBlogDate(dateStr: string | undefined): string {
  if (!dateStr) return '未知日期';
  try {
    let normalized = dateStr.replace(/[\/\-]/g, '.');
    const parts = normalized.split(' ');
    const datePart = parts[0];
    let timePart = parts.slice(1).join(' ');
    if (timePart?.includes(':')) {
      const tp = timePart.split(':');
      if (tp.length >= 2) timePart = `${tp[0]}:${tp[1]}`;
    }
    const [year, month, day] = datePart.split('.');
    if (year && month && day) {
      const f = `${year}.${month.padStart(2, '0')}.${day.padStart(2, '0')}`;
      return timePart ? `${f} ${timePart}` : f;
    }
    return normalized;
  } catch {
    return dateStr;
  }
}

export function parseBlogDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const normalized = dateStr.replace(/[\/\.]/g, '-').split(/[\sT]/)[0];
    return new Date(normalized);
  } catch {
    return null;
  }
}

export function extractDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const normalized = dateStr.replace(/[\/\-]/g, '.');
  const parts = normalized.split(/[\sT]/)[0].split('.');
  if (parts.length >= 3) {
    return { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) };
  }
  return null;
}
