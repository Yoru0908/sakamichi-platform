/**
 * 图片 URL 代理工具
 *
 * 生产环境（Cloudflare Pages）将坂道公式サイトの外部图片 URL
 * 重写为同源代理路径 /api/proxy-image?url=...，解决 html2canvas 跨域污染。
 *
 * 本地开发环境（localhost）直接返回原始 URL。
 */

const EXTERNAL_IMAGE_HOSTS = [
  'nogizaka46.com',
  'sakurazaka46.com',
  'hinatazaka46.com',
  'keyakizaka46.com',
];

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');
}

function isExternalImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return EXTERNAL_IMAGE_HOSTS.some(
      (host) => u.hostname === host || u.hostname.endsWith('.' + host),
    );
  } catch {
    return false;
  }
}

/**
 * 将外部图片 URL 转换为同源代理 URL。
 * - 本地开发：直接返回原始 URL
 * - 生产环境：返回 /api/proxy-image?url=<encoded>
 * - data:/blob: URI 或已是同源路径：原样返回
 */
export function proxyImageUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;

  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/')) return url;
  if (isLocalhost()) return url;
  if (!isExternalImageUrl(url)) return url;

  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}
