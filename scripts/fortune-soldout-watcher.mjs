#!/usr/bin/env node
/**
 * Fortune Music 完售データ自動監視スクリプト
 *
 * 全アクティブイベントを巡回し、新しい完売データがあれば自動的に API へ送信する。
 * Homeserver 上で cron 実行を想定。
 *
 * 環境変数:
 *   FORTUNE_EMAIL      - Fortune Music ログインメール
 *   FORTUNE_PW         - Fortune Music ログインパスワード
 *   MIGURI_SYNC_SECRET - 46log API サーバー認証キー
 *
 * Usage:
 *   node scripts/fortune-soldout-watcher.mjs
 *
 * Cron example (every 30 min):
 *   star/30 * * * * cd ~/sakamichi-platform && node scripts/fortune-soldout-watcher.mjs >> logs/soldout-watcher.log 2>&1
 *   (replace star with *)
 */

const FORTUNE_BASE = 'https://fortunemusic.jp';
const API_BASE = 'https://api.46log.com';

const email = process.env.FORTUNE_EMAIL;
const pw = process.env.FORTUNE_PW;
const syncSecret = process.env.MIGURI_SYNC_SECRET;

if (!email || !pw) {
  console.error('[ERROR] FORTUNE_EMAIL and FORTUNE_PW are required');
  process.exit(1);
}
if (!syncSecret) {
  console.error('[ERROR] MIGURI_SYNC_SECRET is required');
  process.exit(1);
}

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ── Step 1: Get active events from API ──

async function getActiveEvents() {
  // Fetch active event slugs from our API
  const res = await fetch(`${API_BASE}/api/miguri/events`);
  if (!res.ok) throw new Error(`API /events failed: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`API error: ${data.error}`);

  // All returned events are active (archived ones are excluded by API)
  const events = data.data?.events || [];
  return events.map(e => ({ slug: e.slug, group: e.group, title: e.title, sourceUrl: e.sourceUrl }));
}

// ── Step 2: Get existing rounds from API ──

async function getExistingRounds(eventSlug) {
  const res = await fetch(`${API_BASE}/api/miguri/soldout?event=${eventSlug}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.success) return [];
  return (data.data?.rounds || []).map(r => r.round);
}

// ── Step 3: Fortune Music login ──

async function fortuneLogin() {
  const loginRes = await fetch(`${FORTUNE_BASE}/default/login/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: `login_id=${encodeURIComponent(email)}&login_pw=${encodeURIComponent(pw)}&login_type=NEW`,
    redirect: 'manual',
  });

  const cookies = [];
  function extractCookies(res) {
    const setCookies = res.headers.getSetCookie?.() || [];
    for (const sc of setCookies) {
      cookies.push(sc.split(';')[0]);
    }
  }

  extractCookies(loginRes);

  let location = loginRes.headers.get('location');
  let loggedIn = false;
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
      loggedIn = html.includes('data-login="1"');
    }
  }

  if (!loggedIn) throw new Error('Fortune Music login failed');
  return cookies.join('; ');
}

// ── Step 4: Get available Fortune Music rounds ──

async function getFortuneRounds(eventSlug, cookieStr) {
  const res = await fetch(`${FORTUNE_BASE}/${eventSlug}/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Cookie': cookieStr,
    },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const links1 = [...html.matchAll(/href="\/([^"]+?)\/(\d+)\/goods_list\/"/g)]
    .map(m => ({ path: `/${m[1]}/${m[2]}/goods_list/`, round: m[2] }));
  const links2 = [...html.matchAll(new RegExp(`/${eventSlug}/(\\d+)/goods_list/`, 'g'))]
    .map(m => ({ path: `/${eventSlug}/${m[1]}/goods_list/`, round: m[1] }));

  return [...new Map([...links1, ...links2].map(l => [l.round, l])).values()];
}

// ── Step 5: Scrape goods_list page ──

