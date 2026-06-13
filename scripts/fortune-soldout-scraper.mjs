#!/usr/bin/env node
/**
 * Fortune Music 完售データ自動抽出スクリプト
 *
 * HTTP login → goods_list ページ取得 → HTML から完売セルを解析 → API に送信
 *
 * Usage:
 *   FORTUNE_EMAIL=xxx FORTUNE_PW=xxx node scripts/fortune-soldout-scraper.mjs <event_slug> [round_number]
 *
 * Example:
 *   FORTUNE_EMAIL=srzwyuu@gmail.com FORTUNE_PW=xxx node scripts/fortune-soldout-scraper.mjs sakurazaka_202606 3
 */

const FORTUNE_BASE = 'https://fortunemusic.jp';
const API_BASE = 'https://api.46log.com';

const email = process.env.FORTUNE_EMAIL;
const pw = process.env.FORTUNE_PW;
const eventSlug = process.argv[2];
const roundNumber = process.argv[3] || '';

if (!email || !pw || !eventSlug) {
  console.error('Usage: FORTUNE_EMAIL=xxx FORTUNE_PW=xxx node scripts/fortune-soldout-scraper.mjs <event_slug> [round_number]');
  process.exit(1);
}

// Fortune Music IP (DNS sometimes fails locally)
const FORTUNE_IP = '54.238.104.9';

async function fortuneFetch(path, opts = {}) {
  const url = `${FORTUNE_BASE}${path}`;
  return fetch(url, {
    ...opts,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...opts.headers,
    },
    redirect: 'manual',
  });
}

// Step 1: Login
console.log('[1/4] Logging in to Fortune Music...');

const loginRes = await fortuneFetch('/default/login/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `login_id=${encodeURIComponent(email)}&login_pw=${encodeURIComponent(pw)}&login_type=NEW`,
});

// Collect cookies from redirect chain
const cookies = [];
function extractCookies(res) {
  const setCookies = res.headers.getSetCookie?.() || [];
  for (const sc of setCookies) {
    const nameVal = sc.split(';')[0];
    cookies.push(nameVal);
  }
}

extractCookies(loginRes);

// Follow redirects manually to collect all cookies
let location = loginRes.headers.get('location');
while (location) {
  const nextRes = await fetch(location, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Cookie': cookies.join('; '),
    },
    redirect: 'manual',
  });
  extractCookies(nextRes);
  location = nextRes.headers.get('location');
  if (!location && nextRes.status === 200) {
    const html = await nextRes.text();
    if (html.includes('data-login="1"')) {
      console.log('  ✅ Login successful');
    } else {
      console.error('  ❌ Login failed');
      process.exit(1);
    }
  }
}

const cookieStr = cookies.join('; ');

// Step 2: Find available rounds
console.log(`[2/4] Fetching event page: ${eventSlug}...`);
const eventRes = await fetch(`${FORTUNE_BASE}/${eventSlug}/`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Cookie': cookieStr,
  },
});
const eventHtml = await eventRes.text();

// Find all goods_list links
const goodsLinks = [...eventHtml.matchAll(/href="\/([^"]+?)\/(\d+)\/goods_list\/"/g)]
  .map(m => ({ path: `/${m[1]}/${m[2]}/goods_list/`, round: m[2] }));

// Also look for links without quotes variations
const goodsLinks2 = [...eventHtml.matchAll(new RegExp(`/${eventSlug}/(\\d+)/goods_list/`, 'g'))]
  .map(m => ({ path: `/${eventSlug}/${m[1]}/goods_list/`, round: m[1] }));

const allLinks = [...new Map([...goodsLinks, ...goodsLinks2].map(l => [l.round, l])).values()];

if (allLinks.length === 0) {
  console.error('  ❌ No goods_list links found. Event may not be in reception period.');
  process.exit(1);
}

const targetRound = roundNumber || allLinks[allLinks.length - 1].round;
const targetLink = allLinks.find(l => l.round === targetRound);

if (!targetLink) {
  console.error(`  ❌ Round ${targetRound} not found. Available: ${allLinks.map(l => l.round).join(', ')}`);
  process.exit(1);
}

console.log(`  Found rounds: ${allLinks.map(l => l.round).join(', ')}. Using round ${targetRound}.`);

// Step 3: Fetch goods_list page and parse
console.log(`[3/4] Fetching goods list: ${targetLink.path}...`);
const goodsRes = await fetch(`${FORTUNE_BASE}${targetLink.path}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Cookie': cookieStr,
  },
});
const goodsHtml = await goodsRes.text();

// Parse: each date section starts with a tglHook button containing a date
const soldOutCells = [];
const dateRegex = /(\d{4})年(\d{1,2})月(\d{1,2})日/;
const sections = goodsHtml.split(/<button class="tglHook js_tglHook" type="button">/);

for (let i = 1; i < sections.length; i++) {
  const section = sections[i];
  const dateMatch = section.match(dateRegex);
  if (!dateMatch) continue;

  const date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;

  // Find all member rows: <th class="rowHead">Name</th> followed by <td> cells
  const rowRegex = /<th class="rowHead">(.*?)<\/th>([\s\S]*?)(?=<\/tr>)/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(section)) !== null) {
    const memberName = rowMatch[1].replace(/[\s\u3000]+/g, '').replace(/&nbsp;/g, '').trim();
    const cellsHtml = rowMatch[2];

    // Count cells: each <td> is a slot (1-indexed)
    const cellParts = cellsHtml.split(/<\/td>/);
    let slotNumber = 0;
    for (const cell of cellParts) {
      if (!cell.includes('<td')) continue;
      slotNumber++;
      if (cell.includes('SOLD OUT')) {
        soldOutCells.push({ date, slot: slotNumber, member: memberName });
      }
    }
  }
}

console.log(`  Found ${soldOutCells.length} sold-out cells across ${new Set(soldOutCells.map(c => c.date)).size} dates`);

// Summary per date
const byDate = {};
for (const cell of soldOutCells) {
  byDate[cell.date] = byDate[cell.date] || [];
  byDate[cell.date].push(cell);
}
for (const [date, cells] of Object.entries(byDate).sort()) {
  const members = [...new Set(cells.map(c => c.member))];
  console.log(`  ${date}: ${cells.length} cells (${members.length} members: ${members.join(', ')})`);
}

if (soldOutCells.length === 0) {
  console.log('  No sold-out cells found.');
  process.exit(0);
}

// Step 4: Send to API
console.log(`[4/4] Sending to API...`);

// Get 46log access token from cookie or env
const accessToken = process.env.ACCESS_TOKEN;
if (!accessToken) {
  // Print data for manual import
  console.log('\n⚠️  No ACCESS_TOKEN set. Printing data for manual import:');
  console.log(JSON.stringify({
    eventSlug,
    roundLabel: `第${targetRound}次受付`,
    cells: soldOutCells,
  }, null, 2));
  console.log(`\nTo send: ACCESS_TOKEN=<your_token> node scripts/fortune-soldout-scraper.mjs ${eventSlug} ${targetRound}`);
  process.exit(0);
}

const apiRes = await fetch(`${API_BASE}/api/miguri/soldout-import`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': `access_token=${accessToken}`,
  },
  body: JSON.stringify({
    eventSlug,
    roundLabel: `第${targetRound}次受付`,
    cells: soldOutCells,
  }),
});

const apiData = await apiRes.json();
if (apiData.success) {
  console.log(`  ✅ Round ${apiData.data.roundNumber}: ${apiData.data.newCells} new cells, ${apiData.data.totalCells} total`);
} else {
  console.error(`  ❌ API error: ${apiData.error}`);
  process.exit(1);
}
