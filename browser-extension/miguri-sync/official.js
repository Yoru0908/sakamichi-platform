(async () => {
  const MUSIC_HOST = "fortunemusic.jp";
  const MEETS_HOST = "ticket.fortunemeets.app";
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

  const readMeetsUserId = () => {
    const raw = localStorage.getItem("lscache-id");
    if (!raw) return "";
    try {
      return compact(JSON.parse(raw));
    } catch {
      return compact(raw);
    }
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
  const waitForMeetsLogin = async (previousUserId = "") => {
    if (onMeetsGroupLanding()) {
      const campaignUrl = firstMeetsCampaignUrl();
      if (campaignUrl) location.assign(campaignUrl);
      else await requireLogin();
      return "";
    }
    await requireLogin();
    if (job.auto) return "";
    for (let attempt = 0; attempt < 600; attempt += 1) {
      await sleep(1_000);
      const userId = readMeetsUserId();
      if (userId && userId !== previousUserId) return userId;
    }
    return "";
  };
  const requestMeetsApiSync = (userId) =>
    chrome.runtime.sendMessage({
      type: "MIGURI46LOG_MEETS_API_SYNC",
      jobId: job.id,
      userId,
    });
  const importMeets = async () => {
    show("正在连接 Meets", "后台准备检查乃木坂、櫻坂与日向坂…");
    let userId = readMeetsUserId();
    if (!userId) {
      userId = await waitForMeetsLogin();
      if (!userId) return;
    }
    let response = await requestMeetsApiSync(userId);
    if (response?.code === "LOGIN_REQUIRED") {
      userId = await waitForMeetsLogin(userId);
      if (!userId) return;
      response = await requestMeetsApiSync(userId);
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
