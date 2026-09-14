# Auth verification email recovery — 2026-09-15

## Incident

The retired `sakamichi-tools.cn` domain is parked and no longer has the sending verification records. Production Auth Worker still used `noreply@sakamichi-tools.cn`. Registration created a user and token before sending, ignored the boolean send result, and always reported success. A failed email therefore left a legitimate unverified account reserving its address, with no recovery path.

User added `46log.com` in Resend (Tokyo region). Public DNS confirms the supplied DKIM at `resend._domainkey`, MX at `send` -> `feedback-smtp.ap-northeast-1.amazonses.com` priority 10, and TXT at `send` -> `v=spf1 include:amazonses.com ~all`. Existing root MX/SPF/Cloudflare Email Routing were not modified; receiving was not enabled. Resend dashboard verification and actual inbox delivery are separate checks.

## Changes

- Auth `EMAIL_FROM`: `Sakamichi Tools <noreply@46log.com>`. Verification links remain `https://46log.com/auth/verify`.
- Remove retired `.cn` origins from Auth's CORS allowlist; retain production and Pages origin behavior.
- Mailer checks provider status and returned message ID, bounds fetch time to 10s, logs accepted ID or rejected HTTP status only (no email address/token/key/response body).
- Failed registration mail returns HTTP 502 with an explicit account-created/retry-login message, not fake email success. The account remains unverified; no auto-verification or credentials issued.
- A correct-password login for an unverified account can resend verification mail. Recent token expiry provides a best-effort per-account 60s cooldown (expiry is creation+24h). Wrong passwords never trigger mail. Resend success still returns 403 pending verification; failure is 502 and cooldown 429. No new public unauthenticated resend endpoint or schema migration.

## Checks / boundaries

`node scripts/test-auth-email.mjs` covers sender/link, accepted/rejected/network failure, redacted logs, truthful registration, password gating, cooldown and no-cookie bypass. Auth Wrangler dry-run build passes. It does not assert actual Resend acceptance/inbox delivery.

Before deployment, production `cb2b1802-cc9c-4003-ace3-0d0299fdaac3` module was privately backed up under local `~/.cache/auth-pre-email-fix.bundle`; local pre-fix bundle comparison showed esbuild formatting/generated naming differences. No secret values were printed or committed. Existing deployed RESEND_API_KEY is retained; a local development credential did not authorize Resend domain queries and was not used for sending or deployed.

A user explicitly requested resetting one newly created, unverified account. It had no login, Repo, community, preferences, payments/subscriptions, OAuth or Miguri entries (Auth + Miguri D1 scoped count checks). Any reset must be backed up privately, scoped to its exact id/email plus unverified/no-login state, and guarded against existing account data. Do not bulk-delete other unverified accounts or set email_verified=1. Real user email, password hashes and verification tokens are not kept in this document/repository.
