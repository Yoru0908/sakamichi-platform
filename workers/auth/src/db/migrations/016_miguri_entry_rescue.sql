-- Meets 保障: applications made with an R serial (１次応募者優先応募シリアル etc.) that the site issues for a lost
-- 1次 application. That CD was already paid for, so spend counts applied_tickets - rescue_tickets bought CDs.
-- NULL = synced by an extension older than 1.1.21 (unknown); the dashboard then treats every application as bought.
-- Applied to the `miguri` D1 database by hand (wrangler d1 execute miguri --remote --file ...).
ALTER TABLE miguri_user_entries ADD COLUMN rescue_tickets INTEGER;
ALTER TABLE miguri_user_entries ADD COLUMN rescue_won_tickets INTEGER;
