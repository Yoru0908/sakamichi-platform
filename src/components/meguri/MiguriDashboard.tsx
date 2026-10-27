import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  LoaderCircle,
  Puzzle,
  RefreshCw,
  Share2,
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
  buildMiguriWinRateTrend,
  entryLotteryCounts,
  resolveMiguriEntrySpend,
} from "./meguri-helpers";
import WinRateTrend from "./WinRateTrend";
import MiguriShareDialog from "./MiguriShareDialog";
import {
  buildMiguriShareCard,
  inMiguriPeriod,
  miguriYears,
  type MiguriPeriod,
} from "./miguri-share";
import { useLanguage } from "@/i18n/use-language";
import {
  miguriNow,
  miguriTranslator,
  type MiguriText,
  type MiguriTranslate,
} from "@/i18n/miguri";
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
const MIN_RECOMMENDED_EXTENSION_VERSION = [1, 1, 22] as const;

function extensionNeedsUpdate(version: string) {
  const current = version.split(".").map((part) => Number(part) || 0);
  return MIN_RECOMMENDED_EXTENSION_VERSION.some((minimum, index) => {
    const value = current[index] || 0;
    const previousEqual = MIN_RECOMMENDED_EXTENSION_VERSION.slice(0, index).every(
      (part, previousIndex) => (current[previousIndex] || 0) === part,
    );
    return previousEqual && value < minimum;
  });
}

function clampMeetsDiscount(value: number) {
  return Math.max(0, Math.min(30, Number.isFinite(value) ? value : 0));
}

/** 2026-11-15（日） in zh / ja, 2026-11-15 (Sun) in en. The date string is already a JST calendar date. */
function displayDate(date: string, tr: MiguriTranslate) {
  const names = tr("weekdays");
  const weekday = (names.includes(",") ? names.split(",") : [...names])[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return tr("dateWithWeekday", { date, weekday });
}

function formatYen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function categoryUnit(category: string, tr: MiguriTranslate) {
  return category === "サイン会" ? tr("signUnit") : tr("ticketUnit");
}

function relativeSyncTime(value: string | null, tr: MiguriTranslate) {
  if (!value) return tr("never");
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff) || diff < 0) return tr("justNow");
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return tr("justNow");
  if (minutes < 60) return tr("minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr("hoursAgo", { n: hours });
  return tr("daysAgo", { n: Math.floor(hours / 24) });
}

function ImportStatus({
  state,
  onSyncMeets,
}: {
  state: MiguriAutoImportState;
  onSyncMeets: () => void;
}) {
  const tr = miguriTranslator(useLanguage());
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
              ? tr("saving")
              : isSuccess
                ? tr("refreshed")
                : tr("syncIncomplete")}
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
          {tr("continueMeets")} <ArrowRight size={15} />
        </button>
      ) : null}
    </div>
  );
}

