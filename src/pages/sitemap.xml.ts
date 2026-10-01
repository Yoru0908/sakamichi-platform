export function GET() {
  const pages = ['/', '/about', '/contact', '/links', '/privacy', '/terms', '/blog', '/schedule', '/miguri', '/miguri/history', '/miguri/queue', '/repo', '/radio', '/tools', '/tools/msg-generator', '/tools/srt-fixer', '/tools/subtitle-merge', '/tools/fad-effect', '/seichi', '/seichi/sakurazaka', '/seichi/hinatazaka', '/seichi/keyakizaka', '/seichi/keyaki-hiragana', '/seichi/oversea', '/seichi/yamakawa-ui', '/seichi/tokyo10sha', '/seichi/fumi-sakurazaka'];
  const guides = ['sakurazaka','hinatazaka','keyakizaka','keyaki-hiragana','oversea','yamakawa-ui','tokyo10sha','fumi-sakurazaka'].map(m => '/seichi/guide/' + m);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages,...guides].map(p => `<url><loc>https://46log.com${p}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml;charset=utf-8' } });
}
