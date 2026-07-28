-- Automatic forTUNE application-history import for personal Miguri entries.
-- Only normalized history data is stored: no forTUNE credentials, cookies or
-- session tokens ever reach D1.
--
-- source_key is a deterministic per-user key of the upstream application record
-- so repeated imports update a row instead of accumulating tickets.
-- slot_number = 0 marks a record whose 第N部 is unknown (e.g. リアミ / サイン会).

ALTER TABLE miguri_user_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE miguri_user_entries ADD COLUMN source_key TEXT;
ALTER TABLE miguri_user_entries ADD COLUMN category TEXT;
ALTER TABLE miguri_user_entries ADD COLUMN venue TEXT;
ALTER TABLE miguri_user_entries ADD COLUMN import_title TEXT;
ALTER TABLE miguri_user_entries ADD COLUMN import_group TEXT;
ALTER TABLE miguri_user_entries ADD COLUMN applied_tickets INTEGER NOT NULL DEFAULT 0;
ALTER TABLE miguri_user_entries ADD COLUMN won_tickets INTEGER NOT NULL DEFAULT 0;
ALTER TABLE miguri_user_entries ADD COLUMN paid_tickets INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_miguri_entries_source_key
  ON miguri_user_entries(user_id, source_key)
  WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_miguri_entries_user_category
  ON miguri_user_entries(user_id, event_date, category);
