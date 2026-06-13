/**
 * Fortune Music 完售データ抽出スクリプト
 *
 * 使い方:
 * 1. Fortune Music の申込ページ (例: https://fortunemusic.jp/sakurazaka_202606/) を開く
 * 2. 該当日程のタブをクリックして表示
 * 3. ブラウザの DevTools Console (F12 → Console) にこのスクリプトを貼り付けて実行
 * 4. 全日程を自動で巡回して完売セルを収集→APIへ送信
 *
 * 前提: 46log.com にログイン済みであること (Cookie に access_token が必要)
 */
(async () => {
  const API = 'https://api.46log.com/api/miguri/soldout-import';

  // Extract event slug from URL
  const slug = location.pathname.replace(/\//g, '').trim();
  if (!slug) { alert('イベントslugが取得できません'); return; }

  console.log(`[完売抽出] イベント: ${slug}`);

  // Find all date tabs
  const dateTabs = document.querySelectorAll('.dateTab, [class*="date-tab"], .date_tab, [data-date]');
  let dates = [];

  if (dateTabs.length > 0) {
    dates = Array.from(dateTabs).map(tab => {
      const dateAttr = tab.getAttribute('data-date') || tab.textContent.trim();
      return { element: tab, raw: dateAttr };
    });
  }

  // Try to find date from page content if no tabs found
  if (dates.length === 0) {
    // Fallback: look for date headers in the table
    const headers = document.querySelectorAll('th, .event-date, [class*="date"]');
    console.log('[完売抽出] 日付タブが見つかりません。ページの表データを直接抽出します。');
    dates = [{ element: null, raw: 'current' }];
  }

  const allCells = [];

  // Helper: extract sold-out data from current page view
  function extractCurrentPage() {
    const cells = [];

    // Find the date from the page
    let currentDate = '';
    const dateEl = document.querySelector('.active[data-date], .dateTab.active, [class*="date"][class*="active"]');
    if (dateEl) {
      currentDate = dateEl.getAttribute('data-date') || '';
    }

    if (!currentDate) {
      // Try to find date from visible header/text
      const dateMatch = document.body.innerText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (dateMatch) {
        currentDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
      }
    }

    // Find all table rows with member data
    const rows = document.querySelectorAll('tr, .member-row, [class*="member"]');
    rows.forEach(row => {
      const tds = row.querySelectorAll('td, [class*="slot"]');
      if (tds.length < 2) return;

      // First cell is usually the member name
      const nameCell = tds[0] || row.querySelector('.member-name, [class*="name"]');
      if (!nameCell) return;
      const memberName = nameCell.textContent.replace(/\s+/g, '').trim();
      if (!memberName || memberName.includes('メンバー')) return;

      // Remaining cells are slots
      for (let i = 1; i < tds.length; i++) {
        const cellText = tds[i].textContent.trim().toUpperCase();
        const isSoldOut = cellText.includes('SOLD') || cellText.includes('売切') || cellText.includes('完売');
        if (isSoldOut) {
          cells.push({
            date: currentDate,
            slot: i,
            member: memberName,
          });
        }
      }
    });

    return cells;
  }

  // If date tabs exist, click each one and extract
  if (dates.length > 0 && dates[0].element) {
    for (const dateInfo of dates) {
      console.log(`[完売抽出] 日付切替: ${dateInfo.raw}`);
      dateInfo.element.click();
      await new Promise(r => setTimeout(r, 1500)); // Wait for page update
      const cells = extractCurrentPage();
      allCells.push(...cells);
      console.log(`  → ${cells.length} 件の完売セルを検出`);
    }
  } else {
    // Single page extraction
    const cells = extractCurrentPage();
    allCells.push(...cells);
  }

  // Filter valid cells
  const validCells = allCells.filter(c => c.date && c.slot > 0 && c.member);

  console.log(`[完売抽出] 合計: ${validCells.length} 件の完売セル`);
  console.log(JSON.stringify(validCells, null, 2));

  if (validCells.length === 0) {
    console.log('[完売抽出] 完売データが見つかりません。手動でデータを確認してください。');
    console.log('手動送信例:');
    console.log(`
fetch('${API}', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventSlug: '${slug}',
    roundLabel: '第3次受付後',
    cells: [
      { date: '2026-06-14', slot: 1, member: '山下瞳月' },
      { date: '2026-06-14', slot: 2, member: '山下瞳月' },
      // ... 全完売セルを列挙
    ]
  })
}).then(r => r.json()).then(console.log);
    `);
    return;
  }

  // Send to API
  if (confirm(`${validCells.length} 件の完売セルを送信しますか？`)) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventSlug: slug,
          cells: validCells,
        }),
      });
      const json = await res.json();
      console.log('[完売抽出] API応答:', json);
      alert(`完了！ラウンド${json.data?.roundNumber}: 新規${json.data?.newCells}件 / 合計${json.data?.totalCells}件`);
    } catch (err) {
      console.error('[完売抽出] API送信エラー:', err);
      alert('送信エラー: ' + err.message);
    }
  }
})();
