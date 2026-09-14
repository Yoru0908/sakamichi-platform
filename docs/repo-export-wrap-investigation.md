# Repo export overflow investigation (2026-09-14)

Status: **unresolved; no production code changed or deployment performed**.

User supplied a 1140×4373 PNG of the Meguri template. Several short member messages wrap their final characters below the outlined bubble (ありがとう！, うれしい こちらこそありがとう, 送ってくれたね 見たよ, うん あぁ uniがいる). The gray self bubbles do not show the same obvious overflow. The original draft, preview screenshot and browser/device are not yet available; fixture strings are transcribed, not original source data.

Maintenance worktree: `.worktrees/repo-export-fix`, branch `fix/repo-export-wrap`, based on production `1ffd6ca`.

Relevant implementation: `src/utils/repo-image-export.ts` uses modern-screenshot 3x PNG; bubble markup is in `src/components/repo/templates/*Template.tsx`. No confirmed root cause yet. A line-wrap change with retained cloned height is consistent with the supplied image, but the responsible browser/layout behavior remains unconfirmed.

## Diagnostic regression

`node scripts/test-repo-export-wrap.mjs`

- Uses actual template markup, both speakers and six transcribed short strings, across all three templates.
- Chromium and Playwright WebKit render the cloned foreignObject SVG in an isolated iframe with no inherited page styles.
- Checks text wrapping and containment, plus a style-loaded assertion.
- All six combinations pass: **this does not reproduce or fix the reported bug**. It is not an actual PNG/iOS-download validation.
- Added explicit Tailwind `@source` to export fixture CSS: without it the new ignored worktree initially had unstyled full-width bubbles, making tests misleading. Other test runners were not audited or revalidated during this investigation.
- Cloned fractional widths can differ by 1/64px in Chromium; no resulting wrap was seen for these fixtures.

Next: obtain user's OS/browser/version, zoom/display scaling, page preview and ideally original draft text/JSON (without credentials). Reproduce at the actual export-to-PNG stage, then add a failing regression before changing export behavior. Do not deploy an unverified padding/height workaround.
