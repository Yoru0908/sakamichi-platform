import { SOURCE_SCHEMA_VERSION, MAX_BLOGS, GROUP_NAMES, type BlogSource, type Group } from '../../src/utils/blog-relations/contract.ts';

// Existing blog-backend D1, NOT the auth/Miguri databases. This D1 also has
// unrelated backend tables: the binding is NOT a database-level read-only grant.
// Keep the fixed SELECT-only blogs whitelist below; never add a generic SQL/table
// proxy or read msg_messages/system_config. No schema/data changes or cron.
type Database = { prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[]; success: boolean }> } } };
type Context = { request: Request & { cf?: { country?: string } }; env: { BLOG_RELATIONS_SOURCE?: Database }; waitUntil(promise: Promise<unknown>): void };
const TTL = 600;
const GROUP_DB_NAMES: Record<Group, string[]> = { nogizaka: ['乃木坂46', '乃木坂46'], sakurazaka: ['樱坂46', '櫻坂46'], hinatazaka: ['日向坂46', '日向坂46'] };
export const CATALOG_SQL = `SELECT group_name, substr(replace(replace(publish_date, '.', '-'), '/', '-'), 1, 7) AS month, COUNT(*) AS blogCount,
  MAX(updated_at) AS latestSourceUpdate FROM blogs
  WHERE group_name IN ('乃木坂46', '樱坂46', '櫻坂46', '日向坂46') GROUP BY group_name, month ORDER BY month DESC`;
const MONTH_WHERE = `group_name IN (?, ?) AND (publish_date LIKE ? OR publish_date LIKE ? OR publish_date LIKE ?)`;
export const MONTH_SIZE_SQL = `SELECT COUNT(*) AS blogCount, SUM(coalesce(length(original_content), 0) + coalesce(length(bilingual_content), 0)) AS sourceChars FROM blogs WHERE ${MONTH_WHERE}`;
export const MONTH_SQL = `SELECT id, title, member, group_name, publish_date, original_url, updated_at,
  CASE WHEN length(original_content) <= 600000 THEN original_content END AS original_content,
  CASE WHEN length(bilingual_content) <= 600000 THEN bilingual_content END AS bilingual_content,
  CASE WHEN length(original_content) > 600000 OR length(bilingual_content) > 600000 THEN 1 ELSE 0 END AS oversized
  FROM blogs WHERE ${MONTH_WHERE}
  ORDER BY publish_date DESC, id LIMIT ?`;

const responseHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body: unknown, status = 200, head = false) => new Response(head ? null : JSON.stringify(body), { status, headers: responseHeaders });

