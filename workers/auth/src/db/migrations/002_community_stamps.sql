-- Migration 002: Add stamp counts to community_works + community_stamps table
-- Run via: wrangler d1 execute sakamichi-auth-db --remote --file=workers/auth/src/db/migrations/002_community_stamps.sql

ALTER TABLE community_works ADD COLUMN stamp_totoi INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_works ADD COLUMN stamp_numa  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_works ADD COLUMN stamp_ose   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_works ADD COLUMN stamp_kami  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_works ADD COLUMN stamp_yusho INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_stamps (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id    TEXT NOT NULL REFERENCES community_works(id) ON DELETE CASCADE,
  stamp_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, work_id, stamp_type)
);

CREATE INDEX IF NOT EXISTS idx_stamps_work ON community_stamps(work_id);
CREATE INDEX IF NOT EXISTS idx_stamps_user ON community_stamps(user_id);
