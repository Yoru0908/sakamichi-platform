-- 失効: won tickets that lapsed because they were not paid. won_tickets keeps the lottery result
-- (当選率 / stats); tickets actually held = won_tickets - lapsed_tickets. Old rows default to 0.
ALTER TABLE miguri_user_entries ADD COLUMN lapsed_tickets INTEGER NOT NULL DEFAULT 0;
