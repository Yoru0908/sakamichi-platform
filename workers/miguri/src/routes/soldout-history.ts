import type { Env } from '../types.ts';
import { json } from '../utils/response.ts';
import { decodeHtmlEntities } from '../utils/ics.ts';

// Public catalogue only: archived events stay discoverable, even with no snapshots.
// Never load private entries or expand the current-event slot/member metadata cache.
export const SOLDOUT_HISTORY_SQL = `
  SELECT e.slug, e.group_id, e.title, e.source_url, e.status,
    COUNT(s.round_number) AS round_count,
    MAX(s.round_number) AS latest_round,
    MAX(s.captured_at) AS last_captured_at,
    COALESCE(
      (SELECT MIN(event_date) FROM miguri_event_slots WHERE event_slug = e.slug),
      (SELECT MIN(value) FROM json_each(CASE WHEN json_valid(e.raw_payload) THEN e.raw_payload ELSE '{}' END, '$.dates') WHERE type = 'text')
    ) AS first_date,
    COALESCE(
      (SELECT MAX(event_date) FROM miguri_event_slots WHERE event_slug = e.slug),
      (SELECT MAX(value) FROM json_each(CASE WHEN json_valid(e.raw_payload) THEN e.raw_payload ELSE '{}' END, '$.dates') WHERE type = 'text')
    ) AS last_date
  FROM miguri_events e
  LEFT JOIN miguri_soldout_snapshots s ON s.event_slug = e.slug
  WHERE e.group_id IN ('nogizaka', 'sakurazaka', 'hinatazaka')
  GROUP BY e.slug
  ORDER BY last_captured_at DESC, last_date DESC, e.slug DESC
`;

type HistoryRow = {
  slug: string;
  group_id: string;
  title: string;
  source_url: string;
  status: string;
  round_count: number;
  latest_round: number | null;
  last_captured_at: string | null;
  first_date: string | null;
  last_date: string | null;
};

export async function handleGetMiguriSoldOutHistory(_req: Request, env: Env): Promise<Response> {
  const cache = typeof caches === 'undefined' ? undefined : (caches as CacheStorage & { default?: Cache }).default;
  const key = new Request('https://api.46log.com/api/miguri/soldout-history?cache=v1');
  try {
    const cached = await cache?.match(key);
    if (cached) return cached;
  } catch { /* Cache failures must not make the read-only catalogue unavailable. */ }

  const rows = await env.MIGURI_DB.prepare(SOLDOUT_HISTORY_SQL).all<HistoryRow>();
  const response = json({
    success: true,
    data: {
      events: (rows.results || []).map((row: HistoryRow) => ({
        slug: row.slug,
        group: row.group_id,
        title: decodeHtmlEntities(row.title),
        sourceUrl: row.source_url,
        archived: row.status === 'archived',
        roundCount: row.round_count,
        latestRound: row.latest_round,
        lastCapturedAt: row.last_captured_at,
        firstDate: row.first_date,
        lastDate: row.last_date,
      })),
    },
  }, 200, { 'Cache-Control': 'public, max-age=300', Vary: 'Origin' });
  try {
    await cache?.put(key, response.clone());
  } catch { /* D1 is authoritative. No archive writes are performed here. */ }
  return response;
}
