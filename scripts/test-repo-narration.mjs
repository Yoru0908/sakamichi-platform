import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = process.env.BASE_URL ? null : await createServer({
 configFile: false, root: root + 'tests/repo-preferences', resolve: { alias: { '@': root + 'src' } }, esbuild: { jsx: 'automatic' },
 server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
});
if (server) await server.listen();
const b = await chromium.launch();
try {
 const p = await b.newPage();
 let saved;
 await p.route('**/api/**', async r => {
   const path = new URL(r.request().url()).pathname;
   let data = {};
   if (path.endsWith('/me')) data = { user: { id: 'fixture-user', role: 'member', displayName: 'Fixture', oshiMember: '山川宇衣' } };
   if (path.endsWith('/preferences')) data = { oshiMember: '山川宇衣', followedMembers: [] };
   if (path.endsWith('/favorites')) data = { favorites: [{ name: '山川宇衣', group: '樱坂46' }] };
   if (path.endsWith('/my-works')) data = { repos: saved ? [saved] : [], pagination: { total: saved ? 1 : 0 } };
   if (path.includes('/repo/works/') && r.request().method() === 'PUT') {
     saved = { ...r.request().postDataJSON(), id: path.split('/').at(-1), createdAt: '2026-09-11', updatedAt: '2026-09-11' };
     data = { id: saved.id, status: 'draft' };
   }
   await r.fulfill({ json: { success: true, data } });
 });
 const url = process.env.BASE_URL ? process.env.BASE_URL + '/repo/create' : server.resolvedUrls.local[0];
 await p.goto(url, { waitUntil: 'domcontentloaded' });
 const folder = p.locator('[data-repo-member-folder="山川宇衣"]');
 await folder.waitFor({ timeout: 45000 });
 await folder.getByRole('button', { name: /山川宇衣/ }).click();
 await folder.getByRole('button', { name: '新建Repo', exact: true }).click();
 const picker = p.getByRole('group', { name: '旁白颜色', exact: true });
 assert.equal(await picker.getByRole('button', { name: '原样', exact: true }).getAttribute('aria-pressed'), 'true');
 await picker.getByRole('button', { name: '浅粉', exact: true }).click();
 await p.getByRole('button', { name: 'ト書き', exact: true }).click();
 await p.locator('textarea').fill('旁白第一行\n旁白第二行 😊');
 await picker.getByRole('button', { name: '浅粉', exact: true }).click();
 assert.equal(await p.locator('[data-repo-export-root] [data-repo-narration]').count(), 1);
 await picker.getByLabel('自定义旁白颜色', { exact: true }).fill('#abcdef');
 await p.getByRole('button', { name: '保存草稿', exact: true }).click();
 await p.getByRole('button', { name: '覆盖保存', exact: true }).waitFor();
 assert(saved);
 assert(saved.messages.every(message => message.narrationColor === '#abcdef'));
 assert.equal(saved.messages.find(message => message.speaker === 'narration').text, '旁白第一行\n旁白第二行 😊');
 await p.goto(url, { waitUntil: 'domcontentloaded' });
 await folder.getByRole('button', { name: /山川宇衣/ }).click();
 await folder.getByRole('button', { name: `${saved.eventDate} 第${saved.slotNumber}部`, exact: true }).click();
 await p.waitForFunction(() => document.querySelector('input[aria-label="自定义旁白颜色"]')?.value === '#abcdef');
 assert.equal(await p.locator('[data-repo-export-root] [data-repo-narration]').count(), 1);
 for (const label of ['LINE 风格', '応援色', '咪咕力']) {
   await p.getByRole('button', { name: label, exact: true }).click();
   assert.equal(await p.locator('[data-repo-export-root] [data-repo-narration]').count(), 1);
 }
 await picker.getByRole('button', { name: '原样', exact: true }).click();
 assert.equal(await p.locator('[data-repo-narration]').count(), 0);
 await p.getByRole('button', { name: '覆盖保存', exact: true }).click();
 await p.getByRole('button', { name: '覆盖保存', exact: true }).waitFor();
 assert(saved.messages.every(message => !('narrationColor' in message)));
 await p.goto(url, { waitUntil: 'domcontentloaded' });
 await folder.getByRole('button', { name: /山川宇衣/ }).click();
 await folder.getByRole('button', { name: `${saved.eventDate} 第${saved.slotNumber}部`, exact: true }).click();
 await p.getByRole('button', { name: '覆盖保存', exact: true }).waitFor();
 assert.equal(await picker.getByRole('button', { name: '原样', exact: true }).getAttribute('aria-pressed'), 'true');
 assert.equal(await p.locator('[data-repo-narration]').count(), 0);
 console.log('PASS picker presets/custom, new narration inherits color, mock account save/reload, 3 templates, reset and legacy drafts; no real API writes');
} finally { await b.close(); await server?.close(); }
