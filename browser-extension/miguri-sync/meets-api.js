(() => {
  const MEETS_HOST = "ticket.fortunemeets.app";
  const API_URL = "https://ticket-api.fortunemeets.app/user/history2";
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
  const randomDelay = (minimum, jitter) =>
    minimum + Math.floor(Math.random() * jitter);
  let apiRequestCount = 0;
  let lastApiRequestAt = 0;
  let apiPacingQueue = Promise.resolve();
  const paceApiRequest = () => {
    const paced = apiPacingQueue.then(async () => {
      if (apiRequestCount > 0 && apiRequestCount % 25 === 0) {
        await sleep(randomDelay(2_500, 1_500));
      }
      const remaining =
        randomDelay(500, 350) - (Date.now() - lastApiRequestAt);
      if (remaining > 0) await sleep(remaining);
      lastApiRequestAt = Date.now();
      apiRequestCount += 1;
    });
    apiPacingQueue = paced.catch(() => {});
    return paced;
  };
  const number = (value) => {
    const parsed = Number(digits(value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
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
  const htmlText = (value) =>
    compact(
      `${value || ""}`
        .replace(/<br\s*\/?\s*>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#(\d+);/g, (_, code) =>
          String.fromCodePoint(Number(code)),
        ),
    );
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
  const slotFromText = (value) =>
    Number(digits(value).match(/第\s*(\d+)\s*部/)?.[1] || 0);
  const errorWithCode = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  const request = async (url, options = {}, attempts = 2) => {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (url === API_URL) await paceApiRequest();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        if ([400, 401, 403].includes(response.status) && url === API_URL) {
          throw errorWithCode("请重新登录 forTUNE meets", "LOGIN_REQUIRED");
        }
        if (response.status === 403 || response.status === 429) {
          throw errorWithCode(
            "官方站点暂时限制了请求，请稍后重试。",
            "RETRYABLE",
          );
        }
        if (!response.ok) {
          throw errorWithCode(
            `页面读取失败（${response.status}）`,
            response.status >= 500 ? "RETRYABLE" : "HTTP_ERROR",
          );
        }
        return response;
      } catch (error) {
        if (error?.code === "LOGIN_REQUIRED") throw error;
        lastError =
          error?.name === "AbortError"
            ? errorWithCode("官方页面读取超时", "RETRYABLE")
            : error;
        if (attempt < attempts) await sleep(900 * attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error("官方页面读取失败");
  };

  const discoverGroup = async (groupSlug) => {
    const response = await request(
      `https://${MEETS_HOST}/${groupSlug}/`,
    );
    const html = await response.text();
    const slugs = [];
    const expression = new RegExp(
      `<a\\b[^>]*\\bhref\\s*=\\s*["'](?:https:\\/\\/${MEETS_HOST.replaceAll(".", "\\.")})?\\/${groupSlug}\\/([^/?#"'<>\\s]+)`,
      "gi",
    );
    for (const match of html.matchAll(expression)) {
      const slug = match[1];
      if (slug && !EXCLUDED_SLUGS.has(slug)) slugs.push(slug);
    }
    const unique = Array.from(new Set(slugs));
    return {
      slugs: unique,
      temporaryLanding:
        /遷移したいページを選択してください/.test(html) &&
        unique.length === 0,
    };
  };

  const campaignPrice = (config, campaignSlug) => {
    const text = compact(JSON.stringify(config));
    const prices = Array.from(
      text.matchAll(
        /(?:販売価格|商品価格|税込)[^\d]{0,18}(\d{1,3}(?:,\d{3})+)\s*円|(\d{1,3}(?:,\d{3})+)\s*円(?:\s*税込)/g,
      ),
    )
      .map((match) => number(match[1] || match[2]))
      .filter((value) => value >= 1_000 && value <= 30_000);
    const latestYear = Math.max(
      0,
      ...Array.from(text.matchAll(/(20\d{2})年/g)).map((match) =>
        Number(match[1]),
      ),
    );
    return (
      (prices.length > 0 ? Math.min(...prices) : 0) ||
      (/album/i.test(campaignSlug) || latestYear < 2024 ? 0 : 2_000)
    );
  };

  const registeredSerialCount = (history) => {
    const rows = [
      ...(Array.isArray(history?.unused) ? history.unused : []),
      ...(Array.isArray(history?.used) ? history.used : []),
    ];
    const ids = new Set(
      rows.map((row) => compact(row?.serialId)).filter(Boolean),
    );
    return ids.size || rows.length;
  };

  const allocateSpend = (values, countedSerials, unitPriceYen) => {
    const serials =
      countedSerials ||
      values.reduce((sum, record) => sum + record.appliedTickets, 0);
    const nonMiguriApplied = values
      .filter(
        (record) =>
          record.category !== "リアミ" &&
          record.category !== "全国ミーグリ",
      )
      .reduce((sum, record) => sum + record.appliedTickets, 0);
    const nonMiguriScale =
      nonMiguriApplied > serials && nonMiguriApplied > 0
        ? serials / nonMiguriApplied
        : 1;
    const remainingSerials = Math.max(0, serials - nonMiguriApplied);
    const miguriRecords = values.filter(
      (record) =>
        record.category === "リアミ" ||
        record.category === "全国ミーグリ",
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

  const normalizedResultParts = (result) => {
    if (result?.result === "当選" && result.resultInfo) {
      const parts = [];
      const won = number(result.resultInfo.win);
      const lost = number(result.resultInfo.lose);
      if (won > 0) parts.push({ count: won, status: "won" });
      if (lost > 0) parts.push({ count: lost, status: "lost" });
      return parts;
    }
    const count = number(result?.count);
    if (count <= 0) return [];
    return [
      {
        count,
        status:
          result.result === "当選"
            ? "won"
            : result.result === "落選"
              ? "lost"
              : "pending",
      },
    ];
  };

  const normalizeCampaign = ({
    config,
    history,
    campaignSlug,
    groupSlug,
    group,
    sourceSyncedAt,
  }) => {
    const application = Array.isArray(config?.applications)
      ? config.applications[0]
      : null;
    const awards = Array.isArray(application?.awards)
      ? application.awards
      : [];
    const byPrizeId = new Map();
    awards.forEach((award) => {
      (Array.isArray(award.applyTable) ? award.applyTable : []).forEach(
        (item) => byPrizeId.set(`${item.id}`, { award, item }),
      );
    });
    const unitPriceYen = campaignPrice(config, campaignSlug);
    const records = new Map();
    (Array.isArray(history?.results) ? history.results : []).forEach(
      (result) => {
        const matched = byPrizeId.get(`${result?.prizeId || ""}`);
        if (!matched) return;
        const { award, item } = matched;
        const members = Array.isArray(result?.prizeInfo?.members)
          ? result.prizeInfo.members
          : [];
        const member = compact(members.join("・")).replace(
          /[\s\u3000]+/g,
          "",
        );
        const date = isoDateFromText(item.date);
        if (!member || !date) return;
        const slot = slotFromText(item.part);
        const heading = htmlText(award?.entryHtml?.title || award?.name);
        const category = categoryFromHeading(heading);
        const venue = compact(
          `${item.date || ""}`.includes("＠")
            ? `${item.date}`.split("＠").slice(1).join("＠")
            : "",
        );
        normalizedResultParts(result).forEach((part) => {
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
            title: [compact(config?.eventName), heading]
              .filter(Boolean)
              .join("｜"),
            venue,
            group,
            resultStatus: part.status,
          };
          record.appliedTickets += part.count;
          record.signLots += Math.floor(
            part.count / Math.max(1, number(award.serialCount)),
          );
          if (part.status === "won") {
            record.wonTickets += part.count;
            record.resultStatus = "won";
          } else if (
            part.status === "pending" &&
            record.resultStatus !== "won"
          ) {
            record.resultStatus = "pending";
          }
          records.set(naturalKey, record);
        });
      },
    );
    return allocateSpend(
      Array.from(records.values()),
      registeredSerialCount(history),
      unitPriceYen,
    );
  };

  const loadCampaign = async ({
    groupSlug,
    group,
    campaignSlug,
    userId,
    sourceSyncedAt,
  }) => {
    const configUrl = `https://${MEETS_HOST}/data/${encodeURIComponent(groupSlug)}/${encodeURIComponent(campaignSlug)}/config.json`;
    const config = await (await request(configUrl)).json();
    if (!config?.eventId) return [];
    const history = await (
      await request(API_URL, {
        headers: {
          "x-artist-event": config.eventId,
          "x-user-id": userId,
        },
      })
    ).json();
    return normalizeCampaign({
      config,
      history,
      campaignSlug,
      groupSlug,
      group,
      sourceSyncedAt,
    });
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

  const sync = async ({ userId, onProgress = async () => {} }) => {
    if (!compact(userId)) {
      throw errorWithCode("请重新登录 forTUNE meets", "LOGIN_REQUIRED");
    }
    const sourceSyncedAt = new Date().toISOString();
    const records = [];
    const warnings = [];
    const temporarilyUnavailable = [];
    let discoveredCampaigns = 0;
    for (let groupIndex = 0; groupIndex < GROUPS.length; groupIndex += 1) {
      const [groupSlug, group, groupLabel] = GROUPS[groupIndex];
      await onProgress(
        `正在检查 ${groupLabel}`,
        `Meets 三坂巡检 ${groupIndex + 1} / ${GROUPS.length}`,
      );
      const discovered = await discoverGroup(groupSlug);
      if (discovered.temporaryLanding) temporarilyUnavailable.push(groupLabel);
      discoveredCampaigns += discovered.slugs.length;
      let completedCampaigns = 0;
      const results = await mapWithConcurrency(
        discovered.slugs,
        2,
        async (campaignSlug) => {
          let campaignRecords = [];
          try {
            campaignRecords = await loadCampaign({
              groupSlug,
              group,
              campaignSlug,
              userId,
              sourceSyncedAt,
            });
          } catch (error) {
            if (error?.code === "LOGIN_REQUIRED") throw error;
            warnings.push(
              `${groupLabel} ${campaignSlug}: ${error?.message || "读取失败"}`,
            );
          } finally {
            completedCampaigns += 1;
            await onProgress(
              `正在读取 ${groupLabel}`,
              `活动履历 ${completedCampaigns} / ${discovered.slugs.length}`,
            );
          }
          return campaignRecords;
        },
      );
      results.forEach((result) => records.push(...result));
    }
    if (discoveredCampaigns === 0) {
      throw errorWithCode(
        "官方 Meets 正在切换活动入口，请稍后重试。",
        "TEMPORARILY_UNAVAILABLE",
      );
    }
    return {
      records,
      warnings,
      temporarilyUnavailable,
      discoveredCampaigns,
    };
  };

  globalThis.MiguriMeetsApi = {
    normalizeCampaign,
    sync,
  };
})();
