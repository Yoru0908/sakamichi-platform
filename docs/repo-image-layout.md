# Repo image rotation and two-column rows — 2026-09-15

## Behavior

- `/repo/create`: each narration photo has left/right 90° buttons and “与上一张并排” / “取消并排”. Pairing is available for two adjacent narration photos; captions are retained under their own image. Use existing up/down controls to make images adjacent.
- At most two images per row. Intervening dialogue/non-image narration is never skipped or hidden. Removing a partner leaves the other image visible. Pairing is relative to current message order, not permanent image IDs; reordering can change the preceding partner.
- Single landscape photos use available width (max height 240px); portrait/square standalone photos preserve the old 112px height cap. Paired cells are equal-width, gap 8px, height cap 160px, object-contain (no cropping).
- Rotation is baked into PNG pixels, not a CSS transform: correct layout dimensions, no cumulative JPEG recompression, and orientation survives older clients/exporters. Animated inputs become static images when rotated. Decoded canvas limited to 16M pixels and resulting data URL to 12M characters; errors retain the previous image. Rotation controls are locked during processing. Completion checks latest message/source so deleted/replaced images cannot be resurrected and intervening edits are retained.
- Optional `messages[].imagePairWithPrevious` strict boolean is preserved through account load/save/publish/legacy sync. Old drafts without it retain vertical rows. Existing backend stores message JSON directly; no schema migration or independent Worker deployment needed. Older clients ignore pairing and may drop the new field if they re-save.
- Shared `NarrationRow` and `groupImageMessages` cover all three templates and community detail exports. Export waits two animation frames after image readiness for landscape sizing to settle; the prior fractional-border fix is preserved.

## Verification

```sh
node scripts/test-repo-images.mjs
node scripts/test-repo-images-account.mjs
node scripts/test-repo-export.mjs
node scripts/test-repo-chat-editor.mjs
node scripts/test-repo-export-wrap.mjs
npm run build
# After deployment, all APIs mocked (no real user writes):
BASE_URL=https://46log.com node scripts/test-repo-images-account.mjs
node scripts/smoke-repo-export-production.mjs
```

- Chromium 150% display scaling and desktop WebKit, 390px viewport: quadrant pixels prove clockwise direction and lossless inverse; landscape enlargement; pair/unpair/delete; no three-image overflow; JSON reload; all three templates' actual PNG placement/orientation checks.
- Full RepoPage mocked account: upload two images, rotate, pair, save request payload includes rotated dimensions/pair flag, reload account draft retains pairing across all templates. All API traffic intercepted; no production credentials or real account modifications.
- Existing long colored image test passes all templates including each image/avatar, final narration and bottom marker. Square image fixtures still pixel-match legacy templates under current exporter.
- Existing caret/IME/order/insert/scroll tests pass. 18-case actual PNG fractional-border regression passes. Astro 45-page build passes (existing static-header warnings remain).
- Desktop WebKit coverage is not physical iPhone/iOS download validation. No multi-select upload, arbitrary-angle rotation or cropping added.

Branch `feat/repo-image-layout`, worktree `.worktrees/repo-export-fix`. Test fixtures under `tests/`, not production routes. No Homeserver files, PM2 processes, D1 rows or credentials modified.
