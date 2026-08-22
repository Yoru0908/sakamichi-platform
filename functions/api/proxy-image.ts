/**
 * Cloudflare Pages Function — 图片代理
 *
 * 将坂道公式サイトのメンバー画像を同源代理，解决 html2canvas 跨域污染问题。
 *
 * Usage: GET /api/proxy-image?url=<encoded_url>
 *
 * 安全策略：
 * - 仅允许白名单域名（坂道公式 + CDN）
 * - 限制响应大小 ≤ 10MB
 * - 设置 24h 浏览器 + Cloudflare CDN 缓存
 */

const ALLOWED_HOSTS = [
  'www.nogizaka46.com',
  'nogizaka46.com',
  'sakurazaka46.com',
  'www.sakurazaka46.com',
  'cdn.hinatazaka46.com',
  'hinatazaka46.com',
  'www.hinatazaka46.com',
  'keyakizaka46.com',
  'www.keyakizaka46.com',
  'mymaps.usercontent.google.com',
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const CACHE_TTL = 86400; // 24h

function isAllowed(url: URL): boolean {
  return ALLOWED_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith('.' + host),
  );
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get('url');

  if (!target) {
    return new Response('Missing "url" parameter', { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return new Response('Only http/https allowed', { status: 403 });
  }

  if (!isAllowed(targetUrl)) {
    return new Response('Host not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(targetUrl.href, {
      headers: { 'User-Agent': 'sakamichi-platform-image-proxy/1.0' },
      cf: { cacheTtl: CACHE_TTL },
    });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status });
    }

    const contentLength = upstream.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
      return new Response('Image too large', { status: 413 });
    }

    const reader = upstream.body?.getReader();
    if (!reader) {
      return new Response('Empty body', { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_SIZE) {
        reader.cancel();
        return new Response('Image too large', { status: 413 });
      }
      chunks.push(value);
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }

    const ext = targetUrl.pathname.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
    };
    const contentType = mimeMap[ext || ''] || upstream.headers.get('content-type') || 'image/jpeg';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*',
        'X-Proxy-Source': targetUrl.hostname,
      },
    });
  } catch (err: any) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
};
