import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  LoaderCircle,
  Puzzle,
  RefreshCw,
  Ticket,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type {
  MiguriEntry,
  MiguriEntryCategory,
  MiguriGroupId,
} from "@/utils/auth-api";
import {
  aggregateMiguriDashboard,
  resolveMiguriEntrySpend,
} from "./meguri-helpers";
import {
  runMiguriExtensionAutoSync,
  setMiguriExtensionAutoSync,
  startMiguriExtensionSync,
  subscribeMiguriExtension,
  type MiguriExtensionAutoState,
} from "./miguri-extension";

export type MiguriAutoImportState = {
  status: "idle" | "saving" | "success" | "error";
  message: string;
  next: "music" | "meets" | "done" | null;
};

type Props = {
  entries: MiguriEntry[];
  importState: MiguriAutoImportState;
};

type RankMetric = "spend" | "won" | "rate" | "cost";

const CATEGORY_ORDER: MiguriEntryCategory[] = [
  "個別ミーグリ",
  "全国ミーグリ",
  "リアミ",
  "サイン会",
  "その他",
];
const CATEGORY_COLORS: Record<MiguriEntryCategory, string> = {
  個別ミーグリ: "#5146e5",
  全国ミーグリ: "#65a99c",
  リアミ: "#5195ca",
  サイン会: "#c64d82",
  その他: "#a1a1aa",
};
const GROUP_LABELS: Record<MiguriGroupId, string> = {
  nogizaka: "乃木坂46",
  sakurazaka: "櫻坂46",
  hinatazaka: "日向坂46",
};
const MEETS_DISCOUNT_STORAGE_KEY =
  "46log:miguri:limited-edition-discount-pct";

function clampMeetsDiscount(value: number) {
  return Math.max(0, Math.min(30, Number.isFinite(value) ? value : 0));
}

