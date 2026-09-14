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

Before deployment, production `cb2b1802-cc9c-4003-ace3-0d0299fdaac3` module was privately backed up under local `~/.cache/auth-pre-email-fix.bundle`; local pre-fix bundle comparison showed esbuild formatting/generated naming differences. No secret values were printed or committed. The deployed RESEND_API_KEY was initially retained, then replaced as recorded below. The local development credential was only a placeholder; it did not authorize Resend domain queries and was not used for sending or deployed.

## Follow-up: verified domain still rejected

User reports dashboard domain verified at 00:34 JST. Two controlled registrations using Resend's documented `delivered+<label>@resend.dev` simulator returned 502; email-only Worker tail confirmed Resend HTTP 400. Added safe fixed-category provider error logging (no raw provider message). Diagnostic deployment `89d6e04d-aa36-4507-a47d-ee5f5f5c7634` / code `2788054` confirmed `reason=domain_not_verified`, not invalid API key. The dashboard and the deployed credential's domain visibility disagree; account/team or key-scope mismatch is a possibility, not established fact. Requested a new sending key from the same Resend account/domain; mail remained blocked until the credential update recorded below. Both created simulator accounts/tokens were deleted after each test. A first Python default-UA probe was blocked before creating an account; retry with browser UA reached the Worker.

At the user's second explicit request, the replacement unverified account for the same email was again privately backed up (`~/.cache/auth-unverified-reset-second-20260915.json`, 0600), checked against current Auth/Miguri schemas (no business data), and conditionally removed; its four old verification tokens cascaded. Recheck confirmed no address occupancy. This reset does not fix provider rejection; advised not to re-register until sending is healthy.

## Credential update: provider acceptance restored

User supplied a replacement Resend key, imported via stdin to `wrangler secret put RESEND_API_KEY --name sakamichi-auth`; never stored in source or printed. Current Worker version after Secret Change: `c56351e2-16a7-490b-b333-286da54b7fa5` (code still `2788054`). An official Resend simulator registration then returned HTTP **201 / success=true**, with sanitized log `Resend accepted verification email`, ID `98c241ea-9885-4278-8154-873558fcee9e`. Synthetic account/token cleaned immediately. This verifies the production registration-to-provider path, not human QQ inbox arrival. Requested user's address was checked again and is free for registration. Existing DNS, email routing and receiving configuration unchanged.

## Deployment / requested account reset

Auth Worker deployed as `5e5df93c-8b77-4e4b-8075-909429d8cfcd`, code `3930607`. Live version bindings confirm the new sender and removal of retired origins. Production empty-login validation returns expected HTTP 400; no test registration/email was sent. At this initial deployment the Resend secret was retained; it was later replaced as recorded above. No Pages redeployment or PM2 restart for this change. Provider acceptance has now been verified; human QQ inbox arrival still awaits confirmation.

The explicitly authorized single-account reset was completed: private full row/token backup `~/.cache/auth-unverified-reset-20260915.json` (0600), guarded DELETE matched exactly one unverified/no-login/member row and excluded every other account-data reference, old email token removed by FK cascade. Post-check confirms no user/email-token occupancy. Auth and Miguri related-data counts were all zero except the single old verification token. No other accounts were deleted and no email was marked verified.

A user explicitly requested resetting one newly created, unverified account. It had no login, Repo, community, preferences, payments/subscriptions, OAuth or Miguri entries (Auth + Miguri D1 scoped count checks). Any reset must be backed up privately, scoped to its exact id/email plus unverified/no-login state, and guarded against existing account data. Do not bulk-delete other unverified accounts or set email_verified=1. Real user email, password hashes and verification tokens are not kept in this document/repository.
