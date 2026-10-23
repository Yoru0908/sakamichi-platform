# 46log event history, private memos and opt-in ranking

This feature belongs to **46log.com accounts and the `miguri` D1 database**. 坂ログ supplies public event metadata via the existing read-only service binding. No private 坂ログ attendance, users, memos or costs are requested, copied or joined.

## Data flow and semantics

- `sakamichi_event_marks` (014) retains the event ID, group, title and date captured when the user marks a published day. Existing IDs, including Sakurazaka `count_day:date`, remain supported by `workers/shared/sakamichi-event-id.ts`.
- Migration **015** adds `sakamichi_event_memos` keyed by `(user_id,event_id)` and `sakamichi_event_profiles` keyed by `user_id`. No row in profiles means private. The user must enter a public display name and explicitly opt in; account email/name/avatar are never automatically published.
- `GET /api/miguri/sakamichi-events/history?offset=0` reads only 46log's saved snapshots and private memos. It does not call the upstream year API. The response is paginated in 100-record pages and includes a summary over the **whole** saved history and `nextOffset`. Missing or changed official source entries do not erase history; `sourceStatus: 'saved-snapshot'` deliberately makes no claim about current publication status.
- `GET/PATCH …/memos/<encoded-id>` are owner-only. PATCH requires an active mark and a strict `{note,cost,expectedUpdatedAt}` body. `expectedUpdatedAt` is the version returned by GET (a safe nonnegative integer, or `null` before the first memo). A null version inserts only if no memo exists; numeric versions use a single atomic SQL update with the owner, active mark and version in its predicate. Updates use `MAX(now,old+1)` so writes in the same millisecond still get distinct versions. A stale version returns `409 memo_conflict` without changing any field; an absent own mark returns 404. No migration is needed for this concurrency check.
- The browser stores the GET version, sends it with its draft, then performs a separate GET readback before displaying success and advancing the editor version. Failed saves/readbacks keep the input. Conflicts preserve notes and every cost field and instruct the user to copy their draft before reloading and merging; no automatic refresh discards edits. If a write succeeds but its readback fails, a retry can conflict with that unverified write, and the same preservation rule applies.
- Deleting a mark removes only `sakamichi_event_marks`. A memo remains private in `sakamichi_event_memos`; adding the same day again restores it. Both the history page and modal explain this. A user can clear a retained memo by re-adding the day, saving an empty note/blank costs, then removing the mark.
- `GET/PUT …/profile` reads/writes only the signed-in owner's `{public:boolean,name:string}`. The browser verifies a save with a GET. A private name may be retained for the owner's next opt-in but is excluded from ranking.
- `GET …/ranking` uses an SQL join whose predicate requires `public_enabled=1` and `date <= JST today`. It never reads the memo table. Public fields are only `rank,name,days,events`; no user identifiers, notes, costs or account details. `Cache-Control: no-store` makes opt-out effective on the next request without an edge-cache delay.
- Future dates are plans; today's and previous dates are attendance. **Days are distinct JST dates across all groups**, not numbers of shows or marks. Multiple events on one date count once toward ranking. The separate `events` number counts saved event-day records. Equal day counts tie. Ranking returns the first 50 eligible entries.
- Cost fields: `ticket,travel,stay,goods,other`, whole Japanese yen 0–9,999,999 each. Blank means unknown; explicit zero remains recorded. Notes are at most 4000 JavaScript string characters. JSON request bodies are streamed with a 20,000-byte bound. Unknown fields, numeric strings and fractional/negative costs are refused.

## Frontend integration

- `src/components/events/EventHistory.tsx` → `/events/history`: private history and complete-history totals, pagination, snapshot explanation, lazy memo editors and removal with retention confirmation.
- `EventRanking.tsx` → `/events/ranking`: public results and the owner's explicit opt-in/display-name form. Errors are not rendered as empty or zero results.
- Default export `EventMemo` accepts `{ eventId: string; marked: boolean; onSaved?: (memo: EventMemoData) => void }`. The events modal mounts it for the selected day. The editor uses the existing 46log auth store, resets on actor/day changes, ignores stale requests and never treats an unverified write as success.
- `src/utils/auth-api.ts` provides the authenticated adapters. `src/i18n/events-history.ts` supplies independent Chinese/Japanese/English content via the site's language store. `events-history.css` is scoped to these features and uses existing color/font tokens; no global typeface or layout replacement.