async function scrapeGoodsList(path, cookieStr) {
  const res = await fetch(`${FORTUNE_BASE}${path}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Cookie': cookieStr,
    },
  });
  if (!res.ok) throw new Error(`goods_list fetch failed: ${res.status}`);

  const html = await res.text();
  const cells = [];
  const dateRegex = /(\d{4})年(\d{1,2})月(\d{1,2})日/;
  const sections = html.split(/<button class="tglHook js_tglHook" type="button">/);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const dateMatch = section.match(dateRegex);
    if (!dateMatch) continue;

    const date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    const rowRegex = /<th class="rowHead">(.*?)<\/th>([\s\S]*?)(?=<\/tr>)/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(section)) !== null) {
      const memberName = rowMatch[1].replace(/[\s\u3000]+/g, '').replace(/&nbsp;/g, '').trim();
      const cellsHtml = rowMatch[2];
      const cellParts = cellsHtml.split(/<\/td>/);
      let slotNumber = 0;
      for (const cell of cellParts) {
        if (!cell.includes('<td')) continue;
        slotNumber++;
        if (cell.includes('SOLD OUT')) {
          cells.push({ date, slot: slotNumber, member: memberName });
        }
      }
    }
  }
  return cells;
}

// ── Step 6: Send to API ──

async function importToApi(eventSlug, roundNumber, roundLabel, cells) {
  const res = await fetch(`${API_BASE}/api/miguri/soldout-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-miguri-sync-secret': syncSecret,
    },
    body: JSON.stringify({ eventSlug, roundNumber, roundLabel, cells }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Import failed: ${data.error}`);
  return data.data;
}

// ── Step 7: Generate image and push to QQ ──

const NAPCAT_URL = process.env.NAPCAT_URL || 'http://127.0.0.1:3002';
const NAPCAT_TOKEN = process.env.NAPCAT_TOKEN || '';
const PUSH_GROUP_ID = process.env.PUSH_GROUP_ID || '768670254';

function groupHashtag(group) {
  if (group === 'sakurazaka') return '#櫻坂46#';
  if (group === 'hinatazaka') return '#日向坂46#';
  if (group === 'nogizaka') return '#乃木坂46#';
  return '#坂道#';
}

async function generateAndPush(eventSlug, group, resultRound, importResult) {
  const { generateSoldOutImage } = await import('./soldout-image-gen.mjs');
  const { publishToWeibo, isWeiboEnabled } = await import('./weibo-publisher.mjs');

  console.log(`[${ts()}]   Generating images...`);
  const [soldoutImg, generationImg] = await Promise.all([
    generateSoldOutImage(eventSlug, group, 'soldout'),
    generateSoldOutImage(eventSlug, group, 'generation'),
  ]);
  const soldoutBase64 = soldoutImg.toString('base64');
  const generationBase64 = generationImg.toString('base64');
  console.log(
    `[${ts()}]   Images generated (soldout=${Math.round(soldoutImg.length / 1024)}KB, generation=${Math.round(generationImg.length / 1024)}KB)`,
  );

  // Send to QQ group via NapCat
  const message = [
    { type: 'text', data: { text: `【${resultRound}次完売更新】\n${eventSlug}\n新增 ${importResult.newCells} 枠完売 (合計 ${importResult.totalCells})\n` } },
    { type: 'image', data: { file: `base64://${soldoutBase64}` } },
    { type: 'image', data: { file: `base64://${generationBase64}` } },
  ];

  const groups = PUSH_GROUP_ID.split(',');
  for (const groupId of groups) {
    const res = await fetch(`${NAPCAT_URL}/send_group_msg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(NAPCAT_TOKEN ? { Authorization: `Bearer ${NAPCAT_TOKEN}` } : {}),
      },
      body: JSON.stringify({ group_id: Number(groupId), message }),
    });
    if (res.ok) {
      console.log(`[${ts()}]   ✅ Pushed to QQ group ${groupId}`);
    } else {
      console.error(`[${ts()}]   ❌ Push to ${groupId} failed: ${res.status}`);
    }
  }

  if (isWeiboEnabled()) {
    const text = [
      `【個別ミーグリ完売更新】`,
      eventSlug,
      `${resultRound}次結果：新增 ${importResult.newCells} 枠完売、合計 ${importResult.totalCells} 枠`,
      '',
      `${groupHashtag(group)} #ミーグリ#`,
    ].join('\n');
    await publishToWeibo({
      text,
      category: 'miguri_individual_soldout',
      images: [
        { filename: `${eventSlug}-soldout.png`, contentType: 'image/png', base64: soldoutBase64 },
        { filename: `${eventSlug}-generation.png`, contentType: 'image/png', base64: generationBase64 },
      ],
      meta: { eventSlug, group, resultRound, importResult },
    });
    console.log(`[${ts()}]   ✅ Queued Weibo publish`);
  }
}

