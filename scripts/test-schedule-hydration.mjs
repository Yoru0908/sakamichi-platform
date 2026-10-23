import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { tokyoToday, formatDateHeading } from '../src/components/schedule/schedule-date.ts';
const base = process.env.BASE_URL || 'http://127.0.0.1:4323';
assert.equal(tokyoToday(new Date('2026-10-22T14:59:59Z')), '2026-10-22');
assert.equal(tokyoToday(new Date('2026-10-22T15:00:00Z')), '2026-10-23');
assert.equal(formatDateHeading('2026-10-23'), '10月23日 周五');
const fixture = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:hydration-fixture\r\nDTSTART;VALUE=DATE:20261024\r\nDTEND;VALUE=DATE:20261025\r\nSUMMARY:乃木坂46 ライブ\r\nEND:VEVENT\r\nEND:VCALENDAR';
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(t => { localStorage.setItem('theme', t); localStorage.setItem('lang', 'ja'); }, theme);
      // Deliberately differs from the server's build/render day, as a static page does after midnight.
      await page.clock.install({ time: new Date('2026-10-24T03:00:00Z') });
      await page.route('**/api/schedule-feed/*', r => r.fulfill({ contentType: 'text/calendar', body: fixture }));
      await page.route('https://api.46log.com/**', r => r.fulfill({ status: 200,
        json: { success: true, data: { user: { id: 'qa-owner', displayName: 'QA', role: 'member', email: 'qa@example.invalid' } } },
        headers: { 'Access-Control-Allow-Origin': new URL(base).origin, 'Access-Control-Allow-Credentials': 'true' } }));
      await page.goto(base + '/schedule', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /10月24日 周六/ }).waitFor();
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /10月24日 周六/ }).waitFor();
      assert.deepEqual(errors, [], `${engine.name()} ${theme} must hydrate without suppressing errors`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(`PASS ${engine.name()} ${theme}: stable date format, newer JST day after hydration, fast auth, reload, no overflow/errors`);
      await page.close();
    }
  } finally { await browser.close(); }
}
