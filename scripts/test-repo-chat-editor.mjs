// Run: node scripts/test-repo-chat-editor.mjs
// Requires Playwright + Chromium (npm install --no-save playwright; npx playwright install chromium).
// Isolated Vite fixture: no auth, production data writes or test pages in Astro output.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../tests/repo-chat-editor/', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  for (const [id, original] of [['me', '今回のツアね'], ['member', 'ありがとう'], ['narration', '笑顔で']]) {
    await page.getByText(original, { exact: true }).click();
    const input = page.locator(`#msg-input-${id}`);
    await input.waitFor();
    await page.waitForFunction(id => document.activeElement?.id === `msg-input-${id}`, id);
    assert.equal(await input.evaluate(el => el.selectionStart), original.length);
    await input.press('End');
    await input.press('Enter');
    await input.pressSequentially('continued');
    assert.equal(await input.inputValue(), original + '\ncontinued');
    assert.equal(await input.evaluate(el => el.selectionStart), original.length + 10);
    assert(await input.evaluate(el => document.activeElement === el));

    // Simulate the IME event contract; composing Enter must not be canceled or unmount the textarea.
    const ime = await input.evaluate(el => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
      el.dispatchEvent(enter);
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'いろんな' }));
      return { prevented: enter.defaultPrevented, attached: el.isConnected };
    });
    assert.deepEqual(ime, { prevented: false, attached: true });
    assert(await input.evaluate(el => document.activeElement === el));
    await input.press('Shift+Enter');
    await input.pressSequentially('next');
    const expected = original + '\ncontinued\nnext';
    assert.equal(await input.inputValue(), expected);

    // Editing in the middle must not force the caret to the end on every React update.
    await input.evaluate(el => el.setSelectionRange(1, 1));
    await input.pressSequentially('XY');
    const edited = expected.slice(0, 1) + 'XY' + expected.slice(1);
    assert.equal(await input.inputValue(), edited);
    assert.equal(await input.evaluate(el => el.selectionStart), 3);
    await page.locator('#outside').click();
    assert.equal(await input.count(), 0);
    const state = JSON.parse(await page.locator('#state').textContent());
    assert.equal(state.find(m => m.id === id).text, edited);
    await page.getByText(edited, { exact: true }).click();
    await page.waitForFunction(id => document.activeElement?.id === `msg-input-${id}`, id);
    assert.equal(await input.evaluate(el => el.selectionStart), edited.length);
    await page.locator('#outside').click();
    console.log(`PASS ${id}: Enter, Shift+Enter, IME event contract, mid-text caret, blur/save/reopen`);
  }
  await page.getByRole('button', { name: '自分', exact: true }).click();
  const added = page.locator('textarea');
  await added.waitFor();
  await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
  await added.pressSequentially('new');
  await added.press('Enter');
  await added.pressSequentially('line');
  assert.equal(await added.inputValue(), 'new\nline');
  console.log('PASS new-message focus and multiline input');
  await page.locator('#outside').click();
  const readState = async () => JSON.parse(await page.locator('#state').textContent());
  const beforeMove = await readState();
  const row = id => page.locator(`[data-message-id="${id}"]`);
  assert(await row('me').getByRole('button', { name: /を上へ移動$/ }).isDisabled());
  assert(await row(beforeMove.at(-1).id).getByRole('button', { name: /を下へ移動$/ }).isDisabled());
  await row('image').getByRole('button', { name: /を上へ移動$/ }).click();
  let moved = await readState();
  assert.deepEqual(moved.map(m => m.id), ['me', 'member', 'image', 'narration', beforeMove.at(-1).id]);
  for (const message of beforeMove) assert.deepEqual(moved.find(m => m.id === message.id), message);
  await row('image').getByRole('button', { name: /を下へ移動$/ }).click();
  assert.deepEqual(await readState(), beforeMove);
  console.log('PASS reorder up/down, boundary buttons, original text/image metadata preserved');

  // Desktop mouse reordering should not close the current editor or reset its caret.
  await page.getByText(beforeMove[1].text, { exact: true }).click();
  const memberInput = page.locator('#msg-input-member');
  await page.waitForFunction(() => document.activeElement?.id === 'msg-input-member');
  await memberInput.evaluate(el => el.setSelectionRange(2, 2));
  await row('member').getByRole('button', { name: /を上へ移動$/ }).click();
  assert(await memberInput.evaluate(el => document.activeElement === el));
  assert.equal(await memberInput.evaluate(el => el.selectionStart), 2);
  await page.locator('#outside').click();
  console.log('PASS reordering an active editor preserves focus/caret');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [speaker, label] of [['member', '+ 山川宇衣'], ['me', '+ 自分'], ['narration', '+ ト書き']]) {
    const previous = await readState();
    await row('me').getByRole('button', { name: /の上に挿入$/ }).click();
    await page.getByRole('group', { name: '挿入する話者', exact: true }).getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
    const current = await readState();
    const newMessage = current.find(m => !previous.some(p => p.id === m.id));
    assert(newMessage);
    assert.equal(newMessage.speaker, speaker);
    assert.equal(current.findIndex(m => m.id === newMessage.id), current.findIndex(m => m.id === 'me') - 1);
    assert.equal(await page.locator('textarea').getAttribute('id'), `msg-input-${newMessage.id}`);
    await page.locator('textarea').pressSequentially('inserted');
    await page.locator('#outside').click();
    const after = await readState();
    for (const message of previous) assert.deepEqual(after.find(m => m.id === message.id), message);
  }
  const beforeCancel = await readState();
  await row('me').getByRole('button', { name: /の上に挿入$/ }).click();
  await page.getByRole('button', { name: '挿入をキャンセル', exact: true }).click();
  assert.deepEqual(await readState(), beforeCancel);
  assert.equal(await page.getByRole('group', { name: '挿入する話者', exact: true }).count(), 0);
  console.log('PASS mobile-width insert-before for all speakers, automatic focus, cancel');

  await page.goto(server.resolvedUrls.local[0] + '?long=1');
  const list = page.locator('[data-chat-message-list]');
  await page.locator('[data-message-id="long_29"]').waitFor();
  await list.evaluate(el => { el.scrollTop = 0; });
  await page.getByRole('button', { name: '自分', exact: true }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-chat-message-list]');
    return el.scrollTop > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 2;
  });
  const newInput = page.locator('textarea');
  assert(await newInput.evaluate(el => document.activeElement === el));
  assert(await newInput.evaluate(el => {
    const r = el.getBoundingClientRect(), container = el.closest('[data-chat-message-list]').getBoundingClientRect();
    return r.top >= container.top && r.bottom <= container.bottom;
  }));
  await newInput.pressSequentially('visible addition');
  await list.evaluate(el => { el.scrollTop = 0; });
  // Input updates do not steal a manually chosen scroll position.
  await newInput.evaluate(el => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, el.value + '!');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(100);
  assert.equal(await list.evaluate(el => el.scrollTop), 0);
  await page.locator('[data-message-id="long_1"]').getByRole('button', { name: /の上に挿入$/ }).click();
  await page.getByRole('group', { name: '挿入する話者', exact: true }).getByRole('button', { name: '+ ト書き', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
  assert(await list.evaluate(el => el.scrollTop < el.scrollHeight / 2));
  assert(await page.locator('textarea').evaluate(el => {
    const r = el.getBoundingClientRect(), container = el.closest('[data-chat-message-list]').getBoundingClientRect();
    return r.top >= container.top && r.bottom <= container.bottom;
  }));
  await page.locator('input[type=file]').first().setInputFiles({ name: 'test.gif', mimeType: 'image/gif', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-chat-message-list]');
    return el.scrollTop > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 2;
  });
  assert.deepEqual(errors, []);
  console.log('PASS long-list append/image auto-scroll, insert-near-target, typing preserves manual scroll; no runtime errors');
} finally {
  await browser.close();
  await server.close();
}