function displayDate(date: string) {
  const weekday = new Intl.DateTimeFormat("ja-JP", {
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T00:00:00+09:00`));
  return `${date}（${weekday}）`;
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function categoryUnit(category: string) {
  return category === "サイン会" ? "口" : "张";
}

function relativeSyncTime(value: string | null) {
  if (!value) return "未同步";
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff) || diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function ImportStatus({
  state,
  onSyncMeets,
}: {
  state: MiguriAutoImportState;
  onSyncMeets: () => void;
}) {
  if (state.status === "idle") return null;
  const isSaving = state.status === "saving";
  const isSuccess = state.status === "success";
  const Icon = isSaving ? LoaderCircle : isSuccess ? CheckCircle2 : RefreshCw;

  return (
    <div
      className={`mt-4 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        isSuccess
          ? "border-emerald-500/25 bg-emerald-500/10"
          : state.status === "error"
            ? "border-rose-500/25 bg-rose-500/10"
            : "border-sky-500/25 bg-sky-500/10"
      }`}
      role={state.status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          size={18}
          className={`mt-0.5 shrink-0 ${isSaving ? "animate-spin text-sky-500" : isSuccess ? "text-emerald-500" : "text-rose-500"}`}
        />
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            {isSaving
              ? "正在保存履历"
              : isSuccess
                ? "Dashboard 已刷新"
                : "同步未完成"}
          </div>
          <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
            {state.message}
          </p>
        </div>
      </div>
      {state.next === "meets" && state.status === "success" ? (
        <button
          type="button"
          onClick={onSyncMeets}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-primary)] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          继续同步 Meets <ArrowRight size={15} />
        </button>
      ) : null}
    </div>
  );
}

function ImportSetup({ state }: { state: MiguriAutoImportState }) {
  const [extensionVersion, setExtensionVersion] = useState("");
  const [extensionMessage, setExtensionMessage] = useState("");
  const [autoState, setAutoState] =
    useState<MiguriExtensionAutoState | null>(null);

  useEffect(
    () =>
      subscribeMiguriExtension((event) => {
        if (event.type === "PONG") setExtensionVersion(event.version);
        if (event.type === "STARTED") {
          setExtensionMessage(
            `已启动 ${event.syncSource === "fortunemusic" ? "Music" : "Meets"} 同步`,
          );
        }
        if (event.type === "PROGRESS")
          setExtensionMessage(
            [event.title, event.detail].filter(Boolean).join(" · "),
          );
        if (event.type === "AUTO_STATE") {
          setAutoState(event.state);
          if (event.state.status === "needs-login") {
            setExtensionMessage(
              `自动同步暂停：请重新登录 ${event.state.needsLogin}`,
            );
          } else if (event.state.status === "error") {
            setExtensionMessage(
              `自动同步暂停：${event.state.lastError || "请稍后重试"}`,
            );
          }
        }
        if (event.type === "ERROR") setExtensionMessage(event.message);
      }),
    [],
  );

  const startSync = (source: "fortunemusic" | "fortunemeets") => {
    if (!extensionVersion) {
      setExtensionMessage("请先安装扩展并重新加载页面。");
      return;
    }
    setExtensionMessage("正在打开官方页面…");
    startMiguriExtensionSync(source);
  };

  return (
    <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            <RefreshCw size={14} /> 应募履历同步
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
            一键更新 Music 与 Meets
          </h2>
        </div>
        <div
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${
            extensionVersion
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
              : "border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
          }`}
        >
          {extensionVersion ? <CheckCircle2 size={16} /> : <Puzzle size={16} />}
          {extensionVersion
            ? `扩展已连接 · v${extensionVersion}`
            : "等待安装同步扩展"}
        </div>
      </div>

      {extensionVersion ? (
        <div className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => startSync("fortunemusic")}
              className="flex min-h-14 items-center justify-between rounded-2xl bg-indigo-600 px-5 text-left text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              同步 forTUNE music <ArrowRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => startSync("fortunemeets")}
              className="flex min-h-14 items-center justify-between rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-5 text-left text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-pink-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              同步 forTUNE meets（三坂） <ArrowRight size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <RefreshCw
                  size={15}
                  className={
                    autoState?.status === "syncing" ? "animate-spin" : ""
                  }
                />
                浏览器运行时自动同步
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                每 {autoState?.intervalMinutes || 30}{" "}
                分钟检查一次；登录失效时暂停并提示。
                {autoState?.lastSuccessAt
                  ? ` 上次成功：${relativeSyncTime(autoState.lastSuccessAt)}。`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {autoState?.enabled ? (
                <button
                  type="button"
                  onClick={runMiguriExtensionAutoSync}
                  disabled={autoState.status === "syncing"}
                  className="min-h-11 rounded-xl border border-[var(--border-primary)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-50"
                >
                  {autoState.status === "syncing" ? "检查中…" : "立即检查"}
                </button>
              ) : null}
              <button
                type="button"
                aria-pressed={autoState?.enabled === true}
                onClick={() =>
                  setMiguriExtensionAutoSync(!autoState?.enabled)
                }
                className={`min-h-11 rounded-xl px-4 text-xs font-bold ${
                  autoState?.enabled
                    ? "bg-emerald-600 text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                }`}
              >
                自动同步 {autoState?.enabled ? "已开启" : "已关闭"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex min-h-8 items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 text-xs font-bold text-amber-700">
                <Clock3 size={14} /> Chrome Web Store · 审核中
              </div>
              <div className="mt-3 text-sm font-bold text-[var(--text-primary)]">
                审核期间可先安装 ZIP 版本
              </div>
              <ol className="mt-2 grid gap-1 text-xs leading-5 text-[var(--text-secondary)] sm:grid-cols-3 sm:gap-3">
                <li>
                  <span className="font-bold text-[var(--text-primary)]">
                    01
                  </span>{" "}
                  下载并解压 ZIP
                </li>
                <li>
                  <span className="font-bold text-[var(--text-primary)]">
                    02
                  </span>{" "}
                  打开 chrome://extensions
                </li>
                <li>
                  <span className="font-bold text-[var(--text-primary)]">
                    03
                  </span>{" "}
                  开启开发者模式并加载已解压扩展
                </li>
              </ol>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                商店审核通过后，这里会切换为 Chrome Web Store
                的普通安装入口。
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <a
                href="/miguri-support"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-primary)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-indigo-500/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                查看安装说明
              </a>
              <a
                href="/downloads/46log-miguri-sync.zip"
                download
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <Download size={16} /> 下载 ZIP 临时安装
              </a>
            </div>
          </div>
        </div>
      )}

      {extensionMessage ? (
        <p
          className="mt-3 text-xs font-medium text-[var(--text-secondary)]"
          role="status"
          aria-live="polite"
        >
          {extensionMessage}
        </p>
      ) : null}
      <ImportStatus
        state={state}
        onSyncMeets={() => startSync("fortunemeets")}
      />
    </section>
  );
}

