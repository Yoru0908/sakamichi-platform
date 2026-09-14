// Real production E2E. Explicit credentials required; NO response fixtures.
// Credentials are process environment only. No HAR/trace/storageState/cookie export.
// Only login/refresh POSTs are permitted; no profile/permission/content writes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

const EMAIL = process.env.BLOG_RELATIONS_TEST_EMAIL;
const PASSWORD = process.env.BLOG_RELATIONS_TEST_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error('Set BLOG_RELATIONS_TEST_EMAIL and BLOG_RELATIONS_TEST_PASSWORD explicitly.');
// Do not inherit login credentials into Chromium or its subprocesses.
delete process.env.BLOG_RELATIONS_TEST_EMAIL;
delete process.env.BLOG_RELATIONS_TEST_PASSWORD;
const BASE = 'https://46log.com';
const OUT = process.env.BLOG_RELATIONS_AUTH_ARTIFACTS;
process.umask(0o077);
const safe = (value) => String(value).replaceAll(EMAIL, '[test-account]').replaceAll(PASSWORD, '[redacted]')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token]');
const report = { startedAt: new Date().toISOString(), base: BASE, mockedResponses: 0, session: {}, sourceRequests: [], authRenewals: [], checks: [], startupWarnings: [], runtimeErrors: [], assets: {}, blockedApplicationWrites: [] };
let phase = 'login';