## Portable business contract (v1)

Canonical standalone module: `workers/shared/event-attendance.ts`. It imports **no React, authentication, storage, network or application code**. Both the worker and the 46log UI use this exact module.

Exports: `AttendanceGroup`, `EventCosts`, `EventMemoData`, `EventHistoryRecord`, `EventPublicProfile`, `AttendanceSummary`, `EventHistoryPayload`, `EventRankingEntry`, `COST_KEYS`, `attendanceToday`, `attendanceStatus`, `validateEventMemo`, `validateEventProfile`, `eventCostTotal`, `summarizeAttendance`.

A future 坂ログ adapter can consume this module as a pinned shared source/package and run `workers/shared/event-attendance.test.mjs`. Map its `Mark.eventId` to `id`, its own group to `grp`, and its existing private `note/cost` fields to `EventMemoData`; preserve its independent session, D1, consent and response adapters. `summarizeAttendance` accepts only `{id,date,cost}` records and deduplicates by stable event ID before counting dates. No cross-site account IDs, automatic dual writes, private upstream reads or production 坂ログ changes are part of this implementation.

## Deployment and rollback

015 is stored alongside the older migration files for convention, but its target is **`MIGURI_DB` / database `miguri` (`969491b9-4960-4e5a-ab2d-37fa8e457b67`)**, not `sakamichi-auth` and not `saka46log-production`.

1. From `workers/miguri`, verify the selected D1 binding and take a remote export to a controlled backup path. Record existing worker and Pages versions. Keep exports private (they contain personal records).
2. Apply only `../auth/src/db/migrations/015_sakamichi_event_history.sql` with `wrangler d1 execute miguri --remote --file ../auth/src/db/migrations/015_sakamichi_event_history.sql`. It creates two empty tables and two indexes and does not rewrite existing marks.
3. Verify `PRAGMA table_info(...)` for both new tables and the marks index. A missing profile row is still private; no migration opts anybody in.
4. Deploy the miguri worker, then rebuild/deploy the Pages frontend. Validate GET routes, unauthenticated 401s, and controlled fixture/local tests. Real-account writes require the usual user authorization; this implementation task made no production writes.
5. Roll back frontend and worker to their recorded versions if needed. **Leave the additive tables intact** so user memos and preferences survive a code rollback. Do not drop a table after user writes. A destructive schema rollback is only for a verified never-used/empty environment after backup: drop `sakamichi_event_marks_user_date` and `sakamichi_event_profiles_public`, then `sakamichi_event_memos` and `sakamichi_event_profiles`. Existing marks remain untouched.

## Validation

```sh
node --test workers/shared/event-attendance.test.mjs workers/miguri/src/routes/sakamichi-event-history.test.mjs workers/miguri/src/routes/sakamichi-events.test.mjs workers/miguri/src/cors.test.mjs
npm --prefix workers/miguri run typecheck
BASE_URL=http://127.0.0.1:4323 node scripts/test-events-history.mjs
```

The 21 server tests use real SQLite with migrations 014 and 015, signed access tokens and independent users. They cover auth/ownership, validation, memo readback and unmark/re-add, stale-editor rejection, simultaneous first inserts, same-millisecond version advances, snapshot history during source failure, pagination/full-history totals, default privacy, distinct-date ranking, future-plan exclusion and immediate opt-out. A worker-entrypoint OPTIONS regression checks credentialed PATCH preflight for 46log.com and rejects an untrusted origin; a cache regression verifies the new revision and bounded expiry. The browser suite mocks the API without production writes and checks history, lazy editors, save/reload, zero vs unknown, failed writes/readbacks, two-tab conflicts preserving drafts and server content, modal deep links, opt-in/out and 390px layout. It does not replace real deployed D1/worker verification. `node --test scripts/smoke-workers.test.mjs` adds two smoke-contract tests that reject HTML 200 and challenge responses.
