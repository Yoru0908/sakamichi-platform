import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium, webkit } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  configFile: false, root: root + 'tests/repo-export',
  resolve: { alias: { '@': root + 'src' } }, esbuild: { jsx: 'automatic' },
  plugins: [tailwindcss(), { name: 'baseline-alias', resolveId(id) {
    if (id.startsWith('virtual:baseline-')) return root + 'src/components/repo/templates/' + id.split('baseline-')[1] + '.tsx';
  } }],
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
});
await server.listen();
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      for (let template = 0; template < 3; template++) {
        await page.goto(server.resolvedUrls.local[0] + `?wrap=1&template=${template}`, { waitUntil: 'networkidle' });
        const result = await page.evaluate(async (projectRoot) => {
          await document.fonts.ready;
          const { domToForeignObjectSvg } = await import('/@fs/' + projectRoot + 'node_modules/modern-screenshot/dist/index.mjs');
          const root = document.getElementById('capture');
          const measure = parent => [...parent.querySelectorAll('[data-repo-bubble]')].map(el => {
            const box = el.getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(el.querySelector('span'));
            const text = range.getBoundingClientRect();
            return { text: el.textContent, width: box.width, height: box.height, textHeight: text.height, overflow: text.bottom > box.bottom };
          });
          const before = measure(root);
          const svg = await domToForeignObjectSvg(root);
          const frame = document.createElement('iframe');
          document.body.append(frame);
          frame.contentDocument.body.append(frame.contentDocument.importNode(svg, true));
          const after = measure(frame.contentDocument);
          frame.remove();
          return { before, after };
        }, root);
        assert.equal(result.before.length, 12);
        assert(result.before[0].width < 200 && result.before[0].height > 40, 'Tailwind bubble styles must actually be loaded');
        for (let i = 0; i < result.before.length; i++) {
          assert.equal(result.after[i].textHeight, result.before[i].textHeight, 'SVG clone must preserve wrapping');
          assert(!result.after[i].overflow, 'text must stay inside bubble');
        }
        console.log(`PASS ${engine.name()} template ${template}: standalone SVG preserves fixture wrapping (not an actual-device PNG verdict)`);
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
