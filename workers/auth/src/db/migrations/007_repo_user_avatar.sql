-- Migration 007: Add user avatar to repo_works
-- Run via: wrangler d1 execute sakamichi-auth --remote --file=workers/auth/src/db/migrations/007_repo_user_avatar.sql

ALTER TABLE repo_works ADD COLUMN user_avatar TEXT;
