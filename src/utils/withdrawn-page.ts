// Reversible website withdrawal. No archive data, accounts or shared services are deleted.
export function withdrawnPage(): Response {
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>此功能已下架 - Sakamichi Tools</title><style>body{font:16px/1.7 system-ui,sans-serif;margin:0;background:#f8f8fa;color:#25212a}main{max-width:34rem;margin:18vh auto;padding:2rem}h1{font-size:1.5rem}p{color:#666}a{color:#742581}</style></head><body><main><h1>此功能已下架</h1><p>该页面暂不开放。</p><a href="/">返回首页</a></main></body></html>`, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    },
  });
}
