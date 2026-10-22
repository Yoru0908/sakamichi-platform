-- miguri D1 (binding MIGURI_DB, database "miguri") — NOT sakamichi-auth.
-- 46log 参加ログ (plan E5): a user's 行く / 参加した marks on the three groups' events (ids from 坂ログ's events table:
-- Sakurazaka "<count>:<date>", Hinatazaka "h_<code>:<date>", Nogizaka "n_<code>:<date>"). 46log accounts only; 坂ログ marks are separate.
-- grp / date / title are copied at mark time: per-year counts by index, and a history that survives a renamed or dropped official row.

CREATE TABLE IF NOT EXISTS sakamichi_event_marks (
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS sakamichi_event_marks_grp_date ON sakamichi_event_marks(grp, date);
