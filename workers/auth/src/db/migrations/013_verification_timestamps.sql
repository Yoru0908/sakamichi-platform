-- Only future verification actions have an exact timestamp. Do not infer old
-- request/review times from account creation or generic profile updates.
ALTER TABLE users ADD COLUMN verification_requested_at TEXT;
ALTER TABLE users ADD COLUMN verification_resolved_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_verification_requested
  ON users(verification_status, verification_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_verification_resolved
  ON users(verification_status, verification_resolved_at DESC);
