// 巡礼ルートの共同編集ルーム（サーバー側）。D1 に 1 ルーム 1 行。
// ログインなし: 推測できない id を知っている人だけが読み書きできる（リンク = 編集権）。
// 保存するのは地点キー・移動方法・タイトルだけ。現在地や進捗は保存しない。

export interface RoomDb {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
}

export const ROOM_SCHEMA = `CREATE TABLE IF NOT EXISTS route_rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL,
  keys TEXT NOT NULL CHECK(json_valid(keys)),
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_RE = /^[a-z2-9]{10}$/;
const MODES = new Set(['transit', 'walking', 'driving']);
const MAX_BODY = 16 * 1024;
const MAX_KEY_LENGTH = 200;
const MAX_TITLE = 40;
const HOURLY_CREATE_CAP = 300;
const EXPIRE_MS = 90 * 24 * 3600 * 1000;

type Row = { id: string; title: string; mode: string; keys: string; version: number; updated_at: number };
type Input = { keys: string[]; mode: string; title: string };

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string) => reply({ ok: false, error }, status);
const publicRoom = (r: Row) => ({ ok: true, id: r.id, title: r.title, mode: r.mode, keys: JSON.parse(r.keys) as string[], version: r.version, updatedAt: r.updated_at });

const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
};

async function readInput(request: Request, maxStops: number): Promise<(Input & { baseVersion?: number }) | null> {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!Array.isArray(body.keys) || typeof body.mode !== 'string' || !MODES.has(body.mode)) return null;
    const keys = body.keys.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= MAX_KEY_LENGTH);
    if (keys.length !== body.keys.length || new Set(keys).size !== keys.length || keys.length > maxStops) return null;
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : '';
    const baseVersion = Number.isInteger(body.baseVersion) ? (body.baseVersion as number) : undefined;
    return { keys, mode: body.mode, title, baseVersion };
  } catch {
    return null;
  }
}

/**
 * `sub` は API ベースからの相対パス: ''（作成）, '/_'（利用可否の確認）, '/<id>'（取得/更新）。
 * db が無い環境（D1 未接続）は 503 を返し、フロントは「共同編集」を隠す。
 */
export async function handleRouteRooms(request: Request, db: RoomDb | undefined, sub: string, opts: { maxStops?: number } = {}): Promise<Response> {
  const maxStops = opts.maxStops ?? 12;
  if (!db) return fail(503, 'unavailable');
  const method = request.method;
  const now = Date.now();

  if (sub === '/_' && method === 'GET') return reply({ ok: true });

  if (sub === '' && method === 'POST') {
    const input = await readInput(request, maxStops);
    if (!input || input.keys.length === 0) return fail(400, 'invalid_route');
    const recent = await db.prepare('SELECT COUNT(*) AS n FROM route_rooms WHERE created_at > ?').bind(now - 3600_000).first<{ n: number }>();
    if ((recent?.n ?? 0) >= HOURLY_CREATE_CAP) return fail(429, 'busy');
    await db.prepare('DELETE FROM route_rooms WHERE updated_at < ?').bind(now - EXPIRE_MS).run();
    const id = newId();
    await db.prepare('INSERT INTO route_rooms (id, title, mode, keys, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .bind(id, input.title, input.mode, JSON.stringify(input.keys), now, now).run();
    return reply({ ok: true, id, version: 1 }, 201);
  }

  const id = sub.startsWith('/') ? sub.slice(1) : '';
  if (!ID_RE.test(id)) return fail(404, 'not_found');
  const load = () => db.prepare('SELECT id, title, mode, keys, version, updated_at FROM route_rooms WHERE id = ?').bind(id).first<Row>();

  if (method === 'GET') {
    const row = await load();
    return row ? reply(publicRoom(row)) : fail(404, 'not_found');
  }

  if (method === 'PUT') {
    const input = await readInput(request, maxStops);
    if (!input || input.baseVersion === undefined || input.keys.length === 0) return fail(400, 'invalid_route');
    const res = await db.prepare('UPDATE route_rooms SET title = ?, mode = ?, keys = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
      .bind(input.title, input.mode, JSON.stringify(input.keys), now, id, input.baseVersion).run();
    if (res.meta?.changes) return reply({ ok: true, version: input.baseVersion + 1 });
    const row = await load();
    return row ? reply({ ...publicRoom(row), ok: false, error: 'conflict' }, 409) : fail(404, 'not_found');
  }

  return fail(405, 'method_not_allowed');
}