// Defense in depth: keep this Chinese-site feature behind its existing domain
// boundary. Do not expose it on unguarded Pages preview/custom aliases. A JP
// request additionally needs a CURRENT approved/admin platform session; a forged
// geo_pass cookie alone is never accepted. Do this BEFORE looking in the cache.
export async function authorize(request: Context['request'], fetcher: typeof fetch = fetch) {
  if (new URL(request.url).hostname !== '46log.com') return false;
  if (request.cf?.country !== 'JP') return true;
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)access_token=([^;]+)/)?.[1];
  if (!token) return false;
  try {
    // /me checks the signed token AND current user row, without reading payment/OAuth links.
    const response = await fetcher('https://api.46log.com/api/auth/me', {
      headers: { Cookie: `access_token=${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean; data?: { user?: { role?: string; verificationStatus?: string } } };
    return result.success === true && (result.data?.user?.role === 'admin' || result.data?.user?.verificationStatus === 'approved');
  } catch { return false; }
}

export async function onRequest(context: Context) {
  const { request, env } = context;
  const head = request.method === 'HEAD';
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (!await authorize(request)) return json({ success: false, error: '此接口仅在中文主站开放；日本地区需要登录已认证账号。' }, 403, head);
  const url = new URL(request.url);
  const group = url.searchParams.get('group') as Group | null;
  const month = url.searchParams.get('month');
  const format = url.searchParams.get('format');
  if ([...url.searchParams.keys()].some((key) => !['group', 'month', 'format'].includes(key)) || ['group', 'month', 'format'].some((key) => url.searchParams.getAll(key).length > 1) || (format !== null && format !== 'source') ||
    ((url.searchParams.has('group') || url.searchParams.has('month')) && (!group || !month || !Object.hasOwn(GROUP_NAMES, group) || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)))) {
    return json({ success: false, error: '请选择有效的团体和月份。' }, 400, head);
  }
  // Fail clearly for the briefly released server-analysis client, rather than
  // returning raw rows where that client expects aggregate counts.
  if (group && format !== 'source') return json({ success: false, error: '关系分析已更新为后台线程计算，请刷新页面后重试。' }, 426, head);
  if (!env.BLOG_RELATIONS_SOURCE) return json({ success: false, error: '关系分析数据源尚未配置，未使用旧静态统计。' }, 503, head);
  const cacheKey = new Request(`https://46log.com/api/blog-relations?schema=${SOURCE_SCHEMA_VERSION}&group=${group || 'all'}&month=${month || 'catalog'}`);
  const cache = typeof caches !== 'undefined' ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  try {
    try {
      const hit = await cache?.match(cacheKey);
      if (hit) return new Response(head ? null : hit.body, { status: 200, headers: responseHeaders });
    } catch { /* Cache is an optimization, never the only source. */ }
    let data;
    if (group && month) {
      const parameters = [...GROUP_DB_NAMES[group], `${month.replace('-', '.')}%`, `${month.replace('-', '/')}%`, `${month}%`];
      // Check the aggregate BEFORE loading HTML; per-row limits alone cannot bound memory.
      const size = await env.BLOG_RELATIONS_SOURCE.prepare(MONTH_SIZE_SQL).bind(...parameters).all<{ blogCount: number; sourceChars: number | null }>();
      if (size.success === false || !size.results[0]) throw new Error('source size query failed');
      if (size.results[0].blogCount > MAX_BLOGS || (size.results[0].sourceChars || 0) > 6_000_000) return json({ success: false, error: '该月数据超出单次分析上限，未展示截断结果。' }, 422, head);
      const result = await env.BLOG_RELATIONS_SOURCE.prepare(MONTH_SQL)
        .bind(...parameters, MAX_BLOGS + 1).all<BlogSource>();
      if (result.success === false) throw new Error('source query failed');
      if (result.results.length > MAX_BLOGS) return json({ success: false, error: '该月数据超出单次分析上限，未展示截断结果。' }, 422, head);
      // Return only the explicit public-blog columns above. CPU-heavy parsing
      // and matching run in the browser's dedicated Web Worker, not a Pages request.
      data = { version: SOURCE_SCHEMA_VERSION, group, month, sourceFetchedAt: new Date().toISOString(), rows: result.results };
    } else {
      const result = await env.BLOG_RELATIONS_SOURCE.prepare(CATALOG_SQL).bind().all<{ group_name: string; month: string; blogCount: number; latestSourceUpdate: string }>();
      if (result.success === false) throw new Error('source query failed');
      const months: { group: Group; month: string; blogCount: number; latestSourceUpdate: string }[] = [];
      for (const row of result.results) {
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.month)) continue;
        const key = (Object.keys(GROUP_DB_NAMES) as Group[]).find((key) => GROUP_DB_NAMES[key].includes(row.group_name));
        if (!key) continue;
        const existing = months.find((item) => item.group === key && item.month === row.month);
        if (existing) { existing.blogCount += row.blogCount; existing.latestSourceUpdate = [existing.latestSourceUpdate, row.latestSourceUpdate].sort().at(-1)!; }
        else months.push({ group: key, month: row.month, blogCount: row.blogCount, latestSourceUpdate: row.latestSourceUpdate });
      }
      data = { version: SOURCE_SCHEMA_VERSION, computedAt: new Date().toISOString(), months };
    }
    const encoded = JSON.stringify({ success: true, data });
    if (cache) context.waitUntil(cache.put(cacheKey, new Response(encoded, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${TTL}` } })).catch(() => undefined));
    return new Response(head ? null : encoded, { status: 200, headers: responseHeaders });
  } catch (error) {
    console.error('[blog-relations] read-only analysis failed', error instanceof Error ? error.name : 'UnknownError');
    return json({ success: false, error: '日语存档暂时读取失败，请稍后重试。未使用旧静态统计代替。' }, 503, head);
  }
}
