import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./FeatureAnnouncement.tsx', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../nav/Navbar.astro', import.meta.url), 'utf8');

test('the feature popup shows once, on desktop only, and is marked seen when it opens', () => {
  assert.match(source, /const DESKTOP = '\(min-width: 1024px\) and \(hover: hover\) and \(pointer: fine\)'/);
  assert.match(source, /if \(window\.matchMedia\(DESKTOP\)\.matches && claim\(\)\) setOpen\(true\)/);
  assert.match(source, /localStorage\.getItem\(STORAGE_KEY\) === ANNOUNCEMENT_ID\) return false;\n\s*localStorage\.setItem\(STORAGE_KEY, ANNOUNCEMENT_ID\)/);
  assert.match(source, /location\.pathname\.startsWith\('\/miguri'\)\) \{ claim\(\); return; \}/);
  assert.match(source, /新功能：中签率和实际开销/);
  assert.match(source, /href="\/miguri\/"/);
});

test('the navbar carries the popup on every layout and reads 46log', () => {
  assert.match(navbar, /<FeatureAnnouncement client:idle \/>/);
  assert.match(navbar, />\n\s*46log\n\s*<\/a>/);
  assert.doesNotMatch(navbar, /Sakamichi Tools/);
});
