(() => {
  const RETURN_ORIGIN = '__MIGURI_RETURN_ORIGIN__';
  const HANDOFF_PREFIX = 'MIGURI46LOG1:';
  const MUSIC_HOST = 'fortunemusic.jp';
  const MEETS_HOST = 'ticket.fortunemeets.app';
  const GROUPS = [
    ['nogizaka46', 'nogizaka'],
    ['sakurazaka46', 'sakurazaka'],
    ['hinatazaka46', 'hinatazaka'],
  ];
  const EXCLUDED_SLUGS = new Set(['contact', 'm', 'page', 'default', 'faq', 'guide']);
  const hostMatches = (hostname, domain) => hostname === domain || hostname.endsWith(`.${domain}`);
  const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
  const parseHtml = (html) => new DOMParser().parseFromString(html, 'text/html');
  const compact = (value) => `${value || ''}`.replace(/[\s\u3000]+/g, ' ').trim();
  const digits = (value) => `${value || ''}`.replace(/[０-９]/g, (char) => (
    String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
  ));
  const count = (value, unit) => {
    const match = digits(value).replace(/,/g, '').match(new RegExp(`(\\d+)\\s*${unit}`));
    return match ? Number(match[1]) : 0;
  };
  const groupFromText = (value) => {
    if (/乃木坂46/.test(value)) return 'nogizaka';
    if (/櫻坂46/.test(value)) return 'sakurazaka';
    if (/日向坂46/.test(value)) return 'hinatazaka';
    return null;
  };
  const categoryFromHeading = (value) => {
    const normalized = compact(value).replace(/\s/g, '');
    if (/サイン会[」』）)】]*$/.test(normalized)) return 'サイン会';
    if (/リアルミート/.test(normalized)) return 'リアミ';
    return 'その他';
  };
  const isoDateFromText = (value) => {
    const match = digits(value).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    return match
      ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
      : '';
  };
  const inferMusicDate = (monthDay, appliedAt) => {
    const dateMatch = digits(monthDay).match(/(\d{1,2})\/(\d{1,2})/);
    const appliedMatch = digits(appliedAt).match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
    if (!dateMatch || !appliedMatch) return '';
    const eventMonth = Number(dateMatch[1]);
    const eventDay = Number(dateMatch[2]);
    const appliedMonth = Number(appliedMatch[2]);
    const appliedDay = Number(appliedMatch[3]);
    const year = Number(appliedMatch[1])
      + (eventMonth * 100 + eventDay < appliedMonth * 100 + appliedDay ? 1 : 0);
    return `${year}-${`${eventMonth}`.padStart(2, '0')}-${`${eventDay}`.padStart(2, '0')}`;
  };
  const hash = (value) => {
    let first = 2166136261;
    let second = 2246822519;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 3266489917);
    }
    return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
  };
  const sourceKey = (...parts) => hash(parts.map(compact).join('|'));

  let overlay;
  const show = (title, detail = '') => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(8,10,18,.78);font:400 16px/1.55 system-ui,-apple-system,sans-serif;color:#f8fafc';
      overlay.innerHTML = '<div style="width:min(88vw,440px);padding:28px;border:1px solid rgba(255,255,255,.13);border-radius:20px;background:#111827;box-shadow:0 24px 80px rgba(0,0,0,.45)"><div data-title style="font-size:21px;font-weight:750"></div><div data-detail style="margin-top:10px;color:#cbd5e1"></div></div>';
      document.body.appendChild(overlay);
    }
    overlay.querySelector('[data-title]').textContent = title;
    overlay.querySelector('[data-detail]').textContent = detail;
  };
  const fail = (message) => {
    show('导入未完成', message);
  };
  const requestText = async (url) => {
    const response = await fetch(url, { credentials: 'include' });
    if (response.status === 403 || response.status === 429) {
      throw new Error('官方站点暂时限制了请求，请等待约 30 分钟后重试。');
    }
    if (!response.ok) throw new Error(`页面读取失败（${response.status}）`);
    await sleep(450);
    return response.text();
  };
  const finish = (source, next, records) => {
    if (records.length === 0) {
      fail('没有找到可以保存的应募履历。请确认账号已登录且账号内已有记录。');
      return;
    }
    window.name = `${HANDOFF_PREFIX}${JSON.stringify({
      version: 1,
      source,
      next,
      records,
    })}`;
    location.assign(`${RETURN_ORIGIN}/miguri?import=${source}`);
  };

  const parseMusicList = (documentNode) => {
    const applications = [];
    documentNode.querySelectorAll('div.tblHist table tbody tr').forEach((row) => {
      const link = row.querySelector('td:first-child a[href*="/mypage/apply_detail/"]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      const id = href.match(/apply_detail\/(\d+)/)?.[1] || hash(href);
      const drawText = Array.from(row.querySelectorAll('td.tdDraw'))
        .map((cell) => compact(cell.textContent))
        .join(' ');
      applications.push({
        id,
        href,
        appliedAt: compact(row.querySelectorAll('td')[1]?.textContent),
        title: compact(row.querySelector('td.tdEvent')?.textContent),
        pending: /待ち/.test(drawText),
      });
    });
    return applications;
  };
  const parseMusicDetail = (html, application) => {
    const documentNode = parseHtml(html);
    const table = Array.from(documentNode.querySelectorAll('table')).find((candidate) => (
      Array.from(candidate.querySelectorAll('thead th')).some((header) => /当選数/.test(header.textContent || ''))
    ));
    if (!table) return [];

    const invalid = /失効|手続き期限切れ|当選は無効/.test(documentNode.body?.textContent || '');
    const records = [];
    table.querySelectorAll('tbody tr').forEach((row) => {
      const cells = row.querySelectorAll('td');
      const quantities = row.querySelectorAll('td.tdQua');
      if (cells.length < 2 || quantities.length < 2) return;
      const item = compact(cells[0]?.textContent).replace(/^商品名/, '');
      const parsed = item.match(/^(.*?)【\s*(\d{1,2}\/\d{1,2})\s*第([0-9０-９]+)部\s*】/);
      if (!parsed) return;

      const member = compact(parsed[1]).replace(/[\s\u3000]+/g, '');
      const date = inferMusicDate(parsed[2], application.appliedAt);
      const slot = Number(digits(parsed[3]));
      const appliedTickets = count(quantities[0]?.textContent, '個');
      const wonTickets = invalid ? 0 : count(quantities[1]?.textContent, '個');
      if (!member || !date || appliedTickets <= 0) return;

      records.push({
        source: 'fortunemusic',
        sourceKey: sourceKey(application.id, member, date, slot),
        category: '個別ミーグリ',
        member,
        date,
        slot,
        appliedTickets,
        wonTickets,
        paidTickets: 0,
        eventSlug: '',
        title: application.title || item,
        venue: '',
        group: groupFromText(application.title || item),
        resultStatus: application.pending ? 'pending' : wonTickets > 0 ? 'won' : 'lost',
      });
    });
    return records;
  };
  const importMusic = async () => {
    if (!location.pathname.startsWith('/mypage/apply_list')) {
      location.assign('https://fortunemusic.jp/mypage/apply_list/');
      return;
    }

    show('forTUNE music を读取中', '正在确认登录状态与申请列表…');
    let html = await requestText('/mypage/apply_list/');
    if (/type=["']password["']/i.test(html) || (/ログイン/.test(html) && !/apply_detail/.test(html))) {
      location.assign('https://fortunemusic.jp/mypage/apply_list/');
      return;
    }

    const applications = new Map();
    let page = 1;
    let nextUrl = '/mypage/apply_list/';
    while (nextUrl && page <= 100) {
      const documentNode = parseHtml(html);
      parseMusicList(documentNode).forEach((application) => applications.set(application.id, application));
      nextUrl = documentNode.querySelector('.pagiNation01 .pageNext a')?.getAttribute('href') || '';
      if (!nextUrl) break;
      page += 1;
      show('forTUNE music を读取中', `申请列表第 ${page} 页`);
      html = await requestText(nextUrl);
    }

    const applicationList = Array.from(applications.values());
    const records = [];
    for (let index = 0; index < applicationList.length; index += 1) {
      const application = applicationList[index];
      show('forTUNE music を读取中', `申请详情 ${index + 1} / ${applicationList.length}`);
      const detailHtml = await requestText(application.href);
      records.push(...parseMusicDetail(detailHtml, application));
    }
    finish('fortunemusic', 'meets', records);
  };

  const loadFrame = (url, ready, timeoutTicks = 35) => new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:7000px';
    frame.src = url;
    document.body.appendChild(frame);
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      let documentNode = null;
      let bodyText = '';
      try {
        documentNode = frame.contentDocument;
        bodyText = documentNode?.body?.innerText || '';
      } catch {
        documentNode = null;
      }
      if ((documentNode && ready(bodyText, documentNode)) || tick >= timeoutTicks) {
        clearInterval(timer);
        resolve({ frame, documentNode, bodyText });
      }
    }, 400);
  });
  const campaignSlugs = async (group) => {
    const loaded = await loadFrame(
      `https://${MEETS_HOST}/${group}/`,
      (_text, documentNode) => documentNode.querySelectorAll(`a[href*="/${group}/"]`).length > 0,
    );
    const slugs = loaded.documentNode
      ? Array.from(loaded.documentNode.querySelectorAll(`a[href*="/${group}/"]`))
        .map((link) => (link.getAttribute('href') || '').match(new RegExp(`/${group}/([^/?#]+)`))?.[1])
        .filter((slug) => slug && !EXCLUDED_SLUGS.has(slug))
      : [];
    loaded.frame.remove();
    return Array.from(new Set(slugs));
  };
  const expandHistory = async (frame) => {
    let stable = 0;
    let previousCount = -1;
    for (let tick = 0; tick < 40; tick += 1) {
      const documentNode = frame.contentDocument;
      const buttons = Array.from(documentNode?.querySelectorAll('a,button') || [])
        .filter((button) => /全て表示|もっと見る/.test(button.textContent || ''));
      buttons.forEach((button) => button.click());
      const currentCount = documentNode?.querySelectorAll('.resultWrap').length || 0;
      if (buttons.length === 0 && currentCount === previousCount) stable += 1;
      else stable = 0;
      if (stable >= 3) return;
      previousCount = currentCount;
      await sleep(400);
    }
  };
  const parseMeetsHistory = (documentNode, groupSlug, group, campaignSlug) => {
    const records = new Map();
    let category = 'その他';
    let heading = '';
    const title = compact(documentNode.title);

    documentNode.querySelectorAll('h5.awardItemHeading, .resultWrap').forEach((node) => {
      if (node.matches('h5.awardItemHeading')) {
        heading = compact(node.textContent);
        category = categoryFromHeading(heading);
        return;
      }

      const statusText = compact(node.querySelector('.tag')?.textContent);
      const lines = Array.from(node.querySelectorAll('.result-body p')).map((item) => compact(item.textContent));
      const dateLine = lines.find((line) => /\d{4}年/.test(line)) || '';
      const slotLine = lines.find((line) => /第[0-9０-９]+部/.test(line)) || '';
      const member = compact(lines.find((line) => line !== dateLine && line !== slotLine) || '')
        .replace(/[\s\u3000]+/g, '');
      const date = isoDateFromText(dateLine);
      const slot = Number(digits(slotLine).match(/第(\d+)部/)?.[1] || 0);
      const quantityText = node.querySelector('.flex-shrink-0')?.textContent || '';
      const quantity = count(quantityText, '枚');
      const lots = count(quantityText, '口');
      const appliedTickets = category === 'サイン会' ? (lots || quantity) : (quantity || lots);
      const won = /当選/.test(statusText) && !/落選/.test(statusText);
      const lost = /落選/.test(statusText);
      const venue = compact(dateLine.includes('＠') ? dateLine.split('＠').slice(1).join('＠') : '');
      if (!member || !date || appliedTickets <= 0) return;

      const naturalKey = [campaignSlug, heading, member, date, slot].map(compact).join('|');
      const previous = records.get(naturalKey);
      const record = previous || {
        source: 'fortunemeets',
        sourceKey: sourceKey(groupSlug, naturalKey),
        category,
        member,
        date,
        slot,
        appliedTickets: 0,
        wonTickets: 0,
        paidTickets: 0,
        eventSlug: '',
        title: [title, heading].filter(Boolean).join('｜'),
        venue,
        group,
        resultStatus: won ? 'won' : lost ? 'lost' : 'pending',
      };
      record.appliedTickets += appliedTickets;
      if (won) {
        record.wonTickets += appliedTickets;
        record.resultStatus = 'won';
      } else if (!lost && record.resultStatus !== 'won') {
        record.resultStatus = 'pending';
      }
      records.set(naturalKey, record);
    });
    return Array.from(records.values());
  };
  const loadCampaignHistory = async (groupSlug, group, campaignSlug) => {
    await sleep(450);
    const url = `https://${MEETS_HOST}/${groupSlug}/${campaignSlug}#/history`;
    const loaded = await loadFrame(
      url,
      (text, documentNode) => (
        documentNode.querySelectorAll('.resultWrap').length > 0
        || /応募履歴はありません|登録履歴はありません/.test(text)
        || /アカウントをお持ちでない方はこちら|再度ログイン/.test(text)
      ),
    );
    const loginRequired = /アカウントをお持ちでない方はこちら|再度ログイン/.test(loaded.bodyText)
      && !loaded.documentNode?.querySelector('.resultWrap');
    if (loginRequired) {
      loaded.frame.remove();
      return { loginUrl: url, records: [] };
    }
    await expandHistory(loaded.frame);
    const records = loaded.documentNode
      ? parseMeetsHistory(loaded.documentNode, groupSlug, group, campaignSlug)
      : [];
    loaded.frame.remove();
    return { loginUrl: '', records };
  };
  const importMeets = async () => {
    if (location.hostname !== MEETS_HOST) {
      location.assign(`https://${MEETS_HOST}/hinatazaka46/`);
      return;
    }

    show('forTUNE meets を读取中', '正在查找乃木坂、櫻坂、日向坂的活动履历…');
    const campaigns = [];
    for (const [groupSlug, group] of GROUPS) {
      const slugs = await campaignSlugs(groupSlug);
      slugs.forEach((campaignSlug) => campaigns.push({ groupSlug, group, campaignSlug }));
    }
    if (campaigns.length === 0) {
      fail('无法读取活动列表。请确认页面已加载完成后再次点击书签。');
      return;
    }

    const first = await loadCampaignHistory(
      campaigns[0].groupSlug,
      campaigns[0].group,
      campaigns[0].campaignSlug,
    );
    if (first.loginUrl) {
      location.assign(first.loginUrl);
      return;
    }

    const records = [...first.records];
    for (let index = 1; index < campaigns.length; index += 1) {
      const campaign = campaigns[index];
      show('forTUNE meets を读取中', `活动履历 ${index + 1} / ${campaigns.length}`);
      const result = await loadCampaignHistory(
        campaign.groupSlug,
        campaign.group,
        campaign.campaignSlug,
      );
      if (result.loginUrl) {
        location.assign(result.loginUrl);
        return;
      }
      records.push(...result.records);
    }
    finish('fortunemeets', 'done', records);
  };

  const run = async () => {
    try {
      if (hostMatches(location.hostname, MUSIC_HOST)) {
        await importMusic();
        return;
      }
      if (hostMatches(location.hostname, 'fortunemeets.app')) {
        await importMeets();
        return;
      }
      location.assign('https://fortunemusic.jp/mypage/apply_list/');
    } catch (error) {
      fail(error instanceof Error ? error.message : '读取失败，请稍后重试。');
    }
  };

  void run();
})();
