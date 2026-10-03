-- The existing production users table, before migration 013.
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
  display_name TEXT, avatar_url TEXT, role TEXT NOT NULL DEFAULT 'member',
  email_verified INTEGER NOT NULL DEFAULT 0, is_first_login INTEGER NOT NULL DEFAULT 1,
  verification_status TEXT NOT NULL DEFAULT 'none', geo_status TEXT NOT NULL DEFAULT 'default',
  payment_status TEXT NOT NULL DEFAULT 'none', oshi_member TEXT, verification_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), last_login_at TEXT
);
