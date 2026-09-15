# Repo numeric editing / language popup display — 2026-09-15

## Changes

- `RepoPage.tsx`: distinguish a cleared number input (`''`) from numeric zero. Previously `Number('')` immediately rendered 0, so subsequent typing could display 02/01. Both slot and ticket fields now remain blank while editing and after blur. Saved/preview data remains numeric; a field left blank uses the existing positive default 1 without inserting it into the editing control. Valid existing numeric drafts still load normally; no schema or backend changes. Added accessible labels for both inputs.
- `LanguageSwitch.tsx`: the navbar action container inherits `white-space: nowrap`. Inline option buttons with full width could therefore sit next to each other outside the popup. The popup now explicitly uses column flex layout/normal whitespace, and options use block display. Added explicit button type and expanded state; theme/locale selection behavior unchanged.

## Verification

```sh
node scripts/test-repo-form-display.mjs
node --test src/components/nav/mobile-nav.test.mjs
npm run build
BASE_URL=https://46log.com node scripts/test-repo-form-display.mjs
```

Browser fixture uses the real RepoPage and LanguageSwitch, includes inherited nowrap and explicit Tailwind sources. At 1440px and 390px: all three language items stack within popup and viewport; switching zh/en/ja closes/reopens correctly; number clear/blur/retype and Backspace leave no injected zero; mocked account save/reload retains numeric 2/3; saving blank uses numeric 1 while editor stays blank. All API calls mocked, no real user writes. Existing mobile-nav tests pass; 45-page Astro build passes with existing static-header warnings.

Changes based on production branch `6dcdd82`, preserving Repo images/export fixes and Miguri extension v1.1.16. Previous deployed Pages `f3ad3971` / `9f6051d`. No Auth Worker/D1/PM2/secret changes.

Production deployed as `5e533f8d-dfb4-4b20-84e2-38fe3f7f3a8d` / Git `b8aaa8e`. Formal-domain tests passed at both 1440/390px with API mocks. Initial smoke clicked the SSR language trigger before its separate Astro island hydrated; test now explicitly waits for LanguageSwitch hydration before clicking. Existing recoverable React #418 warning remains excluded only on production. Central deployment map updated.
