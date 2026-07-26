-- Revocable personal Miguri calendar subscriptions.
-- The public URL is reconstructed from subscription_id + token_version +
-- an HMAC signature. No directly usable bearer token is stored in D1.

CREATE TABLE IF NOT EXISTS miguri_calendar_subscriptions (
  user_id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL UNIQUE,
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_miguri_calendar_subscription_id
  ON miguri_calendar_subscriptions(subscription_id);
