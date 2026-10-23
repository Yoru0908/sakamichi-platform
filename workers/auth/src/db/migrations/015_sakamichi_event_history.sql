-- TARGET: miguri D1 / MIGURI_DB only. Do NOT apply to sakamichi-auth or saka46log.
-- Private memos deliberately survive unmarking. Re-marking the same day restores them.
CREATE TABLE IF NOT EXISTS sakamichi_event_memos (
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  cost TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id,event_id)
);
-- No row means private. Public names are explicitly chosen here, not copied from an account.
CREATE TABLE IF NOT EXISTS sakamichi_event_profiles (
  user_id TEXT PRIMARY KEY,
  public_enabled INTEGER NOT NULL DEFAULT 0 CHECK (public_enabled IN (0,1)),
  public_name TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sakamichi_event_profiles_public ON sakamichi_event_profiles(public_enabled);
CREATE INDEX IF NOT EXISTS sakamichi_event_marks_user_date ON sakamichi_event_marks(user_id,date DESC,event_id);
