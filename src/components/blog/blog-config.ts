/** Blog configuration constants */

export const API_BASE = 'https://api.46log.com';
export const LOCAL_API = 'http://localhost:8787';
export const PAGE_SIZE = 32;
export const ALL_PAGE_SIZE = 16;
export const SIDEBAR_LIMIT = 10;
export const DETAIL_LIMIT = 50;
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
export const API_TIMEOUT = 15000;

// 官网博客图片归档在 Homeserver /vol1/blog-images/<host>/<path>。
// 候选顺序：优选 img.saka46log.com → 普通 CF img.46log.com → 官网原图；<img> onerror 逐个降级。
const ARCHIVED_IMAGE_HOSTS = ['www.nogizaka46.com', 'sakurazaka46.com', 'cdn.hinatazaka46.com'];
const IMAGE_MIRRORS = ['https://img.saka46log.com', 'https://img.46log.com'];

export function imageCandidates(originalUrl: string): string[] {
  try {
    const u = new URL(originalUrl);
    if (ARCHIVED_IMAGE_HOSTS.includes(u.hostname) && !u.search) {
      return [...IMAGE_MIRRORS.map(m => `${m}/${u.hostname}${u.pathname}`), `https://${u.hostname}${u.pathname}`];
    }
  } catch { /* not an absolute URL */ }
  return [originalUrl];
}

// 函数名沿用历史（曾经走 Cloudinary），调用方不变；width 目前无作用。
export function getCloudinaryUrl(originalUrl: string, width = 600): string {
  if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;
  return imageCandidates(originalUrl)[0];
}

// For HTML-string rendering: src + remaining candidates + inline onerror that walks them.
const IMG_ONERROR = "var f=(this.dataset.fb||'').split('|').filter(Boolean);if(f.length){this.dataset.fb=f.slice(1).join('|');this.src=f[0]}else{this.onerror=null}";

function imageSrcAttrs(originalUrl: string): string {
  const [src, ...rest] = imageCandidates(originalUrl);
  return rest.length ? `src="${src}" data-fb="${rest.join('|')}" onerror="${IMG_ONERROR}"` : `src="${src}"`;
}

// Rewrite every archived-host <img src="..."> in rendered blog HTML (bilingual_content or markdown output).
export function withArchivedImages(html: string): string {
  return html.replace(/<img\b([^>]*?)\ssrc=(["'])(https?:\/\/[^"']+)\2/gi,
    (m, before, _q, url) => imageCandidates(url).length > 1 ? `<img${before} ${imageSrcAttrs(url)}` : m);
}

// For React <img onError>.
export function nextImageCandidate(e: { currentTarget: HTMLImageElement }, originalUrl: string): void {
  const img = e.currentTarget;
  const list = imageCandidates(originalUrl);
  const i = list.indexOf(img.getAttribute('src') || '');
  if (i >= 0 && i < list.length - 1) img.src = list[i + 1];
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
