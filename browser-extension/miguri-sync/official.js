(async () => {
  const MUSIC_HOST = "fortunemusic.jp";
  const MEETS_HOST = "ticket.fortunemeets.app";
  const GROUPS = [
    ["nogizaka46", "nogizaka", "乃木坂46"],
    ["sakurazaka46", "sakurazaka", "櫻坂46"],
    ["hinatazaka46", "hinatazaka", "日向坂46"],
  ];
  const EXCLUDED_SLUGS = new Set([
    "contact",
    "m",
    "page",
    "default",
    "faq",
    "guide",
  ]);
  const compact = (value) =>
    `${value || ""}`.replace(/[\s\u3000]+/g, " ").trim();
  const digits = (value) =>
    `${value || ""}`.replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    );
  const sleep = (duration) =>
    new Promise((resolve) => setTimeout(resolve, duration));
  const parseHtml = (html) =>
    new DOMParser().parseFromString(html, "text/html");
  const sourceSyncedAt = new Date().toISOString();
  const count = (value, unit) => {
    const match = digits(value)
      .replace(/,/g, "")
      .match(new RegExp(`(\\d+)\\s*${unit}`));
    return match ? Number(match[1]) : 0;
  };
  const yen = (value) => {
    const match = digits(value)
      .replace(/,/g, "")
      .match(/(\d+)\s*円/);
    return match ? Number(match[1]) : 0;
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
  const sourceKey = (...parts) => hash(parts.map(compact).join("|"));
  const groupFromText = (value) => {
    if (/乃木坂46/.test(value)) return "nogizaka";
    if (/櫻坂46/.test(value)) return "sakurazaka";
    if (/日向坂46/.test(value)) return "hinatazaka";
    return null;
  };
  const categoryFromHeading = (value) => {
    const normalized = compact(value).replace(/\s/g, "");
    if (/サイン会[」』）)】]*$/.test(normalized)) return "サイン会";
    if (/リアルミート/.test(normalized)) return "リアミ";
    if (/オンラインミート/.test(normalized)) return "全国ミーグリ";
    return "その他";
  };
  const isoDateFromText = (value) => {
    const match = digits(value).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    return match
      ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
      : "";
  };
  const inferMusicDate = (monthDay, appliedAt) => {
    const dateMatch = digits(monthDay).match(/(\d{1,2})\/(\d{1,2})/);
    const appliedMatch = digits(appliedAt).match(
      /(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})/,
    );
    if (!dateMatch || !appliedMatch) return "";
    const month = Number(dateMatch[1]);
    const day = Number(dateMatch[2]);
    const appliedMonth = Number(appliedMatch[2]);
    const appliedDay = Number(appliedMatch[3]);
    const year =
      Number(appliedMatch[1]) +
      (month * 100 + day < appliedMonth * 100 + appliedDay ? 1 : 0);
    return `${year}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
  };
  const applicationRound = (value) =>
    compact(value).match(/第[0-9０-９]+次/)?.[0] || "";

  const jobResponse = await chrome.runtime.sendMessage({
    type: "MIGURI46LOG_GET_JOB",
  });
  const job = jobResponse?.job;
  if (!job) return;
  const onMusic = location.hostname === MUSIC_HOST;
  if ((job.source === "fortunemusic") !== onMusic) return;

  let panel;
  const show = (title, detail = "") => {
    if (!panel) {
      panel = document.createElement("aside");
      panel.setAttribute("aria-live", "polite");
      panel.style.cssText =
        "position:fixed;z-index:2147483647;right:18px;top:18px;width:min(360px,calc(100vw - 36px));padding:16px 18px;border:1px solid rgba(99,102,241,.24);border-radius:16px;background:#fff;color:#172033;box-shadow:0 18px 50px rgba(15,23,42,.18);font:400 14px/1.5 system-ui,-apple-system,sans-serif";
      panel.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;color:#4f46e5;font-size:12px;font-weight:750;letter-spacing:.08em">46LOG 咪咕力同步</div><strong data-title style="display:block;margin-top:7px;font-size:16px"></strong><span data-detail style="display:block;margin-top:3px;color:#64748b"></span>';
      document.documentElement.appendChild(panel);
    }
    panel.querySelector("[data-title]").textContent = title;
    panel.querySelector("[data-detail]").textContent = detail;
    chrome.runtime
      .sendMessage({ type: "MIGURI46LOG_PROGRESS", title, detail })
      .catch(() => {});
  };
  const requireLogin = async () => {
    show("等待官方登录", "登录完成后，扩展会自动继续同步。");
    await chrome.runtime
      .sendMessage({
        type: "MIGURI46LOG_LOGIN_REQUIRED",
        jobId: job.id,
      })
      .catch(() => {});
  };
  const finish = async (records) => {
    if (records.length === 0) {
      if (job.auto || job.source === "fortunemeets") {
        show(
          job.source === "fortunemeets" ? "三坂没有找到履历" : "没有找到履历",
          job.source === "fortunemeets"
            ? "已检查乃木坂、櫻坂与日向坂，请确认 Meets 登录状态。"
            : "本次没有发现新的应募记录。",
        );
        await chrome.runtime.sendMessage({
          type: "MIGURI46LOG_RESULT",
          jobId: job.id,
          records: [],
        });
        return;
      }
      show("没有找到履历", "确认当前账号已有应募记录后，可回到 46log 重试。");
      return;
    }
    show(
      job.source === "fortunemeets" ? "三坂读取完成" : "同步完成",
      `正在把 ${records.length} 条履历带回 46log…`,
    );
    await chrome.runtime.sendMessage({
      type: "MIGURI46LOG_RESULT",
      jobId: job.id,
      records,
    });
  };
  const requestText = async (url) => {
    const response = await fetch(url, { credentials: "include" });
    if (response.status === 403 || response.status === 429) {
      throw new Error("官方站点暂时限制了请求，请稍后重试。");
    }
    if (!response.ok) throw new Error(`页面读取失败（${response.status}）`);
    await sleep(450);
    return response.text();
  };

  const parseMusicList = (documentNode) => {
    const applications = [];
    documentNode
      .querySelectorAll("div.tblHist table tbody tr")
      .forEach((row) => {
        const link = row.querySelector(
          'td:first-child a[href*="/mypage/apply_detail/"]',
        );
        if (!link) return;
        const href = link.getAttribute("href") || "";
        const id = href.match(/apply_detail\/(\d+)/)?.[1] || hash(href);
        const drawText = Array.from(row.querySelectorAll("td.tdDraw"))
          .map((cell) => compact(cell.textContent))
          .join(" ");
        applications.push({
          id,
          href,
          appliedAt: compact(row.querySelectorAll("td")[1]?.textContent),
          title: compact(row.querySelector("td.tdEvent")?.textContent),
          pending: /待ち/.test(drawText),
        });
      });
    return applications;
  };
  const parseMusicDetail = (html, application) => {
    const documentNode = parseHtml(html);
    const table = Array.from(documentNode.querySelectorAll("table")).find(
      (candidate) =>
        Array.from(candidate.querySelectorAll("thead th")).some((header) =>
          /当選数/.test(header.textContent || ""),
        ),
    );
    if (!table) return [];
    const invalid = /失効|手続き期限切れ|当選は無効/.test(
      documentNode.body?.textContent || "",
    );
    const records = [];
    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      const quantities = row.querySelectorAll("td.tdQua");
      if (cells.length < 2 || quantities.length < 2) return;
      const item = compact(cells[0]?.textContent).replace(/^商品名/, "");
      const parsed = item.match(
        /^(.*?)【\s*(\d{1,2}\/\d{1,2})\s*第([0-9０-９]+)部\s*】/,
      );
      if (!parsed) return;
      const member = compact(parsed[1]).replace(/[\s\u3000]+/g, "");
      const date = inferMusicDate(parsed[2], application.appliedAt);
      const slot = Number(digits(parsed[3]));
      const appliedTickets = count(quantities[0]?.textContent, "個");
      const wonTickets = invalid ? 0 : count(quantities[1]?.textContent, "個");
      const unitPriceYen = invalid ? 0 : yen(cells[1]?.textContent);
      if (!member || !date || appliedTickets <= 0) return;
      records.push({
        source: "fortunemusic",
        sourceKey: sourceKey(application.id, member, date, slot),
        category: "個別ミーグリ",
        member,
        date,
        slot,
        appliedTickets,
        wonTickets,
        paidTickets: 0,
        unitPriceYen,
        spendYen: wonTickets * unitPriceYen,
        signLots: 0,
        applicationRound: applicationRound(application.title),
        sourceSyncedAt,
        eventSlug: "",
        title: application.title || item,
        venue: "",
        group: groupFromText(application.title || item),
        resultStatus: application.pending
          ? "pending"
          : wonTickets > 0
            ? "won"
            : "lost",
      });
    });
    return records;
  };
  const importMusic = async () => {
    if (document.querySelector('input[type="password"]')) {
      await requireLogin();
      return;
    }
    if (!location.pathname.startsWith("/mypage/apply_list")) {
      location.assign("https://fortunemusic.jp/mypage/apply_list/");
      return;
    }
    show("正在读取 Music", "确认账号与申请列表…");
    let html = await requestText("/mypage/apply_list/");
    if (
      /type=["']password["']/i.test(html) ||
      (/ログイン/.test(html) && !/apply_detail/.test(html))
    ) {
      await requireLogin();
      return;
    }
    const applications = new Map();
    let page = 1;
    let nextUrl = "/mypage/apply_list/";
    while (nextUrl && page <= 100) {
      const documentNode = parseHtml(html);
      parseMusicList(documentNode).forEach((application) =>
        applications.set(application.id, application),
      );
      nextUrl =
        documentNode
          .querySelector(".pagiNation01 .pageNext a")
          ?.getAttribute("href") || "";
      if (!nextUrl) break;
      page += 1;
      show("正在读取 Music", `申请列表第 ${page} 页`);
      html = await requestText(nextUrl);
    }
    const list = Array.from(applications.values());
    const records = [];
    for (let index = 0; index < list.length; index += 1) {
      show("正在读取 Music", `申请详情 ${index + 1} / ${list.length}`);
      records.push(
        ...parseMusicDetail(await requestText(list[index].href), list[index]),
      );
    }
    await finish(records);
  };

  const loadFrame = (url, ready, timeoutTicks = 35) =>
    new Promise((resolve) => {
      const frame = document.createElement("iframe");
      frame.style.cssText =
        "position:fixed;left:-10000px;top:0;width:1200px;height:7000px";
      frame.src = url;
      document.body.appendChild(frame);
      let tick = 0;
      let stableTicks = 0;
      let previousLength = -1;
      const timer = setInterval(() => {
        if (document.hidden && !job.auto) return;
        tick += 1;
        let documentNode = null;
        let bodyText = "";
        try {
          documentNode = frame.contentDocument;
          bodyText = documentNode?.body?.innerText || "";
        } catch {}
        stableTicks =
          bodyText.length > 0 && bodyText.length === previousLength
            ? stableTicks + 1
            : 0;
        previousLength = bodyText.length;
        if (
          (stableTicks >= 2 && documentNode && ready(bodyText, documentNode)) ||
          tick >= timeoutTicks
        ) {
          clearInterval(timer);
          resolve({ frame, documentNode, bodyText });
        }
      }, 400);
    });
  const originalMeetsUrl = location.href;
  const setMeetsGroupPath = (groupSlug) => {
    try {
      history.replaceState(null, "", `/${groupSlug}/`);
    } catch {}
  };
  const restoreMeetsUrl = () => {
    try {
      history.replaceState(null, "", originalMeetsUrl);
    } catch {}
  };
  const campaignSlugs = async (group) => {
    setMeetsGroupPath(group);
    const loaded = await loadFrame(
      `https://${MEETS_HOST}/${group}/`,
      (text, documentNode) =>
        documentNode.querySelectorAll(`a[href*="/${group}/"]`).length > 0 ||
        /遷移したいページを選択してください/.test(text),
    );
    const slugs = loaded.documentNode
      ? Array.from(
          loaded.documentNode.querySelectorAll(`a[href*="/${group}/"]`),
        )
          .map(
            (link) =>
              (link.getAttribute("href") || "").match(
                new RegExp(`/${group}/([^/?#]+)`),
              )?.[1],
          )
          .filter((slug) => slug && !EXCLUDED_SLUGS.has(slug))
      : [];
    const temporaryLanding =
      /遷移したいページを選択してください/.test(loaded.bodyText) &&
      slugs.length === 0;
    loaded.frame.remove();
    return {
      slugs: Array.from(new Set(slugs)),
      temporaryLanding,
    };
  };
  const expandHistory = async (frame) => {
    let stable = 0;
    let previousCount = -1;
    for (let tick = 0; tick < 40; tick += 1) {
      const documentNode = frame.contentDocument;
      const buttons = Array.from(
        documentNode?.querySelectorAll("a,button") || [],
      ).filter((button) =>
        /全て表示|もっと見る/.test(button.textContent || ""),
      );
      buttons.forEach((button) => button.click());
      const currentCount =
        documentNode?.querySelectorAll(".resultWrap").length || 0;
      stable =
        buttons.length === 0 && currentCount === previousCount ? stable + 1 : 0;
      if (stable >= 3) return;
      previousCount = currentCount;
      await sleep(400);
    }
  };
  const parseMeetsHistory = (documentNode, groupSlug, group, campaignSlug) => {
    const records = new Map();
    let category = "その他";
    let heading = "";
    const title = compact(documentNode.title);
    const bodyText = compact(documentNode.body?.textContent);
    const explicitPrices = Array.from(
      bodyText.matchAll(
        /(?:販売価格|商品価格|税込)[^\d]{0,18}(\d{1,3}(?:,\d{3})+)\s*円|(\d{1,3}(?:,\d{3})+)\s*円(?:\s*税込)/g,
      ),
    )
      .map((match) => Number((match[1] || match[2] || "").replace(/,/g, "")))
      .filter((value) => value >= 1_000 && value <= 30_000);
    const explicitPrice =
      explicitPrices.length > 0 ? Math.min(...explicitPrices) : 0;
    const latestYear = Math.max(
      0,
      ...Array.from(bodyText.matchAll(/(20\d{2})年/g)).map((match) =>
        Number(match[1]),
      ),
    );
    const unitPriceYen =
      explicitPrice ||
      (/album/i.test(campaignSlug) || latestYear < 2024 ? 0 : 2_000);
    const registeredSerials = new Set();
    documentNode.querySelectorAll("p.date").forEach((node) => {
      if (!/登録：/.test(node.textContent || "")) return;
      const serial = compact(
        node.parentElement?.querySelector("p.heading.bold")?.textContent,
      )
        .split("#")[0]
        .trim();
      if (/^[0-9A-Za-z]{8,}$/.test(serial)) registeredSerials.add(serial);
    });
    documentNode
      .querySelectorAll("h5.awardItemHeading, .resultWrap")
      .forEach((node) => {
        if (node.matches("h5.awardItemHeading")) {
          heading = compact(node.textContent);
          category = categoryFromHeading(heading);
          return;
        }
        const statusText = compact(node.querySelector(".tag")?.textContent);
        const lines = Array.from(node.querySelectorAll(".result-body p")).map(
          (item) => compact(item.textContent),
        );
        const dateLine = lines.find((line) => /\d{4}年/.test(line)) || "";
        const slotLine =
          lines.find((line) => /第[0-9０-９]+部/.test(line)) || "";
        const member = compact(
          lines.find((line) => line !== dateLine && line !== slotLine) || "",
        ).replace(/[\s\u3000]+/g, "");
        const date = isoDateFromText(dateLine);
        const slot = Number(digits(slotLine).match(/第(\d+)部/)?.[1] || 0);
        const quantityText =
          node.querySelector(".flex-shrink-0")?.textContent || "";
        const quantity = count(quantityText, "枚");
        const lots = count(quantityText, "口");
        const appliedTickets = quantity || lots;
        const won = /当選/.test(statusText) && !/落選/.test(statusText);
        const lost = /落選/.test(statusText);
        const venue = compact(
          dateLine.includes("＠")
            ? dateLine.split("＠").slice(1).join("＠")
            : "",
        );
        if (!member || !date || appliedTickets <= 0) return;
        const naturalKey = [campaignSlug, heading, member, date, slot]
          .map(compact)
          .join("|");
        const record = records.get(naturalKey) || {
          source: "fortunemeets",
          sourceKey: sourceKey(groupSlug, naturalKey),
          category,
          member,
          date,
          slot,
          appliedTickets: 0,
          wonTickets: 0,
          paidTickets: 0,
          unitPriceYen,
          spendYen: 0,
          signLots: 0,
          applicationRound: campaignSlug,
          sourceSyncedAt,
          eventSlug: "",
          title: [title, heading].filter(Boolean).join("｜"),
          venue,
          group,
          resultStatus: won ? "won" : lost ? "lost" : "pending",
        };
        record.appliedTickets += appliedTickets;
        record.signLots += lots;
        if (won) {
          record.wonTickets += appliedTickets;
          record.resultStatus = "won";
        } else if (!lost && record.resultStatus !== "won") {
          record.resultStatus = "pending";
        }
        records.set(naturalKey, record);
      });
    const values = Array.from(records.values());
    const countedSerials =
      registeredSerials.size ||
      values.reduce((sum, record) => sum + record.appliedTickets, 0);
    const nonMiguriApplied = values
      .filter(
        (record) =>
          record.category !== "リアミ" && record.category !== "全国ミーグリ",
      )
      .reduce((sum, record) => sum + record.appliedTickets, 0);
    const nonMiguriScale =
      nonMiguriApplied > countedSerials && nonMiguriApplied > 0
        ? countedSerials / nonMiguriApplied
        : 1;
    const remainingSerials = Math.max(0, countedSerials - nonMiguriApplied);
    const miguriRecords = values.filter(
      (record) =>
        record.category === "リアミ" || record.category === "全国ミーグリ",
    );
    const hasMiguriWinner = miguriRecords.some(
      (record) => record.wonTickets > 0,
    );
    const miguriWeight = miguriRecords.reduce(
      (sum, record) =>
        sum + (hasMiguriWinner ? record.wonTickets : record.appliedTickets),
      0,
    );
    values.forEach((record) => {
      if (record.category === "リアミ" || record.category === "全国ミーグリ") {
        const weight = hasMiguriWinner
          ? record.wonTickets
          : record.appliedTickets;
        record.spendYen =
          miguriWeight > 0
            ? Math.round(
                (weight / miguriWeight) * remainingSerials * unitPriceYen,
              )
            : 0;
      } else {
        record.spendYen = Math.round(
          record.appliedTickets * unitPriceYen * nonMiguriScale,
        );
      }
    });
    return values;
  };
  const loadCampaignHistory = async (groupSlug, group, campaignSlug) => {
    await sleep(450);
    const url = `https://${MEETS_HOST}/${groupSlug}/${campaignSlug}#/history`;
    const loaded = await loadFrame(
      url,
      (text, documentNode) =>
        documentNode.querySelectorAll(".resultWrap").length > 0 ||
        /応募履歴はありません|登録履歴はありません/.test(text) ||
        /アカウントをお持ちでない方はこちら|再度ログイン/.test(text),
    );
    const loginRequired =
      /アカウントをお持ちでない方はこちら|再度ログイン/.test(loaded.bodyText) &&
      !loaded.documentNode?.querySelector(".resultWrap");
    if (loginRequired) {
      loaded.frame.remove();
      return { loginRequired: true, records: [] };
    }
    await expandHistory(loaded.frame);
    const records = loaded.documentNode
      ? parseMeetsHistory(loaded.documentNode, groupSlug, group, campaignSlug)
      : [];
    loaded.frame.remove();
    return { loginRequired: false, records };
  };
  const mapWithConcurrency = async (items, limit, mapper) => {
    const results = new Array(items.length);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await mapper(items[index], index);
        }
      }),
    );
    return results;
  };
  const importMeets = async () => {
    show("正在连接 Meets", "准备检查乃木坂、櫻坂与日向坂…");
    const records = [];
    const temporarilyUnavailable = [];
    let discoveredCampaigns = 0;
    for (let groupIndex = 0; groupIndex < GROUPS.length; groupIndex += 1) {
      const [groupSlug, group, groupLabel] = GROUPS[groupIndex];
      show(
        `正在检查 ${groupLabel}`,
        `Meets 三坂巡检 ${groupIndex + 1} / ${GROUPS.length}`,
      );
      const discovered = await campaignSlugs(groupSlug);
      if (discovered.temporaryLanding) temporarilyUnavailable.push(groupLabel);
      discoveredCampaigns += discovered.slugs.length;
      let completedCampaigns = 0;
      const results = await mapWithConcurrency(
        discovered.slugs,
        2,
        async (campaignSlug) => {
          const result = await loadCampaignHistory(
            groupSlug,
            group,
            campaignSlug,
          );
          completedCampaigns += 1;
          show(
            `正在读取 ${groupLabel}`,
            `活动履历 ${completedCampaigns} / ${discovered.slugs.length}`,
          );
          return result;
        },
      );
      for (const result of results) {
        if (result.loginRequired) {
          restoreMeetsUrl();
          await requireLogin();
          return;
        }
        records.push(...result.records);
      }
    }
    restoreMeetsUrl();
    if (discoveredCampaigns === 0) {
      show("活动列表暂时不可用", "官方 Meets 正在切换活动入口，请稍后重试。");
      return;
    }
    if (temporarilyUnavailable.length > 0) {
      show(
        "部分团体入口临时切换",
        `${temporarilyUnavailable.join("、")} 当前由官方显示活动跳转页；其他团体已完成。`,
      );
      await sleep(1800);
    }
    await finish(records);
  };

  try {
    if (onMusic) await importMusic();
    else if (location.hostname === MEETS_HOST) await importMeets();
  } catch (error) {
    restoreMeetsUrl();
    if (job.auto) {
      await chrome.runtime
        .sendMessage({
          type: "MIGURI46LOG_JOB_ERROR",
          jobId: job.id,
          error: error instanceof Error ? error.message : "请稍后重试。",
        })
        .catch(() => {});
    }
    show(
      "同步暂时停止",
      error instanceof Error ? error.message : "请稍后重试。",
    );
  }
})();