function SpendSparkline({
  points,
}: {
  points: Array<{ label: string; spendYen: number }>;
}) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.spendYen);
  const max = Math.max(...values, 1);
  const width = 320;
  const height = 54;
  const coordinates = values
    .map((value, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
      const y = height - (value / max) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-4 h-12 w-full max-w-xs overflow-visible"
      role="img"
      aria-label={`最近 ${points.length} 次抽选的支出走势`}
    >
      <polyline
        points={coordinates}
        fill="none"
        stroke="#6366f1"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Donut({
  items,
  total,
}: {
  items: ReturnType<typeof aggregateMiguriDashboard>["categoryBreakdown"];
  total: number;
}) {
  let cursor = 0;
  const gradient = items
    .filter((item) => item.percentage > 0)
    .map((item) => {
      const start = cursor;
      cursor += item.percentage * 100;
      const color =
        CATEGORY_COLORS[item.label as MiguriEntryCategory] ||
        CATEGORY_COLORS["その他"];
      return `${color} ${start}% ${cursor}%`;
    })
    .join(", ");

  return (
    <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <CircleDollarSign size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">按类型</h3>
      </div>
      {items.length > 0 ? (
        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div
            className="relative grid h-36 w-36 shrink-0 place-items-center rounded-full"
            style={{
              background: gradient
                ? `conic-gradient(${gradient})`
                : "var(--bg-secondary)",
            }}
            role="img"
            aria-label={items
              .map((item) => `${item.label} ${formatPercent(item.percentage)}`)
              .join("，")}
          >
            <div className="grid h-[92px] w-[92px] place-items-center rounded-full bg-[var(--bg-primary)] text-center">
              <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {formatYen(total)}
              </span>
            </div>
          </div>
          <div className="w-full space-y-3">
            {items.map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--text-secondary)]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{
                      background:
                        CATEGORY_COLORS[item.label as MiguriEntryCategory] ||
                        CATEGORY_COLORS["その他"],
                    }}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                  {item.spendYen > 0
                    ? formatYen(item.spendYen)
                    : `${item.tickets}${categoryUnit(item.label)}`}
                </span>
                <span className="w-9 text-right tabular-nums text-[var(--text-tertiary)]">
                  {formatPercent(item.percentage)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-tertiary)]">
          同步后会显示类型分布。
        </p>
      )}
    </section>
  );
}

