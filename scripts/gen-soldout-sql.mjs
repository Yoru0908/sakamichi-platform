#!/usr/bin/env node
/**
 * Fetch Fortune Music sold-out data and output SQL for D1 import
 */
const FORTUNE_BASE = 'https://fortunemusic.jp';
const email = process.env.FORTUNE_EMAIL;
const pw = process.env.FORTUNE_PW;
const eventSlug = process.argv[2] || 'sakurazaka_202606';
const roundArg = process.argv[3] || '3';

async function run() {
  // Login - follow redirects manually to collect all Set-Cookie headers
  const allCookies = new Map();
  function collectCookies(res) {
    for (const sc of (res.headers.getSetCookie?.() || [])) {
      const nameVal = sc.split(';')[0];
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx > 0) allCookies.set(nameVal.substring(0, eqIdx), nameVal);
    }
  }

  let res = await fetch(`${FORTUNE_BASE}/default/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body: `login_id=${encodeURIComponent(email)}&login_pw=${encodeURIComponent(pw)}&login_type=NEW`,
    redirect: 'manual',
  });
  collectCookies(res);

  let location = res.headers.get('location');
  while (location) {
    res = await fetch(location, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': [...allCookies.values()].join('; ') },
      redirect: 'manual',
    });
    collectCookies(res);
    location = res.headers.get('location');
  }
  const cookieStr = [...allCookies.values()].join('; ');
  process.stderr.write(`Login done (${allCookies.size} cookies), fetching goods...\n`);

  const goodsRes = await fetch(`${FORTUNE_BASE}/${eventSlug}/${roundArg}/goods_list/`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookieStr },
  });
  const html = await goodsRes.text();

  const cells = [];
  const dateRegex = /(\d{4})年(\d{1,2})月(\d{1,2})日/;
  const sections = html.split(/<button class="tglHook js_tglHook" type="button">/);
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const dateMatch = section.match(dateRegex);
    if (!dateMatch) continue;
    const date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    const rowRegex = /<th class="rowHead">(.*?)<\/th>([\s\S]*?)(?=<\/tr>)/g;
    let m;
    while ((m = rowRegex.exec(section)) !== null) {
      const member = m[1].replace(/[\s\u3000]+/g, '').replace(/&nbsp;/g, '');
      const parts = m[2].split(/<\/td>/);
      let slot = 0;
      for (const cell of parts) {
        if (!cell.includes('<td')) continue;
        slot++;
        if (cell.includes('SOLD OUT')) cells.push({ date, slot, member });
      }
    }
  }
  process.stderr.write(`Found ${cells.length} sold-out cells\n`);

  const memberCount = new Set(cells.map(c => c.member)).size;
  console.log(`INSERT INTO miguri_soldout_snapshots (event_slug, round_number, window_label, member_count, cell_count) VALUES ('${eventSlug}', 1, '第${roundArg}次受付時点', ${memberCount}, ${cells.length});`);
  for (const c of cells) {
    console.log(`INSERT OR IGNORE INTO miguri_soldout_cells (event_slug, round_number, event_date, slot_number, member_name) VALUES ('${eventSlug}', 1, '${c.date}', ${c.slot}, '${c.member}');`);
  }
}
run();