// ── Main ──

async function main() {
  console.log(`\n[${ts()}] === Fortune Music Soldout Watcher ===`);

  // 1. Get active events
  const events = await getActiveEvents();
  if (events.length === 0) {
    console.log(`[${ts()}] No active events found.`);
    return;
  }
  console.log(`[${ts()}] Active events: ${events.map(e => e.slug).join(', ')}`);

  // 2. Login to Fortune Music
  console.log(`[${ts()}] Logging in to Fortune Music...`);
  let cookieStr;
  try {
    cookieStr = await fortuneLogin();
    console.log(`[${ts()}] ✅ Login successful`);
  } catch (e) {
    console.error(`[${ts()}] ❌ Login failed: ${e.message}`);
    return;
  }

  // 3. Check each event
  for (const event of events) {
    console.log(`\n[${ts()}] Checking ${event.slug}...`);

    try {
      // Get existing DB rounds
      const dbRounds = await getExistingRounds(event.slug);
      console.log(`[${ts()}]   DB rounds: ${dbRounds.length > 0 ? dbRounds.join(', ') : 'none'}`);

      // Get Fortune Music available rounds
      const fmRounds = await getFortuneRounds(event.slug, cookieStr);
      if (fmRounds.length === 0) {
        console.log(`[${ts()}]   No goods_list available (not in reception period)`);
        continue;
      }
      console.log(`[${ts()}]   FM rounds available: ${fmRounds.map(r => r.round).join(', ')}`);

      // Scrape the latest round's goods_list (always the most recent data)
      const latestFmRound = fmRounds[fmRounds.length - 1];
      console.log(`[${ts()}]   Scraping round ${latestFmRound.round}: ${latestFmRound.path}`);

      const cells = await scrapeGoodsList(latestFmRound.path, cookieStr);
      console.log(`[${ts()}]   Found ${cells.length} sold-out cells`);

      if (cells.length === 0) {
        console.log(`[${ts()}]   No sold-out data yet.`);
        continue;
      }

      // FM round N = 第N次受付 = shows (N-1)次抽選結果
      const resultRound = Number(latestFmRound.round) - 1;
      const roundLabel = `${resultRound}次結果`;
      const result = await importToApi(event.slug, resultRound, roundLabel, cells);

      if (result.newCells === 0) {
        console.log(`[${ts()}]   No new cells (data unchanged)`);
      } else {
        console.log(`[${ts()}]   ✅ Imported: round=${result.roundNumber}, new=${result.newCells}, total=${result.totalCells}`);
        // Generate image and push to QQ
        try {
          await generateAndPush(event.slug, event.group, resultRound, result);
        } catch (pushErr) {
          console.error(`[${ts()}]   ⚠️ Push failed: ${pushErr.message}`);
        }
      }
    } catch (e) {
      console.error(`[${ts()}]   ❌ Error: ${e.message}`);
    }
  }

  console.log(`\n[${ts()}] === Done ===`);
}

main().catch(e => {
  console.error(`[${ts()}] Fatal error: ${e.message}`);
  process.exit(1);
});
