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

  const uniqueSerialRows = (rows) => {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const id = compact(row?.serialId);
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  const allAwards = (config) =>
    (Array.isArray(config?.applications) ? config.applications : []).flatMap(
      (application) =>
        Array.isArray(application?.awards) ? application.awards : [],
    );

  const rescueSerialNames = (config) =>
    Array.from(
      new Set(
        allAwards(config)
          .flatMap((award) =>
            Array.isArray(award?.period) ? award.period : [],
          )
          .filter((period) => period?.isRescue)
          .map((period) => compact(period?.serialName))
          .filter(Boolean),
      ),
    );

  const serialInfoText = (row) =>
    digits(
      compact(
        typeof row?.serialInfo === "string"
          ? row.serialInfo
          : JSON.stringify(row?.serialInfo || []),
      ),
    ).replace(/\s/g, "");

  const officialTime = (value) => {
    const normalized = digits(compact(value)).replace(/\//g, "-");
    if (!normalized) return 0;
    const iso = normalized.replace(" ", "T");
    const parsed = Date.parse(
      /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}+09:00`,
    );
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const infoMatchesApplyTable = (info, applyTable) =>
    (Array.isArray(applyTable) ? applyTable : []).some((target) => {
      const date = digits(compact(target?.date));
      const dateMatch = date.match(/(\d{1,2})月(\d{1,2})日/);
      if (!dateMatch) return false;
      const month = `${Number(dateMatch[1])}`;
      const day = `${Number(dateMatch[2])}`;
      if (
        !info.includes(`${month}/${day}`) &&
        !info.includes(`${month}月${day}日`)
      ) {
        return false;
      }
      const slot = slotFromText(target?.part);
      return slot === 0 || info.includes(`第${slot}部`);
    });

  const usedDuringRescuePeriod = (row, config) => {
    const appliedAt = officialTime(row?.appliedAt);
    const info = serialInfoText(row);
    if (!appliedAt || !info) return false;
    return allAwards(config).some((award) => {
      if (!infoMatchesApplyTable(info, award?.applyTable)) return false;
      return (Array.isArray(award?.period) ? award.period : []).some(
        (period) =>
          period?.isRescue &&
          officialTime(period?.start) <= appliedAt &&
          appliedAt <= officialTime(period?.end),
      );
    });
  };

  const isRescueSerial = (row, rescueNames, config) => {
    let text = "";
    try {
      text = compact(JSON.stringify(row));
    } catch {
      text = compact(
        [row?.type, row?.serialType, row?.serialName, row?.name].join(" "),
      );
    }
    return (
      /優先|保障/.test(text) ||
      rescueNames.some((name) => text.includes(name)) ||
      usedDuringRescuePeriod(row, config)
    );
  };

  const paidUsedSerialRows = (history, config) => {
    const rescueNames = rescueSerialNames(config);
    return uniqueSerialRows(history?.used).filter(
      (row) => !isRescueSerial(row, rescueNames, config),
    );
  };

  const recordForSerialInfo = (row, records) => {
    const info = serialInfoText(row);
    if (!info) return null;
    const slotMatch = info.match(/第(\d+)部/);
    const hintedCategory = /サイン/.test(info)
      ? "サイン会"
      : /リアルミート/.test(info)
        ? "リアミ"
        : /オンラインミート/.test(info)
          ? "全国ミーグリ"
          : "";
    const candidates = records.filter((record) => {
      const member = compact(record.member).replace(/\s/g, "");
      if (member && !info.includes(member)) return false;
      const [, monthValue, dayValue] = record.date.match(
        /^\d{4}-(\d{2})-(\d{2})$/,
      ) || ["", "", ""];
      const month = `${Number(monthValue)}`;
      const day = `${Number(dayValue)}`;
      if (
        !month ||
        !day ||
        (!info.includes(`${month}/${day}`) &&
          !info.includes(`${month}月${day}日`))
      ) {
        return false;
      }
      if (slotMatch && Number(slotMatch[1]) !== record.slot) return false;
      if (hintedCategory && hintedCategory !== record.category) return false;
      return record.paidTickets < record.appliedTickets;
    });
    return candidates.length === 1 ? candidates[0] : null;
  };

  const distributeTickets = (records, total, weightFor) => {
    const target = Math.max(0, Math.floor(total));
    const weighted = records.map((record, index) => ({
      record,
      index,
      weight: Math.max(0, weightFor(record)),
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (target === 0 || totalWeight === 0) return 0;
    let assigned = 0;
    weighted.forEach((item) => {
      const exact = (target * item.weight) / totalWeight;
      item.tickets = Math.floor(exact);
      item.remainder = exact - item.tickets;
      assigned += item.tickets;
    });
    weighted
      .sort(
        (left, right) =>
          right.remainder - left.remainder || left.index - right.index,
      )
      .slice(0, target - assigned)
      .forEach((item) => {
        item.tickets += 1;
      });
    weighted.forEach((item) => {
      item.record.paidTickets += item.tickets;
    });
    return target;
  };

  const assignPaidTickets = (values, history, unitPriceYen, config) => {
    const paidRows = paidUsedSerialRows(history, config);
    values.forEach((record) => {
      record.paidTickets = 0;
    });
    let matchedSerials = 0;
    paidRows.forEach((row) => {
      const record = recordForSerialInfo(row, values);
      if (!record) return;
      record.paidTickets += 1;
      matchedSerials += 1;
    });
    let remainingSerials = Math.max(0, paidRows.length - matchedSerials);
    const miguriRecords = values.filter(
      (record) =>
        record.category === "リアミ" ||
        record.category === "全国ミーグリ",
    );
    const otherRecords = values.filter(
      (record) =>
        record.category !== "リアミ" &&
        record.category !== "全国ミーグリ",
    );
    const otherCapacity = otherRecords.reduce(
      (sum, record) =>
        sum + Math.max(0, record.appliedTickets - record.paidTickets),
      0,
    );
    const otherSerials = Math.min(remainingSerials, otherCapacity);
    distributeTickets(
      otherRecords,
      otherSerials,
      (record) => Math.max(0, record.appliedTickets - record.paidTickets),
    );
    remainingSerials -= otherSerials;
    const hasMiguriWinner = miguriRecords.some(
      (record) => record.wonTickets > 0,
    );
    const assignedMiguri = distributeTickets(
      miguriRecords,
      remainingSerials,
      (record) =>
        hasMiguriWinner
          ? Math.max(0, record.wonTickets - record.paidTickets)
          : Math.max(0, record.appliedTickets - record.paidTickets),
    );
    if (assignedMiguri === 0 && remainingSerials > 0) {
      distributeTickets(
        values,
        remainingSerials,
        (record) => Math.max(1, record.appliedTickets),
      );
    }
    values.forEach((record) => {
      record.spendYen = record.paidTickets * unitPriceYen;
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
    return assignPaidTickets(
      Array.from(records.values()),
      history,
      unitPriceYen,
      config,
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

  const suppliedCampaigns = (campaignsByGroup, groupSlug) => {
    const values = campaignsByGroup?.[groupSlug];
    if (!Array.isArray(values)) return null;
    return Array.from(
      new Set(
        values
          .map(compact)
          .filter(
            (slug) =>
              /^[A-Za-z0-9._~-]+$/.test(slug) &&
              !EXCLUDED_SLUGS.has(slug),
          ),
      ),
    ).slice(0, 100);
  };

  const sync = async ({
    userId,
    campaignsByGroup,
    onProgress = async () => {},
  }) => {
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
      const supplied = suppliedCampaigns(campaignsByGroup, groupSlug);
      const discovered =
        supplied === null
          ? await discoverGroup(groupSlug)
          : { slugs: supplied, temporaryLanding: false };
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
