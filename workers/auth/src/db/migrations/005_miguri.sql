-- Miguri dedicated D1 schema

CREATE TABLE IF NOT EXISTS miguri_events (
  slug TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  sale_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  synced_at TEXT NOT NULL,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS miguri_event_windows (
  event_slug TEXT NOT NULL,
  label TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_slug, label, start_at)
);

CREATE TABLE IF NOT EXISTS miguri_event_slots (
  event_slug TEXT NOT NULL,
  event_date TEXT NOT NULL,
  slot_number INTEGER NOT NULL,
  reception_start TEXT NOT NULL,
  start_time TEXT NOT NULL,
  reception_end TEXT NOT NULL,
  end_time TEXT NOT NULL,
  PRIMARY KEY (event_slug, event_date, slot_number)
);

CREATE TABLE IF NOT EXISTS miguri_slot_members (
  event_slug TEXT NOT NULL,
  event_date TEXT NOT NULL,
  slot_number INTEGER NOT NULL,
  member_name TEXT NOT NULL,
  PRIMARY KEY (event_slug, event_date, slot_number, member_name)
);

CREATE TABLE IF NOT EXISTS miguri_user_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_slug TEXT NOT NULL,
  member_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  slot_number INTEGER NOT NULL,
  tickets INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_miguri_events_group ON miguri_events(group_id);
CREATE INDEX IF NOT EXISTS idx_miguri_events_status ON miguri_events(status);
CREATE INDEX IF NOT EXISTS idx_miguri_slots_event ON miguri_event_slots(event_slug, event_date);
CREATE INDEX IF NOT EXISTS idx_miguri_members_event ON miguri_slot_members(event_slug, event_date, slot_number);
CREATE INDEX IF NOT EXISTS idx_miguri_entries_user ON miguri_user_entries(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_miguri_entries_event ON miguri_user_entries(event_slug, event_date, slot_number);
