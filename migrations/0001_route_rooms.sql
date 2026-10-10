-- 巡礼ルートの共同編集ルーム。リンクを知っている人だけが読み書きできる（ログインなし）。
-- 保存するのは地点キー・移動方法・タイトルのみ。現在地や進捗は保存しない。
CREATE TABLE IF NOT EXISTS route_rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL,
  keys TEXT NOT NULL CHECK(json_valid(keys)),
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS route_rooms_updated ON route_rooms(updated_at);
