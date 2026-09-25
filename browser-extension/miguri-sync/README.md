# Miguri Sync · shared dual-site Music-only candidates

Operator correction (2026-09-24): **Both language ZIPs support both `46log.com/miguri` and `saka46log.com/import`. Neither package supports forTUNE Meets.** The runtime scripts, matches and permissions are identical; only manifest language/brand text differs. The packages have the same version `1.1.18` and are **unpublished candidates**, not store updates. Install only one language package per browser profile; disable any older Meets-capable release before trying the candidate.

Both sites read only the user's own `fortunemusic.jp` history. The trusted sender URL determines the destination (a page-supplied `target` cannot override it). 46log preserves its account-bound auto-check and Music save; 坂ログ preserves its separate OAuth login, Sakura-only lottery review, and explicit per-user save. Neither site receives credentials, tokens or the other site's private records; no cross-site account linking or cookie sharing. Historical Meets entries/analytics on 46log remain readable, but the extension does not create new Meets records.

## Build / validation

From this worktree root:

```sh
python3 scripts/build-miguri-extension.py --output browser-extension/miguri-sync/store-assets/upload/edition-candidates-1.1.18 --version 1.1.18
node --test browser-extension/miguri-sync/*.test.mjs tests/extension/*.test.mjs src/components/meguri/*.test.mjs
npm run build
```

Builder ships only `background.js`, `official.js`, `bridge.js`, `manifest.json` and icons, verifies both packages have the same runtime bytes and two-site/Music-only permissions, and never uploads to a store. The `miguri-candidates.json` file records SHA-256 hashes. Synthetic fixture tests cannot prove an official account's real Music history or production OAuth; test both sites in an operator-controlled browser before any release. The currently installed/store packages are unchanged.
