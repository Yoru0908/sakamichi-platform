import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNarrationColor, narrationPalette, withNarrationColor, readNarrationColor } from './narration-color.ts';

test('only full hex colors are accepted; absent/invalid values retain legacy rendering', () => {
 for (const value of [undefined, null, '', 'red', '#fff', 'url(https://example.com)', '#000000;position:fixed']) {
   assert.equal(normalizeNarrationColor(value), undefined);
   assert.equal(narrationPalette(value), undefined);
 }
 assert.equal(normalizeNarrationColor('#Ab12EF'), '#ab12ef');
});
test('uniform style survives JSON, preserves text/images/IDs and resets without mutating drafts', () => {
 const original = [{ id: '1', speaker: 'me', text: 'hello' }, { id: '2', speaker: 'narration', text: '第一行\n第二行', imageUrl: 'data:image/png;base64,AA' }];
 const colored = withNarrationColor(original, '#DB2777');
 assert.equal(readNarrationColor(JSON.parse(JSON.stringify(colored))), '#db2777');
 assert.deepEqual(withNarrationColor(colored, undefined), original);
 assert.equal(original[1].narrationColor, undefined);
 assert.equal(readNarrationColor(withNarrationColor([original[0]], '#2563eb')), '#2563eb');
});
test('custom black/white/preset colors produce opaque readable palettes', () => {
 const luminance = hex => {
   const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
   return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
 };
 for (const color of ['#ffffff', '#000000', '#d97706', '#db2777', '#2563eb', '#64748b', '#00ff00']) {
   const p = narrationPalette(color);
   assert.match(p.color, /^#[0-9a-f]{6}$/);
   assert((luminance(p.backgroundColor) + 0.05) / (luminance(p.color) + 0.05) >= 4.5);
 }
});
