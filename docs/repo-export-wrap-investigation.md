# Repo PNG bubble overflow fix (2026-09-14)

## Reproduction / cause

User supplied a 1140×4373 Meguri PNG: several short member messages wrap their final characters below the outlined bubble; gray self bubbles remain correct. The reported device is a desktop computer; its exact OS/browser settings are unknown.

**Reproduced the same failure in actual downloaded PNGs** with Chromium launched using `--force-device-scale-factor=1.5` (also test 1.25/1.75). This models desktop display scaling, not necessarily non-default page zoom. Playwright's context `deviceScaleFactor` alone is insufficient to reproduce physical border snapping.

At 150%, the member bubble's CSS 1px border computes to `0.666667px`, with total width `119.3333px` for `ありがとう！`. modern-screenshot retains computed width/height in its SVG clone. The SVG **image** renderer snaps the border to 1px, reducing the available text width. The last characters wrap while the cloned height remains one line. Gray bubbles have no border; long lines or lines with spare width need not fail. This explains partial rather than universal failure.

A live SVG, including an isolated iframe SVG, still uses the display scaling and does **not** reproduce this image-rasterization bug. Initial live-SVG checks missed it. The new regression checks pixels in the actual downloaded PNG; before the fix, the 150% case finds 358 dark pixels below `ありがとう！` where padding/empty space should be.

## Fix

`src/utils/repo-image-export.ts`:

- Wait for document fonts before capture.
- In modern-screenshot's `onCloneEachNode` only, replace **fractional solid borders** with inset shadows and reserve their measured space as padding. Shadows do not change the content box during image rasterization.
- Uniform rounded borders use an inset ring; single-side borders (nickname divider) use side-specific inset shadows.
- Integer borders, non-solid borders and original preview DOM remain untouched; existing shadows are retained.
- No changes to template text, stored drafts, account data, API, Workers, D1 or PM2. Download naming, 3x scale and iOS download code unchanged.

## Tests

```sh
node scripts/test-repo-export-wrap.mjs
REPO_TEST_DSF=1.5 REPO_TEST_FONTS=1 node scripts/test-repo-export-wrap.mjs
node scripts/test-repo-export.mjs
REPO_TEST_DSF=1.5 node scripts/test-repo-export.mjs
npm run build
```

- Actual PNGs: 3 templates × Chromium display factors 1/1.25/1.5/1.75/2 plus WebKit desktop = 18 cases. Fixture includes both speakers, reported short strings, natural wrapping and explicit newlines. Tests assert no text in the bottom padding/overflow band, every avatar center present, unchanged canvas size, unchanged preview DOM and export marker cleanup.
- Optional `REPO_TEST_FONTS=1` loads the production Noto font stylesheet; tested at 150% across all three templates.
- Long colored exports (48 messages) at 100%/150% verify canvas bounds, bottom marker, inline images/avatars, and first/last narration colors. Max tested height 14743px. Backup-template comparisons use the **current exporter** on both old/new templates, not a claim of pixel-identical old exporter output.
- Explicit Tailwind `@source` added to fixture CSS: ignored worktrees initially yielded unstyled full-width bubbles. Added style-loaded assertions. Marker sampling moved to the center of the 4px end marker rather than the interpolated image edge.
- 45-page Astro build passes, with existing static `Astro.request.headers` warnings.
- Desktop WebKit is not an actual iPhone/iOS native-download validation; no actual Windows machine was used. The original user's exact display settings remain unknown, but the supplied failure pattern is reproduced and fixed.

## Deployment

- Published production Git `45438e6` to Pages deployment `44aa1623-2f94-4c9b-8a50-7e314e70faf7`, preserving current production ancestry through `0421b59`.
- `node scripts/smoke-repo-export-production.mjs` passed on `https://46log.com/repo/create`: actual deployed UI at 150% display scale, real PNG download, both speakers' text contained. Account/API traffic is entirely mocked; no real account data is read/written. Existing recoverable React #418 hydration warning remains (one observed); no other page errors.
- No standalone Worker/PM2 restarts or binding changes. Central deployment map updated. To roll back this fix, revert the exporter patch rather than publishing an old whole-site snapshot.

Diagnostics/PNGs are outside the source tree under local `~/.cache/repo-export-wrap/`; no captures or test pages are added to production output. Worktree `.worktrees/repo-export-fix`, branch `fix/repo-export-wrap`.
