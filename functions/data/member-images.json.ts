/**
 * Cloudflare Pages Function — /data/member-images.json
 *
 * 官网公式照索引的主源是 sakamichi-blog-frontend 仓库（Homeserver
 * ~/sakamichi-member-images 每天 JST 07:00/13:00 抓取并 push）。本站的
 * public/data/member-images.json 只是构建时副本，不会自动更新——官网换图后
 * 46log 会一直显示旧照片（2026-10 实际发生：官网 10/01 换图，本站停在 6/16）。
 *
 * 这里改为读取主源最新版；主源不可用或内容异常时回退到静态副本。
 */

const SOURCE_URL =
  'https://raw.githubusercontent.com/Yoru0908/sakamichi-blog-frontend/main/data/member-images.json';
const MIN_MEMBERS = 100; // 正常约 315 条；明显偏少视为异常数据，不覆盖静态副本

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const res = await fetch(SOURCE_URL, {
      signal: AbortSignal.timeout(5000),
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!res.ok) return context.next();
    const body = await res.text();
    const data = JSON.parse(body);
    if (!data?.images || Object.keys(data.images).length < MIN_MEMBERS) return context.next();
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=600, s-maxage=3600',
      },
    });
  } catch {
    return context.next();
  }
};
