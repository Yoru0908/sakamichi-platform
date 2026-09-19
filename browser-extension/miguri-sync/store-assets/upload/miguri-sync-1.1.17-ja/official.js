(async () => {
  const MUSIC_HOST = "fortunemusic.jp";
  const MUSIC_UNIT_PRICE_YEN = 1_200;
  const MEETS_HOST = "ticket.fortunemeets.app";
  const MEETS_GROUPS = ["nogizaka46", "sakurazaka46", "hinatazaka46"];
  const EXCLUDED_MEETS_SLUGS = new Set([
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
  // New-site lottery contract: missing/pending is null, never implicit zero.
  const knownCount = (value) => {
    const match = digits(value).replace(/,/g, "").match(/(\d+)\s*(?:個|枚)/);
    return match ? Number(match[1]) : null;
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

  let job = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const jobResponse = await chrome.runtime.sendMessage({
      type: "MIGURI46LOG_GET_JOB",
    });
    job = jobResponse?.job || null;
    if (job) break;
    if (attempt < 3) await sleep(150);
  }
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
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "MIGURI46LOG_OFFICIAL_PROGRESS") return;
    show(message.title || "同步中", message.detail || "");
  });

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
      show(
        job.source === "fortunemeets" ? "三坂没有找到履历" : "Music 没有找到履历",
        job.source === "fortunemeets"
          ? "已检查乃木坂、櫻坂与日向坂，本次没有可保存的记录。"
          : "Music 检查完成，将继续检查 Meets。",
      );
      // Empty is still a successful source check. Deliver it so the Dashboard
      // can acknowledge the result and the extension can continue the chain.
      await chrome.runtime.sendMessage({
        type: "MIGURI46LOG_RESULT",
        jobId: job.id,
        records: [],
      });
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
    if (!table) {
      if (job.target === "saka46log" && !application.pending) throw new Error("応募結果の表を確認できません。一部だけの集計を避けるため、読み込みを停止しました。");
      return [];
    }
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
      const unitPriceYen = MUSIC_UNIT_PRICE_YEN;
      if (!member || !date || (appliedTickets <= 0 && job.target !== "saka46log")) return;
      records.push({
        source: "fortunemusic",
        sourceKey: sourceKey(application.id, member, date, slot),
        category: "個別ミーグリ",
        member,
        date,
        slot,
        appliedTickets,
        wonTickets,
        lotteryApplied: knownCount(quantities[0]?.textContent),
        lotteryWon: application.pending ? null : knownCount(quantities[1]?.textContent),
        lotteryReviewRequired: invalid,
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
    if (job.target === "saka46log" && nextUrl && page > 100) throw new Error("履歴が100ページを超えました。一部だけの合計を避けるため、手入力・CSVをご利用ください。");
    const list = Array.from(applications.values()).filter(application => job.target !== "saka46log" || groupFromText(application.title) === "sakurazaka");
    const records = [];
    for (let index = 0; index < list.length; index += 1) {
      show("正在读取 Music", `申请详情 ${index + 1} / ${list.length}`);
      records.push(
        ...parseMusicDetail(await requestText(list[index].href), list[index]),
      );
    }
    await finish(records);
  };

  const readMeetsUserId = () => {
    try {
      // Current Meets pages use userId; older sessions may only have id.
      // A present current key is authoritative, even when invalid/expired:
      // never fall back to a potentially different account's stale legacy ID.
      const current = localStorage.getItem("lscache-userId");
      const key = current !== null ? "lscache-userId" : "lscache-id";
      const raw = current !== null ? current : localStorage.getItem(key);
      if (!raw || raw.length > 1024) return "";
      const expiry = localStorage.getItem(`${key}-cacheexpiration`);
      if (expiry !== null) {
        // lscache stores expiration as integer minutes since the epoch.
        const minutes = /^\d+$/.test(expiry) ? Number(expiry) : NaN;
        if (!Number.isSafeInteger(minutes) || minutes <= Math.floor(Date.now() / 60_000)) return "";
      }
      let value;
      try { value = JSON.parse(raw); } catch { value = raw; }
      if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
      if (typeof value !== "string") return "";
      const id = value.trim();
      return id && id.length <= 512 && !/[\s\u0000-\u001f\u007f{}\[\]"]/.test(id) && !/^(?:null|undefined)$/i.test(id) ? id : "";
    } catch {
      // Storage unavailable is not proof of a usable official session.
      return "";
    }
  };
  const readMeetsAuth = () => {
    try {
      const userId = readMeetsUserId();
      if (!userId || localStorage.getItem("lscache-loggedInFlg") === "false") return null;
      const raw = localStorage.getItem("lscache-accessToken");
      const modern = localStorage.getItem("lscache-userId") !== null || raw !== null;
      if (!modern) return { authMode: "legacy", userId };
      // Match the current official frontend, not a guessed x-user-id alias.
      // This credential stays in extension memory and goes only to Meets API.
      if (!raw || raw.length > 20_000) return null;
      let accessToken;
      try { accessToken = JSON.parse(raw); } catch { accessToken = raw; }
      if (typeof accessToken !== "string" || !/^[\x21-\x7e]{1,16384}$/.test(accessToken) || /^(?:null|undefined)$/i.test(accessToken)) return null;
      const expiry = localStorage.getItem("lscache-accessToken-cacheexpiration");
      if (expiry !== null && (!/^\d+$/.test(expiry) || !Number.isSafeInteger(Number(expiry)) || Number(expiry) <= Math.floor(Date.now() / 60_000))) return null;
      return { authMode: "bearer", userId, accessToken };
    } catch { return null; }
  };
  const onMeetsGroupLanding = () =>
    location.pathname.split("/").filter(Boolean).length <= 1;
  const firstMeetsCampaignUrl = () => {
    const link = Array.from(
      document.querySelectorAll('a[href*="/nogizaka46/"]'),
    ).find((candidate) => {
      try {
        const url = new URL(candidate.href, location.href);
        return (
          url.hostname === MEETS_HOST &&
          url.pathname.split("/").filter(Boolean).length >= 2
        );
      } catch {
        return false;
      }
    });
    return link?.href || "";
  };
  const waitForMeetsLogin = async (retrySync = null) => {
    // Landing-page links and login state may appear after document_idle.
    if (onMeetsGroupLanding()) {
      const campaignUrl = firstMeetsCampaignUrl();
      if (campaignUrl) {
        location.assign(campaignUrl);
        return null;
      }
    }
    await requireLogin();
    if (job.auto) return null;
    const deadline = Date.now() + 10 * 60 * 1_000;
    while (Date.now() < deadline) {
      await sleep(retrySync ? 5_000 : 1_000);
      const auth = readMeetsAuth();
      if (auth) {
        if (!retrySync) return auth;
        // Re-read the token too: re-login can refresh it without changing ID.
        // Only the official API response can confirm that syncing may resume.
        const response = await retrySync(auth);
        if (response?.code !== "LOGIN_REQUIRED") return response;
        show("等待官方登录", "登录状态尚未恢复；登录后每 5 秒自动重试。");
      }
      if (onMeetsGroupLanding()) {
        const campaignUrl = firstMeetsCampaignUrl();
        if (campaignUrl) {
          location.assign(campaignUrl);
          return null;
        }
      }
    }
    throw new Error("等待 Meets 登录超过 10 分钟，请确认官方登录后返回 Dashboard 重新同步。");
  };
  const discoverMeetsCampaigns = async () => {
    const originalUrl = location.href;
    const campaignsByGroup = {};
    try {
      for (let index = 0; index < MEETS_GROUPS.length; index += 1) {
        const groupSlug = MEETS_GROUPS[index];
        show("正在确认三坂活动入口", `${index + 1} / ${MEETS_GROUPS.length}`);
        history.replaceState(null, "", `/${groupSlug}/`);
        let html = "";
        let lastError;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10_000);
          try {
            const response = await fetch(
              `https://${MEETS_HOST}/${groupSlug}/`,
              {
                credentials: "include",
                cache: "no-store",
                signal: controller.signal,
              },
            );
            if (!response.ok) {
              throw new Error(`活动入口读取失败（${response.status}）`);
            }
            html = await response.text();
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 2) await sleep(700);
          } finally {
            clearTimeout(timer);
          }
        }
        if (lastError) throw lastError;
        const documentNode = parseHtml(html);
        const slugs = Array.from(
          documentNode.querySelectorAll(`a[href*="/${groupSlug}/"]`),
        )
          .map((link) => {
            try {
              const url = new URL(
                link.getAttribute("href") || "",
                location.href,
              );
              const parts = url.pathname.split("/").filter(Boolean);
              return url.hostname === MEETS_HOST &&
                parts[0] === groupSlug &&
                parts.length >= 2
                ? parts[1]
                : "";
            } catch {
              return "";
            }
          })
          .filter((slug) => slug && !EXCLUDED_MEETS_SLUGS.has(slug));
        campaignsByGroup[groupSlug] = Array.from(new Set(slugs));
        if (
          campaignsByGroup[groupSlug].length === 0 &&
          /遷移したいページを選択してください/.test(html)
        ) {
          throw new Error(`${groupSlug} 活动入口暂时无法读取，请稍后重试`);
        }
      }
    } finally {
      history.replaceState(null, "", originalUrl);
    }
    return campaignsByGroup;
  };
  const requestMeetsApiSync = (auth, campaignsByGroup) =>
    chrome.runtime.sendMessage({
      type: "MIGURI46LOG_MEETS_API_SYNC",
      jobId: job.id,
      ...auth,
      campaignsByGroup,
    });
  const importMeets = async () => {
    show("正在连接 Meets", "后台准备检查乃木坂、櫻坂与日向坂…");
    let auth = readMeetsAuth();
    if (!auth) {
      auth = await waitForMeetsLogin();
      if (!auth) return;
    }
    const campaignsByGroup = await discoverMeetsCampaigns();
    auth = readMeetsAuth();
    if (!auth) {
      auth = await waitForMeetsLogin();
      if (!auth) return;
    }
    let response = await requestMeetsApiSync(auth, campaignsByGroup);
    auth = null;
    if (response?.code === "LOGIN_REQUIRED") {
      response = await waitForMeetsLogin((currentAuth) =>
        requestMeetsApiSync(currentAuth, campaignsByGroup),
      );
      if (!response) return;
    }
    if (!response?.ok) {
      throw new Error(response?.error || "官方履历读取失败");
    }
    if (response.temporarilyUnavailable?.length > 0) {
      show(
        "部分团体入口临时切换",
        `${response.temporarilyUnavailable.join("、")} 当前由官方显示活动跳转页；其他团体已完成。`,
      );
      await sleep(1_800);
    }
    if (response.warnings?.length > 0) {
      show(
        "部分活动已跳过",
        `${response.warnings.length} 个活动读取超时或异常，其余履历已完成。`,
      );
      await sleep(1_800);
    }
    await finish(Array.isArray(response.records) ? response.records : []);
  };

  try {
    if (onMusic) await importMusic();
    else if (location.hostname === MEETS_HOST) await importMeets();
  } catch (error) {
    await chrome.runtime
      .sendMessage({
        type: "MIGURI46LOG_JOB_ERROR",
        jobId: job.id,
        error: error instanceof Error ? error.message : "请稍后重试。",
      })
      .catch(() => {});
    show(
      "同步暂时停止",
      error instanceof Error ? error.message : "请稍后重试。",
    );
  }
})();
