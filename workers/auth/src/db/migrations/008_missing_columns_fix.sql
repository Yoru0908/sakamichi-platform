-- Migration 008: 补齐代码已引用但 D1 缺失的列（2026-07-06 worker 拆分时发现）
-- 三周前部署的代码引用了这些列但 migration 未执行，导致
-- /api/community/works 与 /api/repo/works 线上 500。
-- Run via: wrangler d1 execute sakamichi-auth --remote --file=./src/db/migrations/008_missing_columns_fix.sql

ALTER TABLE community_works ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repo_works ADD COLUMN user_avatar TEXT;   -- 007 未执行，并入本次
ALTER TABLE repo_works ADD COLUMN author_name TEXT;
