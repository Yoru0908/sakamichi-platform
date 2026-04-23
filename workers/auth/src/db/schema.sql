-- Sakamichi Auth - D1 Schema

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  email_verified INTEGER NOT NULL DEFAULT 0,
  is_first_login INTEGER NOT NULL DEFAULT 1,
  verification_status TEXT NOT NULL DEFAULT 'none',
  geo_status TEXT NOT NULL DEFAULT 'default',
  payment_status TEXT NOT NULL DEFAULT 'none',
  oshi_member TEXT,
  verification_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- OAuth 关联表
CREATE TABLE IF NOT EXISTS user_oauth (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_email TEXT,
  provider_name TEXT,
  provider_avatar TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, provider_id)
);

-- Refresh Token 表
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0
);

-- 用户收藏表
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  member_group TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, member_name)
);

-- 気になるメンバー表
CREATE TABLE IF NOT EXISTS user_followed_members (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  member_group TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, member_name)
);

-- Email 验证 token 表
CREATE TABLE IF NOT EXISTS email_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- エピソードブックマーク表 (Sakumimi収藏)
CREATE TABLE IF NOT EXISTS user_episode_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id INTEGER NOT NULL,
  note TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, episode_id)
);

-- 用户订阅表
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'all_groups',
  status TEXT NOT NULL DEFAULT 'active',
  payment_method TEXT,
  payment_ref TEXT,
  amount_cents INTEGER,
  currency TEXT,
  paid_at TEXT,
  expires_at TEXT,
  approved_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 付款平台关联表
CREATE TABLE IF NOT EXISTS user_payment_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_user_id TEXT,
  platform_email TEXT,
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, platform)
);

-- 未匹配付款表
CREATE TABLE IF NOT EXISTS unmatched_payments (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  order_id TEXT,
  platform_user_id TEXT,
  amount TEXT,
  remark TEXT,
  raw_data TEXT,
  resolved_at TEXT,
  resolved_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'all_groups',
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 邀请码使用记录表
CREATE TABLE IF NOT EXISTS invite_code_usage (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES invite_codes(code),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Community (photocard gallery) ──

CREATE TABLE IF NOT EXISTS community_works (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

  image_key TEXT NOT NULL,
  thumbnail_key TEXT,

  member_name TEXT NOT NULL,
  romaji_name TEXT,
  group_style TEXT NOT NULL,
  theme TEXT,

  allow_download INTEGER NOT NULL DEFAULT 1,

  like_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,

  stamp_totoi  INTEGER NOT NULL DEFAULT 0,
  stamp_numa   INTEGER NOT NULL DEFAULT 0,
  stamp_ose    INTEGER NOT NULL DEFAULT 0,
  stamp_kami   INTEGER NOT NULL DEFAULT 0,
  stamp_yusho  INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'published',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES community_works(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, work_id)
);

CREATE TABLE IF NOT EXISTS community_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES community_works(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, work_id)
);

-- ── 握手Repo Community ──

CREATE TABLE IF NOT EXISTS repo_works (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  group_id TEXT NOT NULL,

  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'ミーグリ',
  slot_number INTEGER NOT NULL DEFAULT 1,
  ticket_count INTEGER NOT NULL DEFAULT 1,
  nickname TEXT,

  messages TEXT NOT NULL DEFAULT '[]',  -- JSON array of Message
  tags TEXT NOT NULL DEFAULT '[]',       -- JSON array of AtmosphereTag
  template TEXT NOT NULL DEFAULT 'meguri',

  react_lemon INTEGER NOT NULL DEFAULT 0,
  react_sweet INTEGER NOT NULL DEFAULT 0,
  react_funny INTEGER NOT NULL DEFAULT 0,
  react_pray  INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'published',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repo_reactions (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id       TEXT NOT NULL REFERENCES repo_works(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, work_id, reaction_type)
);

-- ── Reports (shared: community_work / repo_work) ──

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,   -- 'community_work' | 'repo_work'
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | reviewed | dismissed
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_stamps (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id    TEXT NOT NULL REFERENCES community_works(id) ON DELETE CASCADE,
  stamp_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, work_id, stamp_type)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification ON users(verification_status);
CREATE INDEX IF NOT EXISTS idx_user_oauth_provider ON user_oauth(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_followed_user ON user_followed_members(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_payment_links_user ON user_payment_links(user_id);
CREATE INDEX IF NOT EXISTS idx_unmatched_payments_resolved ON unmatched_payments(resolved_at);
CREATE INDEX IF NOT EXISTS idx_invite_code_usage_code ON invite_code_usage(code);
CREATE INDEX IF NOT EXISTS idx_works_user ON community_works(user_id);
CREATE INDEX IF NOT EXISTS idx_works_group ON community_works(group_style);
CREATE INDEX IF NOT EXISTS idx_works_member ON community_works(member_name);
CREATE INDEX IF NOT EXISTS idx_works_status ON community_works(status);
CREATE INDEX IF NOT EXISTS idx_works_likes ON community_works(like_count DESC);
CREATE INDEX IF NOT EXISTS idx_works_created ON community_works(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_work ON community_likes(work_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_work ON community_bookmarks(work_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON community_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_stamps_work ON community_stamps(work_id);
CREATE INDEX IF NOT EXISTS idx_stamps_user ON community_stamps(user_id);
CREATE INDEX IF NOT EXISTS idx_repo_works_user ON repo_works(user_id);
CREATE INDEX IF NOT EXISTS idx_repo_works_group ON repo_works(group_id);
CREATE INDEX IF NOT EXISTS idx_repo_works_member ON repo_works(member_id);
CREATE INDEX IF NOT EXISTS idx_repo_works_status ON repo_works(status);
CREATE INDEX IF NOT EXISTS idx_repo_works_created ON repo_works(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repo_reactions_work ON repo_reactions(work_id);
