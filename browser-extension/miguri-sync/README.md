# One source, two isolated site editions

2026-09-24 operator update supersedes the 09-18 dual-site requirement: Chinese edition works only on 46log, Japanese edition only on saka46log. Both are built from the same source, but the builder now pins the trusted sender target, content-script matches, permissions and toolbar destination for each edition. Existing published extensions are not silently changed; no store upload has been performed.

## Version status

The source baseline `e40236a` is1.1.16. The1.2.0 number previously assigned to this branch was only an unpublished development candidate, not the user's installed/store version. Current manifest and candidate packs use the known1.1.16 source baseline and explicitly say `candidate (unpublished)`. This is not a higher-version store update. The operator must select the actual release number and remove the candidate marker before submitting; an existing1.1.16 store listing needs a higher version. Do not change the old deployment or another working tree just to prepare these files.

## Meets compatibility fix

Current official42nd page references `https://ticket.fortunemeets.app/bundle.js?20260818145757`. Inspected public bundle SHA256 `098c3e6fe0c77e1e726eff0f570244c92919c733a37eb683262f6f35a9176906`: login stores `userId` and `accessToken`; history calls use `Authorization: Bearer ...` plus `x-artist-event`, not just `x-user-id`.

Version1.1.6 (`6a303cc`) moved from pages/iframes to direct API reads with `lscache-id`/`x-user-id`;1.1.16 only repaired same-account login retries. The Chinese candidate now prefers current storage with Bearer auth, retains legacy-only storage compatibility and validates expiration. They never fall back to another old account on missing/expired modern credentials or rejected Bearer auth. Re-login re-reads the token even if the ID stays unchanged. Exact upstream change date and the reason a particular user previously succeeded remain unknown.

The token stays in extension memory, comes only from the owned official top-frame job and is sent only to the fixed Meets history endpoint with redirects denied. No token/cookie/password is written to extension storage, logs, records or either destination site. The website never needs the user to supply storage/token values in chat.

## Destinations

- Chinese/46log: existing Music→Meets sequence, three groups and optional automatic checks remain. The package has no saka46log permission, and the worker rejects sender messages from that site.
- Japanese/坂ログ: Sakura Music only, manual review + separate statistical consent. No 46log/API/Meets permission, no old-site automatic checks; even a stale alarm cannot start them.
- Toolbar is edition-bound even when the active tab is on the other site. Both may be installed in one profile because the site content-script matches are disjoint. Never share a site's login cookie, result or account data across packages.
- The packages intentionally have distinct manifests and a one-line edition guard in the background worker; `official.js` and `bridge.js` still come from one source. Existing runtime copy may contain inherited Chinese strings; Japanese translation is not claimed complete.

## Tests / packaging

Run from this worktree root:

```sh
node --test tests/extension/*.test.mjs browser-extension/miguri-sync/saka-target.test.mjs browser-extension/miguri-sync/edition-packages.test.mjs
python3 scripts/build-miguri-extension.py --output /path/to/candidate-output --version 1.1.18
```

Builder requires an explicit version, refuses embedded store identity/update URLs, uses an explicit runtime allowlist, excludes tests/store assets, and verifies opposite-site permissions and sender guards are absent. It never uploads anything. Candidate hashes are recorded beside the ZIPs in `miguri-candidates.json`.

For isolated Chromium MV3 fixture checks, unpack the two candidates under the site's gitignored `artifacts/extension-fixture/{zh-CN,ja}` and set `SAKA_TEST_ROOT` to the坂ログ project before running `node tests/extension/browser-fixture.mjs`. The test uses fresh disposable profiles and synthetic sites/API, not real accounts or the user's installed browser. Existing fixture verified current/legacy Meets and坂ログ Music in both older dual-site packages; new isolated packages have VM sender/manifest tests, but real-browser OAuth + import still need operator acceptance. Genuine official-account sync and store review remain separate acceptance gates.
