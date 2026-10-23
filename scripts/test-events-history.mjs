import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { summarizeAttendance } from '../workers/shared/event-attendance.ts';
const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
const browser = await chromium.launch();
const id = '12161_18:2026-10-18';
const rows = [
  { id, grp: 'sakurazaka', date: '2026-10-18', title: '公式記録テスト', markedAt: 1, sourceStatus: 'saved-snapshot', updatedAt: null },
  { id: 'h_99:2026-11-01', grp: 'hinatazaka', date: '2026-11-01', title: '未来の予定', markedAt: 2, sourceStatus: 'saved-snapshot', updatedAt: null },
];
const user = { id: 'owner-a', email: 'owner@example.invalid', displayName: 'Private account name', avatarUrl: null, role: 'member', isFirstLogin: false, oshiMember: null, verificationStatus: 'none', geoStatus: null, paymentStatus: null };
const errors = [];
let profile = { public: false, name: '' }, memo = { note: '', cost: {} }, memoReads = 0, memoVersion = null;
let failSave = false, failReadback = false, failNextRead = false, failProfile = false;
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem('lang', 'ja'));
await page.clock.install({ time: new Date('2026-10-23T03:00:00Z') });
await page.context().route('https://api.46log.com/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  const reply = (data, status = 200, error = 'fixture failure') => route.fulfill({ status, json: status < 400 ? { success: true, data } : { success: false, error }, headers: { 'Access-Control-Allow-Origin': new URL(base).origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,PUT,PATCH,DELETE,POST,OPTIONS', 'Cache-Control': 'no-store' } });
  if (req.method() === 'OPTIONS') return reply({});
  if (path.endsWith('/auth/me')) return reply({ user });
  if (path.endsWith('/sakamichi-events')) return reply({ events: [{ ...rows[0], kind: 'ライブ', category: 'attend', shows: [], members: [], wholeGroup: true, sourceUrl: 'https://sakurazaka46.com/', venue: null }] });
  if (path.endsWith('/marks')) return reply({ mine: [id] });
  if (path.endsWith('/counts')) return reply({ counts: { [id]: 1 } });
  if (path.endsWith('/history')) {
    const records = rows.map(row => ({ ...row, ...(row.id === id ? { ...memo, updatedAt: memoVersion } : { note: '', cost: {} }) }));
    return reply({ records, summary: summarizeAttendance(records, '2026-10-23'), nextOffset: null });
  }
  if (path.includes('/memos/')) {
    if (req.method() === 'PATCH') {
      if (failSave) return reply({}, 500);
      const input = req.postDataJSON();
      if (!Object.hasOwn(input, 'expectedUpdatedAt')) return reply({}, 400);
      if (input.expectedUpdatedAt !== memoVersion) return reply({}, 409, 'memo_conflict');
      memo = { note: input.note.trim(), cost: input.cost }; memoVersion = (memoVersion ?? 0) + 1;
      if (failReadback) failNextRead = true;
    } else {
      memoReads++;
      if (failNextRead) { failNextRead = false; return reply({}, 500); }
    }
    return reply({ marked: true, memo, updatedAt: memoVersion });
  }
  if (path.endsWith('/profile')) {
    if (req.method() === 'PUT') { if (failProfile) return reply({}, 500); profile = req.postDataJSON(); }
    return reply(profile);
  }
  if (path.endsWith('/ranking')) return reply({ ranking: profile.public ? [{ rank: 1, name: profile.name, days: 1, events: 1 }] : [], asOf: '2026-10-23' });
  return reply({});
});
try {
  await page.goto(base + '/events/history/');
  const record = page.locator(`[data-history-record="${id}"]`);
  await record.waitFor(); assert.equal(memoReads, 0, 'closed memo forms must not fan out requests');
  assert(await page.getByText('未来の予定', { exact: true }).count());
  await record.locator('summary').click();
  const note = record.getByLabel('感想・自分用メモ'); await note.fill('  覚えておきたい景色  ');
  await record.getByLabel('チケット (JPY)').fill('9800'); await record.getByLabel('交通 (JPY)').fill('0');
  await record.getByRole('button', { name: '保存', exact: true }).click();
  await record.getByRole('status').filter({ hasText: '保存を確認しました' }).waitFor();
  assert.equal(await note.inputValue(), '覚えておきたい景色'); assert.equal(memo.cost.travel, 0);
  failSave = true; await note.fill('失敗しても入力を残す'); await record.getByRole('button', { name: '保存', exact: true }).click();
  await record.getByRole('alert').waitFor(); assert.equal(await note.inputValue(), '失敗しても入力を残す'); assert.equal(memo.note, '覚えておきたい景色');
  failSave = false; failReadback = true; await record.getByRole('button', { name: '保存', exact: true }).click();
  await record.getByText(/保存結果を確認できませんでした/).waitFor(); assert.equal(await note.inputValue(), '失敗しても入力を残す');
  failReadback = false; await record.getByRole('button', { name: '保存', exact: true }).click();
  await record.getByText(/保存済みの記録が更新されています/).waitFor();
  assert.equal(await note.inputValue(), '失敗しても入力を残す', 'a retry after an unverified write must preserve the draft on conflict');
  await page.reload(); await record.waitFor(); await record.locator('summary').click(); await note.waitFor();
  assert.equal(await note.inputValue(), '失敗しても入力を残す'); assert.equal(await record.getByLabel('交通 (JPY)').inputValue(), '0');
  const editorB = await page.context().newPage();
  editorB.on('pageerror', error => errors.push(error.message));
  await editorB.goto(base + '/events/history/');
  const recordB = editorB.locator(`[data-history-record="${id}"]`);
  await recordB.locator('summary').click();
  const noteB = recordB.getByLabel('感想・自分用メモ'); await noteB.waitFor();
  assert.equal(await noteB.inputValue(), '失敗しても入力を残す');
  await note.fill('別タブで保存した感想'); await record.getByRole('button', { name: '保存', exact: true }).click();
  await record.getByRole('status').filter({ hasText: '保存を確認しました' }).waitFor();
  await recordB.getByLabel('チケット (JPY)').fill('12000'); await recordB.getByRole('button', { name: '保存', exact: true }).click();
  await recordB.getByText(/保存済みの記録が更新されています/).waitFor();
  assert.equal(await noteB.inputValue(), '失敗しても入力を残す'); assert.equal(await recordB.getByLabel('チケット (JPY)').inputValue(), '12000');
  assert.equal(memo.note, '別タブで保存した感想'); assert.equal(memo.cost.ticket, 9800, 'stale cost-only editor must not change either persisted field');
  if (process.env.SCREENSHOT_DIR) await recordB.screenshot({ path: `${process.env.SCREENSHOT_DIR}/event-memo-conflict-mobile.png` });
  await editorB.close();
  await note.fill('失敗しても入力を残す'); await record.getByRole('button', { name: '保存', exact: true }).click();
  await record.getByRole('status').filter({ hasText: '保存を確認しました' }).waitFor();
  console.log('PASS two tabs: stale cost-only save conflicts, keeps both draft fields and preserves the newer stored note/cost; verified saves advance the version');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.SCREENSHOT_DIR) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/event-history-mobile.png`, fullPage: true, style: 'astro-dev-toolbar { visibility: hidden; }' }); }
  console.log('PASS owner history, lazy memo loading, private memo save/readback/reload, explicit zero, failed save and failed readback preserve input, 390px layout');
  await page.goto(base + `/events?event=${encodeURIComponent(id)}`);
  const modalMemo = page.locator(`[data-event-memo="${id}"]`);
  await modalMemo.waitFor();
  assert.equal(await modalMemo.getByLabel('感想・自分用メモ').inputValue(), '失敗しても入力を残す');
  await modalMemo.getByLabel('感想・自分用メモ').fill('詳細からも同じ記録に保存');
  await modalMemo.getByRole('button', { name: '保存', exact: true }).click();
  await modalMemo.getByRole('status').filter({ hasText: '保存を確認しました' }).waitFor();
  assert.equal(memo.note, '詳細からも同じ記録に保存');
  console.log('PASS /events deep link opens the correct saved day and the integrated modal edits the same private memo');
  await page.goto(base + '/events/ranking/');
  await page.getByText('ランキング非公開', { exact: true }).waitFor();
  assert(await page.getByText(/公開を選んだ参加記録のあるユーザーはまだいません/).isVisible());
  await page.getByLabel('公開する表示名', { exact: true }).fill('公開用の名前');
  await page.getByLabel('公開ランキングに参加する', { exact: true }).check();
  failProfile = true; await page.getByRole('button', { name: '公開設定を保存', exact: true }).click();
  await page.getByRole('alert').waitFor(); assert.equal(profile.public, false); assert.equal(await page.locator('tbody tr').count(), 0);
  failProfile = false; await page.getByRole('button', { name: '公開設定を保存', exact: true }).click();
  await page.locator('tbody tr').waitFor(); assert.match(await page.locator('tbody').innerText(), /公開用の名前/);
  assert(!(await page.locator('tbody').innerText()).includes('Private account name'));
  await page.reload(); await page.getByText('ランキング公開中', { exact: true }).waitFor();
  await page.getByLabel('公開ランキングに参加する', { exact: true }).uncheck();
  await page.getByRole('button', { name: '公開設定を保存', exact: true }).click();
  await page.getByText('ランキング非公開', { exact: true }).waitFor(); assert.equal(await page.locator('tbody tr').count(), 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS default private, failed opt-in stays private, explicit public name, reload and immediate opt-out; no runtime errors');
} finally { await browser.close(); }