function ImportSetup({ state }: { state: MiguriAutoImportState }) {
  const tr = miguriTranslator(useLanguage());
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
            miguriNow("syncStarted", { source: event.syncSource === "fortunemusic" ? "Music" : "Meets" }),
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
              miguriNow("autoNeedsLogin", { site: String(event.state.needsLogin) }),
            );
          } else if (event.state.status === "error") {
            setExtensionMessage(
              miguriNow("autoError", { error: event.state.lastError || miguriNow("retryLater") }),
            );
          }
        }
        if (event.type === "ERROR") setExtensionMessage(event.message);
      }),
    [],
  );

  const needsUpdate =
    extensionVersion !== "" && extensionNeedsUpdate(extensionVersion);

  const startSync = (source: "fortunemusic" | "fortunemeets") => {
    if (!extensionVersion) {
      setExtensionMessage(tr("installFirst"));
      return;
    }
    setExtensionMessage(tr("openingOfficial"));
    startMiguriExtensionSync(source);
  };

  return (
    <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            <RefreshCw size={14} /> {tr("syncKicker")}
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
            {tr("syncHeading")}
          </h2>
        </div>
        <div
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${
            extensionVersion
              ? needsUpdate
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
              : "border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
          }`}
        >
          {extensionVersion && !needsUpdate ? (
            <CheckCircle2 size={16} />
          ) : (
            <Puzzle size={16} />
          )}
          {extensionVersion
            ? tr(needsUpdate ? "extensionOutdated" : "extensionConnected", { v: extensionVersion })
            : tr("extensionWaiting")}
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
              {needsUpdate ? tr("syncMusicUpdateFirst") : tr("syncAll")} <ArrowRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => startSync("fortunemeets")}
              className="flex min-h-14 items-center justify-between rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-5 text-left text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-pink-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              {tr("syncMeetsOnly")} <ArrowRight size={18} />
            </button>
          </div>
          {needsUpdate ? (
            <div
              className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <div>
                <div className="text-sm font-bold text-amber-800">
                  {tr("updateNeeded")}
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  {tr("updateBody")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {autoState?.enabled ? (
                  <button
                    type="button"
                    onClick={() => setMiguriExtensionAutoSync(false)}
                    className="min-h-11 rounded-xl border border-amber-600/35 px-3 text-xs font-bold text-amber-800"
                  >
                    {tr("turnOffOldAuto")}
                  </button>
                ) : null}
                <a
                  href="/downloads/46log-miguri-sync.zip?v=1.1.22"
                  download
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  <Download size={15} /> {tr("downloadZip")}
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <RefreshCw
                    size={15}
                    className={
                      autoState?.status === "syncing" ? "animate-spin" : ""
                    }
                  />
                  {tr("autoHeading")}
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  {tr("autoBody", { n: autoState?.intervalMinutes || 30 })}
                  {autoState?.lastSuccessAt
                    ? tr("lastSuccess", { when: relativeSyncTime(autoState.lastSuccessAt, tr) })
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
                    {autoState.status === "syncing" ? tr("checking") : tr("checkNow")}
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
                  {tr(autoState?.enabled ? "autoOn" : "autoOff")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex min-h-8 items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-800">
                <Puzzle size={14} /> {tr("zipBadge")}
              </div>
              <div className="mt-3 text-sm font-bold text-[var(--text-primary)]">
                {tr("installHeading")}
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                {tr("installBody")}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <a
                href="/miguri-support"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-primary)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-indigo-500/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {tr("installGuide")}
              </a>
              <a
                href="https://chromewebstore.google.com/detail/46log-%E5%92%AA%E5%92%95%E5%8A%9B%E5%90%8C%E6%AD%A5/kdfpdlijajcjianjpffgnmodnmigckdh?authuser=0&hl=ja"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                {tr("installStore")} <ArrowRight size={16} />
              </a>
              <a
                href="/downloads/46log-miguri-sync.zip?v=1.1.22"
                download
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-indigo-500/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <Download size={16} /> {tr("downloadZip")}
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
  const tr = miguriTranslator(useLanguage());
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
      aria-label={tr("sparkline", { n: points.length })}
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
  const tr = miguriTranslator(useLanguage());
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
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{tr("byCategory")}</h3>
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
              .join(tr("listSep"))}
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
                    : `${item.tickets}${categoryUnit(item.label, tr)}`}
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
          {tr("byCategoryEmpty")}
        </p>
      )}
    </section>
  );
}

export default function MiguriDashboard({
  entries,
  importState,
}: Props) {
  const tr = miguriTranslator(useLanguage());
  const years = useMemo(() => miguriYears(entries), [entries]);
  const [pickedPeriod, setPeriod] = useState<MiguriPeriod>("all");
  const period: MiguriPeriod = pickedPeriod !== "all" && !years.includes(pickedPeriod) ? "all" : pickedPeriod;
  const [sharing, setSharing] = useState(false);
  // 期间 applies before 组合 / 类型: the totals, ranking, trend and share card all count the same year.
  const periodEntries = useMemo(() => inMiguriPeriod(entries, period), [entries, period]);
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
      periodEntries.filter(
        (entry) =>
          (selectedGroup === "all" || entry.group === selectedGroup) &&
          (selectedCategory === "all" ||
            (entry.category || "個別ミーグリ") === selectedCategory),
      ),
    [periodEntries, selectedCategory, selectedGroup],
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
  const shareCard = useMemo(
    () =>
      buildMiguriShareCard({
        entries: filteredEntries,
        dashboard,
        period,
        group: selectedGroup,
        category: selectedCategory === "all" ? null : selectedCategory,
      }),
    [filteredEntries, dashboard, period, selectedGroup, selectedCategory],
  );
  const nextStop = dashboard.nextStops[0];
  const winRateTrend = useMemo(
    () => buildMiguriWinRateTrend(filteredEntries),
    [filteredEntries],
  );
  const hasMeetsEntries = filteredEntries.some(
    (entry) => entry.source === "fortunemeets",
  );
  const combinedMiguriEntries = useMemo(
    () =>
      periodEntries.filter(
        (entry) =>
          entry.source === "fortunemeets" &&
          (selectedGroup === "all" || entry.group === selectedGroup) &&
          (entry.category === "リアミ" ||
            entry.category === "全国ミーグリ"),
      ),
    [periodEntries, selectedGroup],
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
            const lostSpend = Math.max(0, paidSpend - wonSpend);
            totals.paid += paidSpend;
            if (entry.category === "サイン会") {
              totals.signPaid += paidSpend;
            }
            totals.rescue += entry.rescueTickets || 0;
            totals.rescueWon += entry.rescueWonTickets || 0;
            if ((entry.rescueTickets || 0) > 0 && entry.rescueWonTickets == null) {
              totals.rescueWonKnown = false;
            }
            return totals;
          },
          { paid: 0, signPaid: 0, rescue: 0, rescueWon: 0, rescueWonKnown: true },
        ),
    [filteredEntries, meetsDiscountPct],
  );
  const combinedMiguriSpend = useMemo(
    () =>
      combinedMiguriEntries.reduce(
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
          totals.paid += paidSpend;
          totals.lost += Math.max(0, paidSpend - wonSpend);
          return totals;
        },
        { paid: 0, lost: 0 },
      ),
    [combinedMiguriEntries, meetsDiscountPct],
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
      const { applied, won } = entryLotteryCounts(entry);
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

      <section aria-label={tr("filters")} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", ...years] as MiguriPeriod[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`min-h-11 rounded-full border px-4 text-xs font-semibold ${
                period === value
                  ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                  : "border-[var(--border-primary)] text-[var(--text-secondary)]"
              }`}
            >
              {value === "all" ? tr("periodAll") : tr("periodYear", { year: value })}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSharing(true)}
            disabled={dashboard.totalApplied === 0}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-indigo-600 px-4 text-xs font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Share2 size={14} /> {tr("shareOpen")}
          </button>
        </div>
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
              {tr("allGroups")}
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
              {tr("allCategories")}
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
        <div className="flex flex-wrap gap-2" aria-label={tr("syncState")}>
          {dashboard.sourceFreshness.slice(0, 6).map((item) => (
            <span
              key={`${item.source}-${item.group}`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              {item.source === "fortunemusic"
                ? "forTUNE music"
                : GROUP_LABELS[item.group as MiguriGroupId] || "Meets"}
              · {relativeSyncTime(item.syncedAt, tr)}
            </span>
          ))}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 sm:p-7">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)] lg:items-end">
          <div>
            <div className="text-sm font-semibold text-[var(--text-secondary)]">
              {selectedCategory === "all"
                ? tr("paid")
                : tr("paidOf", { category: selectedCategory })}
            </div>
            <div className="mt-2 text-5xl font-black tracking-[-0.055em] text-[var(--text-primary)] sm:text-7xl">
              <span className="mr-1 text-2xl font-semibold text-[var(--text-tertiary)] sm:text-4xl">
                ¥
              </span>
              {Math.round(dashboard.totalPaidSpendYen).toLocaleString("ja-JP")}
            </div>
            <SpendSparkline points={dashboard.spendTimeline} />
            {dashboard.topMember ? (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {tr("oshi")}{" "}
                <strong className="text-[var(--text-primary)]">
                  {dashboard.topMember.name}
                </strong>
                {" · "}
                {tr("oshiShare", { pct: formatPercent(dashboard.topMember.share) })}
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-tertiary)]">
                {tr("noPrice")}
              </p>
            )}
            <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">
              {tr("priceRule")}
            </p>
            {dashboard.estimatedSpendYen > 0 ? (
              <p className="mt-1 text-xs leading-5 text-amber-700">
                {tr("estimated", { yen: formatYen(dashboard.estimatedSpendYen) })}
              </p>
            ) : null}
            {dashboard.unpricedWonTickets > 0 ? (
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                {tr("unpriced", { n: dashboard.unpricedWonTickets })}
              </p>
            ) : null}
          </div>
          <div className="space-y-5">
            {hasMeetsEntries ? (
              <label className="block rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                <span className="flex items-center justify-between gap-4 text-sm font-bold text-[var(--text-primary)]">
                  <span>{tr("discount")}</span>
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
                  aria-label={tr("discount")}
                  className="mt-3 h-2 w-full cursor-pointer accent-indigo-600"
                />
                <span className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                  <span>
                    {selectedCategory === "all"
                      ? tr("meetsPaid")
                      : tr("meetsPaidOf", { category: selectedCategory })}
                  </span>
                  <strong className="shrink-0 tabular-nums text-[var(--text-primary)]">
                    {formatYen(meetsSpend.paid)}
                  </strong>
                </span>
                {selectedCategory === "all" || selectedCategory === "サイン会" ? (
                  <span className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>{tr("signPaid")}</span>
                    <strong className="shrink-0 tabular-nums text-[var(--text-primary)]">
                      {formatYen(meetsSpend.signPaid)}
                    </strong>
                  </span>
                ) : null}
                {selectedCategory === "all" ||
                selectedCategory === "リアミ" ||
                selectedCategory === "全国ミーグリ" ? (
                  <>
                    <span className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
                      <span>{tr("combinedPaid")}</span>
                      <strong className="shrink-0 tabular-nums text-[var(--text-primary)]">
                        {formatYen(combinedMiguriSpend.paid)}
                      </strong>
                    </span>
                    <span className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-primary)] pt-3 text-xs text-[var(--text-secondary)]">
                      <span>{tr("combinedLost")}</span>
                      <strong className="shrink-0 tabular-nums text-rose-600">
                        {formatYen(combinedMiguriSpend.lost)}
                      </strong>
                    </span>
                  </>
                ) : null}
                {meetsSpend.rescue > 0 ? (
                  <span className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>{tr("rescue")}</span>
                    <strong className="shrink-0 tabular-nums text-[var(--text-primary)]">
                      {tr("rescueCount", { n: meetsSpend.rescue })}
                      {meetsSpend.rescueWonKnown ? tr("rescueWon", { n: meetsSpend.rescueWon }) : ""}
                    </strong>
                  </span>
                ) : null}
                <span className="mt-3 block text-[11px] leading-5 text-[var(--text-tertiary)]">
                  {tr("meetsRule")}
                </span>
              </label>
            ) : null}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs leading-5 text-[var(--text-tertiary)]">
                  {tr("winRate")}
                  <br />
                  {tr("winRateScope")}
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {formatPercent(dashboard.winRate)}
                </div>
              </div>
              <div>
                <div className="text-xs leading-5 text-[var(--text-tertiary)]">
                  {tr("applied")}
                </div>
                <div className="mt-7 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {dashboard.totalApplied}
                </div>
              </div>
              <div>
                <div className="text-xs leading-5 text-[var(--text-tertiary)]">
                  {tr("won")}
                </div>
                <div className="mt-7 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {dashboard.totalWon}
                </div>
                {dashboard.totalLapsed > 0 && (
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {tr("lapsed", { n: dashboard.totalLapsed })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7">
          <span className="inline-flex rounded-full bg-indigo-500/10 px-3 py-1 text-sm font-bold text-indigo-600">
            {tr(`oshi_${dashboard.oshiType}` as MiguriText)}
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
              .join(tr("listSep"))}
          />
          {dashboard.topMember ? (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {tr("topSpend", { pct: formatPercent(dashboard.topMember.share), name: dashboard.topMember.name })}
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          {
            label:
              dashboard.estimatedSpendYen > 0
                ? selectedCategory === "all"
                  ? tr("wonSpendEstimated")
                  : tr("wonSpendEstimatedOf", { category: selectedCategory })
                : selectedCategory === "all"
                  ? tr("wonSpend")
                  : tr("wonSpendOf", { category: selectedCategory }),
            value: formatYen(dashboard.totalSpendYen),
            icon: CircleDollarSign,
            color: "text-indigo-500",
          },
          {
            label:
              selectedCategory === "all"
                ? tr("lostSpend")
                : tr("lostSpendOf", { category: selectedCategory }),
            value: formatYen(dashboard.lostSpendYen),
            icon: TrendingUp,
            color: "text-rose-500",
          },
          {
            label:
              selectedCategory === "all"
                ? tr("paidTotal")
                : tr("paidTotalOf", { category: selectedCategory }),
            value: formatYen(dashboard.totalPaidSpendYen),
            icon: CircleDollarSign,
            color: "text-pink-500",
          },
          {
            label: tr("upcoming"),
            value: `${dashboard.upcomingDates}`,
            icon: CalendarDays,
            color: "text-emerald-500",
          },
          {
            label: tr("members"),
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
              {tr("nextStop")}
            </h3>
          </div>
        </div>
        {nextStop ? (
          <div className="divide-y divide-[var(--border-primary)]">
            <div className="px-4 py-5 sm:px-6">
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                {displayDate(nextStop.date, tr)}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {nextStop.venues.length > 0
                  ? nextStop.venues.join(" · ")
                  : tr("venuePending")}
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
                        {categoryUnit(row.category, tr)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.slots.map((slot) => (
                      <span
                        key={slot.slot}
                        className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        {slot.slot > 0 ? tr("slotN", { n: slot.slot }) : tr("noSlot")} ·{" "}
                        {slot.tickets}
                        {categoryUnit(row.category, tr)}
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
                        {displayDate(stop.date, tr)}
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
            {tr("nextStopEmpty")}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-sky-500" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {tr("ranking")}
              </h3>
            </div>
            <div className="flex overflow-x-auto rounded-xl border border-[var(--border-primary)] p-1">
              {(
                [
                  ["spend", tr("rankSpend")],
                  ["won", tr("rankWon")],
                  ["rate", tr("rankRate")],
                  ["cost", tr("rankCost")],
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
                {tr("rankingEmpty")}
              </p>
            ) : null}
          </div>
          {memberRanking.length > 0 ? (
            <p className="mt-5 text-xs leading-5 text-[var(--text-tertiary)]">
              {tr("rankingNote")}
            </p>
          ) : null}
        </section>

        <Donut
          items={dashboard.categoryBreakdown}
          total={dashboard.totalPaidSpendYen}
        />
      </div>

      {winRateTrend.releases.length > 0 ? (
        <WinRateTrend trend={winRateTrend} />
      ) : null}

      <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <Ticket size={13} />
        {tr("footnote")}
      </p>

      {sharing ? (
        <MiguriShareDialog
          card={shareCard}
          recapEntries={periodEntries}
          empty={dashboard.totalApplied === 0}
          years={years}
          period={period}
          onPeriod={setPeriod}
          tr={tr}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </div>
  );
}
