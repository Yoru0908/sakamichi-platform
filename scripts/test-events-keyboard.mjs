// Isolated browser regression: public events + synthetic auth only; all API calls intercepted.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE_URL || 'http://127.0.0.1:4347';
const output = process.env.SCREENSHOT_DIR || '.tmp/events-review';
mkdirSync(output, { recursive: true });
const user = { id: 'keyboard-fixture', email: 'keyboard@example.invalid', displayName: 'Keyboard fixture', avatarUrl: null, role: 'member', isFirstLogin: false, oshiMember: null, verificationStatus: 'none', geoStatus: null, paymentStatus: null };
const event = { id: '12161_25:2026-10-25', date: '2026-10-25', title: '「MUSIC EXPO LIVE 2026 in TAIPEI」', kind: 'イベント', category: 'attend', shows: [], members: [], wholeGroup: true, sourceUrl: 'https://sakurazaka46.com/', venue: { id: 1, name: 'TAIPEI ARENA', prefecture: null } };
const browser = await chromium.launch();
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(theme => { localStorage.setItem('theme', theme); localStorage.setItem('lang', 'ja'); }, theme);
    await page.clock.setFixedTime(new Date('2026-10-23T03:00:00Z'));
    // Let an immediate auth/me response race ahead of MobileDrawer hydration.
    await page.route('**/src/components/nav/MobileDrawer.tsx*', async route => {
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.continue();
    });
    await page.route('https://api.46log.com/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith('/auth/me') ? { user } : path.endsWith('/sakamichi-events') ? { events: [event] }
        : path.endsWith('/counts') ? { counts: {} } : path.endsWith('/marks') ? { mine: [] } : {};
      await route.fulfill({ json: { success: true, data }, headers: { 'Access-Control-Allow-Origin': new URL(base).origin, 'Access-Control-Allow-Credentials': 'true' } });
    });
    await page.goto(base + '/events?grp=sakurazaka&year=2026');
    const opener = page.locator('article.event-ticket .event-ticket-header').first();
    await opener.waitFor();
    await page.reload();
    await opener.waitFor();
    const themeButton = page.getByRole('button', { name: 'Toggle theme', exact: true });
    await themeButton.locator(theme === 'dark' ? '.lucide-sun' : '.lucide-moon').waitFor();
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), theme === 'dark');
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'opening must focus the dialog');
    const controls = dialog.locator('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary');
    const first = controls.first(), last = controls.last();
    await first.focus(); await page.keyboard.press('Shift+Tab');
    assert(await last.evaluate(el => el === document.activeElement), 'Shift+Tab wraps to last');
    await page.keyboard.press('Tab');
    assert(await first.evaluate(el => el === document.activeElement), 'Tab wraps to first');
    // Even a programmatic/background focus cannot escape an open modal.
    await opener.focus();
    assert(await dialog.evaluate(el => el.contains(document.activeElement)));
    await page.screenshot({ path: `${output}/fixed-modal-${width}-${theme}.png` });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert(await opener.evaluate(el => el === document.activeElement), 'close restores the opener');
    if (width === 1440) {
      const trigger = page.getByRole('link', { name: '参加ログ', exact: true });
      assert.equal(await trigger.getAttribute('href'), '/events', 'top-level link remains navigable');
      await trigger.focus(); await page.keyboard.press('ArrowDown');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      const panel = page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`);
      assert(await panel.locator('a').first().evaluate(el => el === document.activeElement));
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/events/history');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/events/history');
      await page.screenshot({ path: `${output}/fixed-keyboard-menu-${theme}.png` });
      await page.keyboard.press('Escape');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      assert(await trigger.evaluate(el => el === document.activeElement));
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/events/ranking');
      await page.keyboard.press('Tab');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Tab outside closes dropdown');
      await trigger.hover();
      await page.waitForTimeout(120);
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'hover still works');
      assert.deepEqual(errors, [], 'initial auth race and tested keyboard interactions have no errors');
      await trigger.focus(); await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
      await page.waitForURL(url => url.pathname === '/events' && url.searchParams.get('grp') === 'nogizaka');
      await page.locator('a[href="/user"]').filter({ visible: true }).waitFor();
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).locator(theme === 'dark' ? '.lucide-sun' : '.lucide-moon').waitFor();
    } else {
      await page.getByRole('button', { name: /メニューを開く|Open menu|打开菜单/ }).click();
      await page.locator('a[href="/user"]').filter({ visible: true }).waitFor();
      await page.screenshot({ path: `${output}/fixed-auth-drawer-${theme}.png`, animations: 'disabled' });
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, [], `no hydration/runtime errors at ${width}px ${theme} with immediate auth, reload and navigation`);
    await page.close();
  }
  console.log('PASS 390/1440 light/dark, reload + actual Enter navigation, strict zero pageerrors: modal focus, dynamic focus trap, restore/Escape; dropdown keyboard/hover/Tab/aria; rapid auth hydration and mobile layout');
} finally { await browser.close(); }