(async () => {
  const { analyzeBlogs } = await import(pathToFileURL(path.resolve(__dirname, '../src/utils/blog-relations/analyze.ts')));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  const sourceData = new Map();
  const pending = new Set();
  let catalogue = null; let mainPage; let relationsActive = false;
  const record = (promise) => { pending.add(promise); promise.finally(() => pending.delete(promise)).catch(() => {}); };
  // This interceptor never fabricates responses. It only prevents unintended writes.
  await context.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      const allowed = req.method() === 'POST' && url.origin === 'https://api.46log.com' && ['/api/auth/login', '/api/auth/refresh'].includes(url.pathname);
      if (!allowed) {
        if (url.hostname === 'api.46log.com') report.blockedApplicationWrites.push({ method: req.method(), path: url.pathname });
        await route.abort(); return;
      }
    }
    await route.continue();
  });
  await context.addInitScript(() => { try { if (location.origin === 'https://46log.com') localStorage.setItem('lang', 'zh'); } catch {} });
  context.on('page', (page) => {
    page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(45000);
    page.on('pageerror', (error) => {
      const entry = { phase, message: safe(error.message) };
      if (/^Minified React error #418;/.test(error.message) && (!relationsActive || page !== mainPage)) {
        report.startupWarnings.push(entry);
        console.warn('STARTUP WARNING (outside active relations):', phase, entry.message);
      } else report.runtimeErrors.push(entry);
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin === 'https://api.46log.com' && url.pathname === '/api/auth/refresh' && response.request().method() === 'POST') report.authRenewals.push({ phase, status: response.status() });
      if (url.origin === BASE && url.pathname === '/api/blog-relations') record((async () => {
        const entry = { query: url.search, status: response.status(), cacheControl: response.headers()['cache-control'], phase };
        report.sourceRequests.push(entry);
        if (response.status() !== 200) return;
        const json = await response.json(); assert.equal(json.success, true, 'Real source API success');
        if (url.searchParams.has('group')) {
          const data = json.data;
          assert.equal(data.version, 'ja-source-v1');
          sourceData.set(`${data.group}:${data.month}`, data);
          entry.rows = data.rows.length;
        } else catalogue = json.data;
      })().catch((error) => { report.runtimeErrors.push({ phase: 'response-validation', message: safe(error.message) }); }));
      if (url.origin === BASE && /\/(BlogInteractions\.[^/]+\.js|relationship-analysis\.worker-[^/]+\.js)$/.test(url.pathname)) record((async () => {
        if (response.status() === 200) report.assets[url.pathname] = createHash('sha256').update(await response.body()).digest('hex');
      })().catch(() => {}));
    });
  });
  const page = await context.newPage(); mainPage = page;
  const waitFor = async (predicate, message) => {
    const deadline = Date.now() + 45000;
    while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(predicate(), message);
  };
  const check = (name, data = {}) => { report.checks.push({ name, ...data }); console.log('PASS', name, JSON.stringify(data)); };
  const openRelations = async () => {
    await page.waitForFunction(() => !document.querySelector('astro-island[client="load"][ssr]'));
    await page.waitForTimeout(500); relationsActive = true;
    await page.locator('.blog-pill').filter({ hasText: '关系分析' }).click();
    await page.locator('[data-relations-coverage]').waitFor();
  };
  const selectMonth = async (group, month) => {
    phase = `relations:${group}:${month}`;
    await page.getByLabel('团体', { exact: true }).selectOption(group);
    await page.getByLabel('博客月份（JST）', { exact: true }).selectOption(month);
    const key = `${group}:${month}`;
    await waitFor(() => sourceData.has(key), `Real source response for ${key}`);
    const source = sourceData.get(key);
    const expected = analyzeBlogs(source.rows, group, month);
    await page.getByText(`已分析日语正文 ${expected.coverage.analyzedBlogs} 篇`, { exact: true }).waitFor();
    assert.match(await page.locator('[data-relations-coverage]').innerText(), new RegExp(`提及组合 ${expected.edges.length} 组`));
    assert.equal(await page.locator('[aria-label="博客提及关系分析"] [role="alert"]').count(), 0);
    return expected;
  };
  const openEvidence = async (edge) => {
    await page.getByRole('button', { name: '提及关系', exact: true }).click();
    await page.getByRole('button', { name: `查看 ${edge.from} 提及 ${edge.to} 的依据`, exact: true }).click();
    assert.equal(await page.locator('[data-relations-evidence] mark').first().textContent(), edge.evidence[0].snippets[0].match);
    assert.equal(await page.locator('[data-relations-evidence] a').first().getAttribute('href'), edge.evidence[0].sourceUrl);
    assert.equal(await page.locator('[data-relations-evidence] article').count(), Math.min(10, edge.articleCount));
  };

  try {
    await page.goto(BASE + '/auth/login', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.querySelector('astro-island[client="load"][ssr]'));
    await page.waitForTimeout(500);
    await page.locator('#login-email').fill(EMAIL);
    await page.locator('#login-password').fill(PASSWORD);
    const loginResponse = page.waitForResponse((res) => res.url() === 'https://api.46log.com/api/auth/login' && res.request().method() === 'POST');
    await page.locator('form button[type="submit"]').click();
    const response = await loginResponse; const login = await response.json();
    assert.equal(response.status(), 200, 'Test-account login HTTP status');
    assert.equal(login.success, true, 'Test-account login successful');
    await page.waitForURL((url) => url.pathname !== '/auth/login');
    assert.ok(!page.url().includes('/auth/onboarding'), 'Do not change onboarding/profile settings');
    await page.goto(BASE + '/blog/', { waitUntil: 'domcontentloaded' });
    report.session = await page.evaluate(async (email) => {
      const response = await fetch('https://api.46log.com/api/auth/me', { credentials: 'include' });
      const result = await response.json(); const user = result.data?.user;
      const geo = await fetch('https://api.46log.com/api/auth/geo-check', { credentials: 'include' }).then((res) => res.json());
      return { status: response.status, matchesRequestedAccount: user?.email === email, role: user?.role, verificationStatus: user?.verificationStatus, country: geo.country || geo.data?.country };
    }, EMAIL);
    assert.equal(report.session.status, 200); assert.equal(report.session.matchesRequestedAccount, true);
    check('real browser login', { role: report.session.role, verificationStatus: report.session.verificationStatus, country: report.session.country });
    phase = 'relations:initial';
    await openRelations();
    await waitFor(() => catalogue !== null, 'Real catalogue loaded');
    check('real protected catalogue 200', { groupMonths: catalogue.months.length });

    for (const group of ['sakurazaka', 'nogizaka', 'hinatazaka']) {
      const month = catalogue.months.filter((entry) => entry.group === group).map((entry) => entry.month).sort().at(-1);
      const analysis = await selectMonth(group, month);
      assert.ok(analysis.edges.length > 0, 'Latest month contains genuine evidence');
      await openEvidence(analysis.edges[0]);
      check('desktop live source + computed evidence', { group, month, rows: analysis.coverage.sourceRows, analyzed: analysis.coverage.analyzedBlogs, edges: analysis.edges.length });
    }
    const big = await selectMonth('hinatazaka', '2025-12');
    check('larger historical month', { rows: big.coverage.sourceRows, analyzed: big.coverage.analyzedBlogs, edges: big.edges.length });
    const target = big.edges[0];
    await page.getByRole('button', { name: '被提及排行', exact: true }).click();
    await page.getByRole('button', { name: /篇 \/ .*处 · 查看来源/ }).first().click();
    assert.equal(await page.getByLabel('方向', { exact: true }).inputValue(), 'incoming');
    assert.ok(await page.getByRole('button', { name: /^查看 .* 的依据$/ }).count() > 0);
    await page.getByRole('button', { name: '期别提及', exact: true }).click();
    await page.locator('[aria-label="博客提及关系分析"] table tbody button:not([disabled])').first().click();
    await page.getByRole('button', { name: / → .* · \d+ 篇$/ }).first().click();
    await page.locator('[data-relations-evidence]').waitFor();
    check('ranking and generation drill-down');
    await page.getByRole('button', { name: '提及关系', exact: true }).click();
    await page.getByLabel('查看成员', { exact: true }).selectOption('');
    await openEvidence(target);

    phase = 'source-links';
    const article = target.evidence[0];
    const detailPromise = context.waitForEvent('page');
    await page.locator('[data-relations-evidence] a').filter({ hasText: '站内博客' }).first().click();
    const detail = await detailPromise;
    await detail.waitForLoadState('domcontentloaded');
    await detail.locator('.blog-detail-body').waitFor();
    assert.ok(detail.url().includes(encodeURIComponent(article.blogId)));
    check('site article actually opened', { blogId: article.blogId });
    await detail.close();
    const officialPromise = context.waitForEvent('page');
    await page.locator('[data-relations-evidence] a').filter({ hasText: '官方原文' }).first().click();
    const official = await officialPromise;
    await official.waitForURL(`${new URL(article.sourceUrl).origin}/**`, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(official.url()).hostname, new URL(article.sourceUrl).hostname);
    assert.ok((await official.locator('body').innerText()).normalize('NFKC').replace(/\s/g, '').includes(article.title.normalize('NFKC').replace(/\s/g, '')), 'Official page contains the archived article title');
    check('official source actually opened', { sourceUrl: article.sourceUrl });
    await official.close();

    const missing = await selectMonth('nogizaka', '2024-10');
    assert.equal(missing.coverage.analyzedBlogs, 0);
    await page.getByText('没有可用的日语正文，无法得出提及统计。', { exact: true }).waitFor();
    check('missing Japanese is not a zero-relationship conclusion', { rows: missing.coverage.sourceRows });

    phase = 'mobile:reload'; relationsActive = false;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openRelations();
    const mobile = await selectMonth('hinatazaka', '2026-09');
    await openEvidence(mobile.edges[0]);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('mobile authenticated reload and evidence', { analyzed: mobile.coverage.analyzedBlogs, edges: mobile.edges.length });
    if (OUT) { await fs.mkdir(OUT, { recursive: true }); await page.locator('[aria-label="博客提及关系分析"]').screenshot({ path: path.join(OUT, 'mobile-authenticated.png') }); }

    phase = 'session-refresh';
    // Delete only this isolated browser's short-lived cookie. Never revoke the
    // account's sessions: the platform logout endpoint revokes ALL devices.
    await context.clearCookies({ name: 'access_token' });
    const renewal = page.waitForResponse((res) => res.url() === 'https://api.46log.com/api/auth/refresh' && res.request().method() === 'POST');
    await page.getByRole('button', { name: '重新读取', exact: true }).click();
    assert.equal((await renewal).status(), 200, 'Real refresh endpoint succeeded');
    await page.getByText(`已分析日语正文 ${mobile.coverage.analyzedBlogs} 篇`, { exact: true }).waitFor();
    assert.ok((await context.cookies()).some((cookie) => cookie.name === 'access_token' && cookie.value));
    assert.equal(report.authRenewals.filter((entry) => entry.phase === 'session-refresh').length, 1, 'One real session renewal, not a loop');
    assert.ok(report.sourceRequests.some((entry) => entry.phase === 'session-refresh' && entry.status === 401));
    assert.ok(report.sourceRequests.some((entry) => entry.phase === 'session-refresh' && entry.status === 200));
    check('real 401 → session refresh → source 200 recovery');

    phase = 'completed';
    await Promise.all([...pending]);
    assert.equal(report.runtimeErrors.length, 0, 'No non-hydration runtime errors');
    assert.equal(report.blockedApplicationWrites.length, 0, 'No unexpected application write attempts');
    assert.ok(report.sourceRequests.filter((entry) => entry.status === 200).length >= 8);
    assert.ok(report.sourceRequests.every((entry) => [200, 401].includes(entry.status)), 'No forbidden/server-error source responses');
    assert.ok(report.sourceRequests.every((entry) => entry.cacheControl === 'no-store'));
    report.success = true;
  } catch (error) {
    report.success = false; report.failedPhase = phase; report.failure = safe(error.message);
    console.error('FAIL', phase, safe(error.stack || error.message)); process.exitCode = 1;
  } finally {
    await context.close(); await browser.close();
    report.finishedAt = new Date().toISOString();
    // Discard temporary browser credentials; deliberately do not call account-wide logout.
    report.browserSessionDiscarded = true;
    if (OUT) { await fs.mkdir(OUT, { recursive: true }); await fs.writeFile(path.join(OUT, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); }
    console.log('SUMMARY', JSON.stringify({ success: report.success, checks: report.checks.length, source200: report.sourceRequests.filter((entry) => entry.status === 200).length, startupWarnings: report.startupWarnings.length, failedPhase: report.failedPhase }));
  }
})().catch((error) => { console.error(safe(error.message)); process.exitCode = 1; });
