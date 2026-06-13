-- Miguri sold-out analysis: availability snapshots per sync round
-- Each snapshot captures which members were available in which slots
-- at the time of a sync. By comparing consecutive snapshots, we can
-- determine which cells "sold out" (disappeared) between rounds.

CREATE TABLE IF NOT EXISTS miguri_soldout_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_slug TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  window_label TEXT NOT NULL DEFAULT '',
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  member_count INTEGER NOT NULL DEFAULT 0,
  cell_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(event_slug, round_number)
);

-- Stores which cells (member×date×slot) were LOST compared to previous snapshot
-- i.e., these are the newly sold-out cells in this round
CREATE TABLE IF NOT EXISTS miguri_soldout_cells (
  event_slug TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  event_date TEXT NOT NULL,
  slot_number INTEGER NOT NULL,
  member_name TEXT NOT NULL,
  PRIMARY KEY (event_slug, event_date, slot_number, member_name)
);

CREATE INDEX IF NOT EXISTS idx_soldout_snapshots_event ON miguri_soldout_snapshots(event_slug);
CREATE INDEX IF NOT EXISTS idx_soldout_cells_event ON miguri_soldout_cells(event_slug, round_number);
CREATE INDEX IF NOT EXISTS idx_soldout_cells_member ON miguri_soldout_cells(event_slug, member_name);
