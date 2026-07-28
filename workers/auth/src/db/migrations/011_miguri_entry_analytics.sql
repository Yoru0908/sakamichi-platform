ALTER TABLE miguri_user_entries ADD COLUMN unit_price_yen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE miguri_user_entries ADD COLUMN spend_yen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE miguri_user_entries ADD COLUMN sign_lots INTEGER NOT NULL DEFAULT 0;
ALTER TABLE miguri_user_entries ADD COLUMN application_round TEXT;
ALTER TABLE miguri_user_entries ADD COLUMN source_synced_at TEXT;

CREATE INDEX IF NOT EXISTS idx_miguri_entries_user_source_synced
  ON miguri_user_entries(user_id, source, source_synced_at);
