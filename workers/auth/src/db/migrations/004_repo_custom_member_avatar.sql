-- Migration 004: Add custom member avatar to repo_works
-- Run via: wrangler d1 execute sakamichi-auth --remote --file=workers/auth/src/db/migrations/004_repo_custom_member_avatar.sql

ALTER TABLE repo_works ADD COLUMN custom_member_avatar TEXT;