export default function MiguriDashboard({
  entries,
  importState,
}: Props) {
  const groups = useMemo(
    () =>
      Array.from(
        new Set(
          entries
            .map((entry) => entry.group)
            .filter((group): group is MiguriGroupId => Boolean(group)),
        ),
      ),
    [entries],
  );
  const categories = useMemo(
    () =>
      CATEGORY_ORDER.filter((category) =>
        entries.some(
          (entry) => (entry.category || "個別ミーグリ") === category,
        ),
      ),
    [entries],
  );
  const [selectedGroup, setSelectedGroup] = useState<MiguriGroupId | "all">(
    "all",
  );
  const [selectedCategory, setSelectedCategory] = useState<
    MiguriEntryCategory | "all"
  >("all");
  const [rankMetric, setRankMetric] = useState<RankMetric>("spend");
  const [meetsDiscountPct, setMeetsDiscountPct] = useState(0);

  useEffect(() => {
    try {
      setMeetsDiscountPct(
        clampMeetsDiscount(
          Number(window.localStorage.getItem(MEETS_DISCOUNT_STORAGE_KEY)),
        ),
      );
    } catch {}
  }, []);

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (selectedGroup === "all" || entry.group === selectedGroup) &&
          (selectedCategory === "all" ||
            (entry.category || "個別ミーグリ") === selectedCategory),
      ),
    [entries, selectedCategory, selectedGroup],
  );
  const dashboard = useMemo(
    () =>
      aggregateMiguriDashboard(
        filteredEntries,
        undefined,
        meetsDiscountPct,
      ),
    [filteredEntries, meetsDiscountPct],
  );
  const nextStop = dashboard.nextStops[0];
  const hasMeetsEntries = filteredEntries.some(
    (entry) => entry.source === "fortunemeets",
  );
  const meetsSpend = useMemo(
    () =>
      filteredEntries
        .filter((entry) => entry.source === "fortunemeets")
        .reduce(
          (totals, entry) => {
            const wonSpend = resolveMiguriEntrySpend(
              entry,
              meetsDiscountPct,
            ).spendYen;
            const paidSpend = resolveMiguriEntrySpend(
              entry,
              meetsDiscountPct,
              true,
            ).spendYen;
            totals.won += wonSpend;
            totals.lost += Math.max(0, paidSpend - wonSpend);
            totals.paid += paidSpend;
            if (entry.category === "サイン会") {
              totals.signPaid += paidSpend;
            }
            if (
              entry.category === "リアミ" ||
              entry.category === "全国ミーグリ"
            ) {
              totals.miguriPaid += paidSpend;
            }
            return totals;
          },
          { won: 0, lost: 0, paid: 0, signPaid: 0, miguriPaid: 0 },
        ),
    [filteredEntries, meetsDiscountPct],
  );
  const updateMeetsDiscount = (value: number) => {
    const nextValue = clampMeetsDiscount(value);
    setMeetsDiscountPct(nextValue);
    try {
      window.localStorage.setItem(
        MEETS_DISCOUNT_STORAGE_KEY,
        String(nextValue),
      );
    } catch {}
  };

  const memberRanking = useMemo(() => {
    const ranking = new Map<
      string,
      {
        member: string;
        applied: number;
        won: number;
        spend: number;
      }
    >();
    filteredEntries.forEach((entry) => {
      const current = ranking.get(entry.member) || {
        member: entry.member,
        applied: 0,
        won: 0,
        spend: 0,
      };
      const isSign = entry.category === "サイン会";
      const applied =
        isSign && entry.signLots > 0
          ? entry.signLots
          : entry.appliedTickets || entry.tickets;
      const won =
        isSign && entry.signLots > 0
          ? entry.status === "won" || entry.status === "paid"
            ? entry.signLots
            : 0
          : entry.wonTickets ||
            (entry.status === "won" || entry.status === "paid"
              ? entry.tickets
              : 0);
      current.applied += applied;
      current.won += won;
      current.spend += resolveMiguriEntrySpend(
        entry,
        meetsDiscountPct,
        true,
      ).spendYen;
      ranking.set(entry.member, current);
    });
    return Array.from(ranking.values()).sort((left, right) => {
      const leftValue =
        rankMetric === "spend"
          ? left.spend
          : rankMetric === "won"
            ? left.won
            : rankMetric === "rate"
              ? left.applied > 0
                ? left.won / left.applied
                : 0
              : left.won > 0
                ? left.spend / left.won
                : 0;
      const rightValue =
        rankMetric === "spend"
          ? right.spend
          : rankMetric === "won"
            ? right.won
            : rankMetric === "rate"
              ? right.applied > 0
                ? right.won / right.applied
                : 0
              : right.won > 0
                ? right.spend / right.won
                : 0;
      return (
        rightValue - leftValue || left.member.localeCompare(right.member, "ja")
      );
    });
  }, [filteredEntries, meetsDiscountPct, rankMetric]);
  const maxRankValue = Math.max(
    1,
    ...memberRanking.map((item) =>
      rankMetric === "spend"
        ? item.spend
        : rankMetric === "won"
          ? item.won
          : rankMetric === "rate"
            ? item.applied > 0
              ? item.won / item.applied
              : 0
            : item.won > 0
              ? item.spend / item.won
              : 0,
    ),
  );

  const memberGradient =
    dashboard.memberBreakdown.length > 0
      ? dashboard.memberBreakdown
          .slice(0, 6)
          .map((item, index) => {
            const start =
              dashboard.memberBreakdown
                .slice(0, index)
                .reduce((sum, row) => sum + row.percentage, 0) * 100;
            const end = start + item.percentage * 100;
            const colors = [
              "#5146e5",
              "#5195ca",
              "#65a99c",
              "#c64d82",
              "#f59e0b",
              "#94a3b8",
            ];
            return `${colors[index]} ${start}% ${end}%`;
          })
          .join(", ")
      : "";

  return (
    <div className="space-y-5 sm:space-y-6">
      <ImportSetup state={importState} />

      <section aria-label="Dashboard 筛选" className="space-y-3">
        {groups.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={selectedGroup === "all"}
              onClick={() => setSelectedGroup("all")}
              className={`min-h-11 rounded-full border px-4 text-xs font-semibold ${
                selectedGroup === "all"
                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-700"
                  : "border-[var(--border-primary)] text-[var(--text-secondary)]"
              }`}
            >
              全部组合
            </button>
            {groups.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={selectedGroup === group}
                onClick={() => setSelectedGroup(group)}
                className={`min-h-11 rounded-full border px-4 text-xs font-semibold ${
                  selectedGroup === group
                    ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-700"
                    : "border-[var(--border-primary)] text-[var(--text-secondary)]"
                }`}
              >
                {GROUP_LABELS[group]}
              </button>
            ))}
          </div>
        ) : null}
        {categories.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              aria-pressed={selectedCategory === "all"}
              onClick={() => setSelectedCategory("all")}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold ${
                selectedCategory === "all"
                  ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                  : "border-[var(--border-primary)] text-[var(--text-secondary)]"
              }`}
            >
              全部类型
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={selectedCategory === category}
                onClick={() => setSelectedCategory(category)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold ${
                  selectedCategory === category
                    ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                    : "border-[var(--border-primary)] text-[var(--text-secondary)]"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {dashboard.sourceFreshness.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="同步状态">
          {dashboard.sourceFreshness.slice(0, 6).map((item) => (
            <span
              key={`${item.source}-${item.group}`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              {item.source === "fortunemusic"
                ? "forTUNE music"
                : GROUP_LABELS[item.group as MiguriGroupId] || "Meets"}
              · {relativeSyncTime(item.syncedAt)}
            </span>
          ))}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 sm:p-7">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)] lg:items-end">
          <div>
            <div className="text-sm font-semibold text-[var(--text-secondary)]">
              当选分摊金额（不含未中分摊）
            </div>
            <div className="mt-2 text-5xl font-black tracking-[-0.055em] text-[var(--text-primary)] sm:text-7xl">
              <span className="mr-1 text-2xl font-semibold text-[var(--text-tertiary)] sm:text-4xl">
                ¥
              </span>
              {Math.round(dashboard.totalSpendYen).toLocaleString("ja-JP")}
            </div>
            <SpendSparkline points={dashboard.spendTimeline} />
            {dashboard.topMember ? (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                本命{" "}
                <strong className="text-[var(--text-primary)]">
                  {dashboard.topMember.name}
                </strong>
                {" · "}
                {formatPercent(dashboard.topMember.share)} 的支出份额
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-tertiary)]">
                同步带有单价的履历后显示实际支出。
              </p>
            )}
            {dashboard.estimatedSpendYen > 0 ? (
              <p className="mt-2 text-xs leading-5 text-amber-700">
                含发行价格表或旧记录估算 {formatYen(dashboard.estimatedSpendYen)}
                ；限定盘折扣仅保存在当前浏览器。
              </p>
            ) : null}
            {dashboard.unpricedWonTickets > 0 ? (
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                另有 {dashboard.unpricedWonTickets} 张价格未知，暂未计入。
              </p>
            ) : null}
          </div>
          <div className="space-y-5">
            {hasMeetsEntries ? (
              <label className="block rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                <span className="flex items-center justify-between gap-4 text-sm font-bold text-[var(--text-primary)]">
                  <span>限定盘折扣</span>
                  <output className="tabular-nums text-indigo-600">
                    {meetsDiscountPct}%
                  </output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={meetsDiscountPct}
                  onChange={(event) =>
                    updateMeetsDiscount(Number(event.currentTarget.value))
                  }
                  aria-label="限定盘折扣"
                  className="mt-3 h-2 w-full cursor-pointer accent-indigo-600"
                />
                <span className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                  <span>Meets 支付合计（普通used序列号）</span>
                  <strong className="shrink-0 tabular-nums text-[var(--text-primary)]">
                    {formatYen(meetsSpend.paid)}
                  </strong>
                </span>
                <span className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
                  <span>サイン会支付</span>
                  <strong className="shrink-0 tabular-nums text-[var(--text-primary)]">
                    {formatYen(meetsSpend.signPaid)}
                  </strong>
                </span>
                <span className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
                  <span>リアミ＋全国共同支付</span>
                  <strong className="shrink-0 tabular-nums text-[var(--text-primary)]">
                    {formatYen(meetsSpend.miguriPaid)}
                  </strong>
                </span>
                <span className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-primary)] pt-3 text-xs text-[var(--text-secondary)]">
                  <span>参考：当选／未中分摊</span>
                  <strong className="shrink-0 tabular-nums text-[var(--text-primary)]">
                    {formatYen(meetsSpend.won)} / {formatYen(meetsSpend.lost)}
                  </strong>
                </span>
                <span className="mt-3 block text-[11px] leading-5 text-[var(--text-tertiary)]">
                  扩展会结合官方 used 的 type／serialInfo、应募时间与活动保障期 serialName 识别保障券：保障券保留在应募、中签和中签率中，但金额为 ¥0。普通序列号按 serialInfo 逐张归属；旧活动缺少归属信息时才进入リアミ＋全国共同池。当选／未中金额始终守恒，不会超过支付合计。
                </span>
              </label>
            ) : null}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs leading-5 text-[var(--text-tertiary)]">
                  中签率
                  <br />
                  不含サイン会・其他
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {formatPercent(dashboard.winRate)}
                </div>
              </div>
              <div>
                <div className="text-xs leading-5 text-[var(--text-tertiary)]">
                  应募张数
                </div>
                <div className="mt-7 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {dashboard.totalApplied}
                </div>
              </div>
              <div>
                <div className="text-xs leading-5 text-[var(--text-tertiary)]">
                  中签张数
                </div>
                <div className="mt-7 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {dashboard.totalWon}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7">
          <span className="inline-flex rounded-full bg-indigo-500/10 px-3 py-1 text-sm font-bold text-indigo-600">
            {dashboard.oshiType}
          </span>
          <div
            className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--bg-secondary)]"
            style={{
              background: memberGradient
                ? `linear-gradient(90deg, ${memberGradient})`
                : undefined,
            }}
            role="img"
            aria-label={dashboard.memberBreakdown
              .map((item) => `${item.label} ${formatPercent(item.percentage)}`)
              .join("，")}
          />
          {dashboard.topMember ? (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              支出最集中：{formatPercent(dashboard.topMember.share)} 给了{" "}
              {dashboard.topMember.name}。
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          {
            label:
              dashboard.estimatedSpendYen > 0
                ? "当选分摊金额（含估算）"
                : "当选分摊金额",
            value: formatYen(dashboard.totalSpendYen),
            icon: CircleDollarSign,
            color: "text-indigo-500",
          },
          {
            label: "未中分摊金额",
            value: formatYen(dashboard.lostSpendYen),
            icon: TrendingUp,
            color: "text-rose-500",
          },
          {
            label: "支付合计（按序列号）",
            value: formatYen(dashboard.totalPaidSpendYen),
            icon: CircleDollarSign,
            color: "text-pink-500",
          },
          {
            label: "未来日期",
            value: `${dashboard.upcomingDates}`,
            icon: CalendarDays,
            color: "text-emerald-500",
          },
          {
            label: "成员",
            value: `${dashboard.memberBreakdown.length}`,
            icon: UserRound,
            color: "text-sky-500",
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4"
            >
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <Icon size={15} className={metric.color} />
                {metric.label}
              </div>
              <div className="mt-2 text-xl font-bold tabular-nums text-[var(--text-primary)] sm:text-2xl">
                {metric.value}
              </div>
            </div>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)]">
        <div className="border-b border-[var(--border-primary)] px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-emerald-500" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              下一站
            </h3>
          </div>
        </div>
        {nextStop ? (
          <div className="divide-y divide-[var(--border-primary)]">
            <div className="px-4 py-5 sm:px-6">
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                {displayDate(nextStop.date)}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {nextStop.venues.length > 0
                  ? nextStop.venues.join(" · ")
                  : "会场信息待同步"}
              </p>
            </div>
            {nextStop.rows.map((row) => (
              <div
                key={`${row.member}-${row.category}`}
                className="px-4 py-4 sm:px-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {row.member}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      {row.category} ·{" "}
                      <span className="font-semibold tabular-nums">
                        {row.tickets}
                        {categoryUnit(row.category)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.slots.map((slot) => (
                      <span
                        key={slot.slot}
                        className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        {slot.slot > 0 ? `第${slot.slot}部` : "无部数"} ·{" "}
                        {slot.tickets}
                        {categoryUnit(row.category)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {dashboard.nextStops.length > 1 ? (
              <div className="px-4 py-4 sm:px-6">
                <div className="space-y-3">
                  {dashboard.nextStops.slice(1, 6).map((stop) => (
                    <div
                      key={stop.date}
                      className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {displayDate(stop.date)}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {stop.rows
                          .map(
                            (row) =>
                              `${row.member} ${row.category}·${row.tickets}`,
                          )
                          .join(" / ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-[var(--text-tertiary)] sm:px-6">
            同步中签履历后，リアミ、サイン会与每一部张数会自动显示。
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-sky-500" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                成员排行
              </h3>
            </div>
            <div className="flex overflow-x-auto rounded-xl border border-[var(--border-primary)] p-1">
              {(
                [
                  ["spend", "支付金额"],
                  ["won", "中签张数"],
                  ["rate", "中签率"],
                  ["cost", "单张成本"],
                ] as Array<[RankMetric, string]>
              ).map(([metric, label]) => (
                <button
                  key={metric}
                  type="button"
                  aria-pressed={rankMetric === metric}
                  onClick={() => setRankMetric(metric)}
                  className={`min-h-9 shrink-0 rounded-lg px-3 text-[11px] font-semibold ${
                    rankMetric === metric
                      ? "bg-indigo-500/10 text-indigo-700"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {memberRanking.slice(0, 8).map((item) => {
              const value =
                rankMetric === "spend"
                  ? item.spend
                  : rankMetric === "won"
                    ? item.won
                    : rankMetric === "rate"
                      ? item.applied > 0
                        ? item.won / item.applied
                        : 0
                      : item.won > 0
                        ? item.spend / item.won
                        : 0;
              const label =
                rankMetric === "spend" || rankMetric === "cost"
                  ? formatYen(value)
                  : rankMetric === "rate"
                    ? formatPercent(value)
                    : `${Math.round(value)}`;
              return (
                <div
                  key={item.member}
                  className="grid grid-cols-[minmax(92px,auto)_minmax(80px,1fr)_auto] items-center gap-3"
                >
                  <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {item.member}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-pink-500"
                      style={{
                        width: `${Math.max(2, (value / maxRankValue) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="min-w-16 text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">
                    {label}
                  </span>
                </div>
              );
            })}
            {memberRanking.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)]">
                同步后会显示成员排行。
              </p>
            ) : null}
          </div>
          {memberRanking.length > 0 ? (
            <p className="mt-5 text-xs leading-5 text-[var(--text-tertiary)]">
              成员排行的“支付金额”和“单张成本”包含该成员落选申请对应的 CD
              费用；上方当选与分类分摊金额不包含未中分摊。
            </p>
          ) : null}
        </section>

        <Donut
          items={dashboard.categoryBreakdown}
          total={dashboard.totalSpendYen}
        />
      </div>

      <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <Ticket size={13} />
        forTUNE music 的中签 CD 统一按每张 ¥1,200 计算；Meets
        按参考站发行价格表计算，可用“限定盘折扣”调整渠道实付；价格未知的活动不计入。未中分摊计入支付合计及成员排行。
      </p>
    </div>
  );
}
