# One implementation, two publication names

2026-09-18 correction: the operator wants Chinese-name and Japanese-name publication variants of the **same plugin**, both working with46log and坂ログ. Language must not determine hosts, features, credential handling or record destinations. The operator handles store publication. No store upload has been performed.

## Version status

The source baseline `e40236a` is1.1.16. The1.2.0 number previously assigned to this branch was only an unpublished development candidate, not the user's installed/store version. Current manifest and candidate packs use the known1.1.16 source baseline and explicitly say `candidate (unpublished)`. This is not a higher-version store update. The operator must select the actual release number and remove the candidate marker before submitting; an existing1.1.16 store listing needs a higher version. Do not change the old deployment or another working tree just to prepare these files.

## Meets compatibility fix

Current official42nd page references `https://ticket.fortunemeets.app/bundle.js?20260818145757`. Inspected public bundle SHA256 `098c3e6fe0c77e1e726eff0f570244c92919c733a37eb683262f6f35a9176906`: login stores `userId` and `accessToken`; history calls use `Authorization: Bearer ...` plus `x-artist-event`, not just `x-user-id`.

Version1.1.6 (`6a303cc`) moved from pages/iframes to direct API reads with `lscache-id`/`x-user-id`;1.1.16 only repaired same-account login retries. Both Chinese/Japanese candidates now prefer current storage with Bearer auth, retain legacy-only storage compatibility and validate expiration. They never fall back to another old account on missing/expired modern credentials or rejected Bearer auth. Re-login re-reads the token even if the ID stays unchanged. Exact upstream change date and the reason a particular user previously succeeded remain unknown.

The token stays in extension memory, comes only from the owned official top-frame job and is sent only to the fixed Meets history endpoint with redirects denied. No token/cookie/password is written to extension storage, logs, records or either destination site. The website never needs the user to supply storage/token values in chat.

## Destinations

-46log: existing Music→Meets sequence, three groups and existing optional automatic checks remain.
-坂ログ: supported Sakura Music result fields return for manual review and separately consented statistics. No automatic cross-site saving or enabling old-site auto-sync.
-Toolbar: follow the active site's origin; use established46log default elsewhere, regardless of package language. Do not replace active editors with forced reloads.
-The packages differ only in manifest name/description/action title. They are Japanese-title and Chinese-title variants; not all inherited runtime progress copy has been translated yet. Enable only one edition per browser profile to prevent duplicate bridge actions.

## Tests / packaging

Run from this worktree root:

```sh
node --test tests/extension/*.test.mjs browser-extension/miguri-sync/saka-target.test.mjs
python3 scripts/build-miguri-extension.py --output /path/to/candidate-output --version 1.1.16
```

Builder requires an explicit version, refuses embedded store identity/update URLs, uses an explicit runtime allowlist, excludes tests/store assets, and verifies byte-identical runtime and permission parity across both names. It never uploads anything. Candidate hashes are recorded beside the ZIPs in `miguri-candidates.json`.

For isolated Chromium MV3 fixture checks, unpack the two candidates under the site's gitignored `artifacts/extension-fixture/{zh-CN,ja}` and set `SAKA_TEST_ROOT` to the坂ログ project before running `node tests/extension/browser-fixture.mjs`. The test uses fresh disposable profiles and synthetic sites/API, not real accounts or the user's installed browser. It verifies current/legacy Meets and坂ログ Music in both packages. Genuine official-account sync and store review remain separate acceptance gates.
