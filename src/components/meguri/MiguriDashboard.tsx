import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Ticket,
  UserRound,
} from 'lucide-react';
import type { MiguriEntry } from '@/utils/auth-api';
import { aggregateMiguriDashboard } from './meguri-helpers';

export type MiguriAutoImportState = {
  status: 'idle' | 'saving' | 'success' | 'error';
  message: string;
  next: 'music' | 'meets' | 'done' | null;
};

type Props = {
  entries: MiguriEntry[];
  importState: MiguriAutoImportState;
  onOpenManualImport: () => void;
};

const MUSIC_URL = 'https://fortunemusic.jp/mypage/apply_list/';
const MEETS_URL = 'https://ticket.fortunemeets.app/hinatazaka46/';

function displayDate(date: string) {
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(`${date}T00:00:00+09:00`));
  return `${date}（${weekday}）`;
}

function categoryUnit(category: string) {
  return category === 'サイン会' ? '口' : '张';
}

function ImportStatus({ state }: { state: MiguriAutoImportState }) {
  if (state.status === 'idle') return null;
  const isSaving = state.status === 'saving';
  const isSuccess = state.status === 'success';
  const Icon = isSaving ? LoaderCircle : isSuccess ? CheckCircle2 : RefreshCw;

  return (
    <div
      className={`mt-4 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        isSuccess
          ? 'border-emerald-500/25 bg-emerald-500/10'
          : state.status === 'error'
            ? 'border-rose-500/25 bg-rose-500/10'
            : 'border-sky-500/25 bg-sky-500/10'
      }`}
      role={state.status === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          size={18}
          className={`mt-0.5 shrink-0 ${isSaving ? 'animate-spin text-sky-500' : isSuccess ? 'text-emerald-500' : 'text-rose-500'}`}
        />
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            {isSaving ? '正在自动保存' : isSuccess ? '自动导入完成' : '自动导入失败'}
          </div>
          <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{state.message}</p>
        </div>
      </div>
      {state.next === 'meets' && state.status === 'success' ? (
        <a
          href={MEETS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-primary)] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          继续登录 Meets <ArrowRight size={15} />
        </a>
      ) : null}
    </div>
  );
}

function ImportSetup({
  state,
  onOpenManualImport,
}: {
  state: MiguriAutoImportState;
  onOpenManualImport: () => void;
}) {
  const [bookmarkletHref, setBookmarkletHref] = useState('#');

  useEffect(() => {
    let mounted = true;
    fetch('/miguri-importer.js')
      .then((response) => response.text())
      .then((source) => {
        if (!mounted) return;
        const configured = source.replaceAll('__MIGURI_RETURN_ORIGIN__', window.location.origin);
        setBookmarkletHref(`javascript:${encodeURIComponent(configured)}`);
      })
      .catch(() => {
        if (mounted) setBookmarkletHref('#');
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
            <RefreshCw size={14} /> forTUNE 自动同步
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
            登录官方账号，然后一键带回应募履历
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
            46log 不接收 forTUNE 的账号、密码或 Cookie。书签只在你已登录的官方页面读取自己的履历，
            返回后直接保存到当前 46log 账号的私人 D1 数据中。
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
          <LockKeyhole size={17} className="shrink-0 text-emerald-500" />
          不保存 forTUNE 登录凭据
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
          <div className="text-xs font-bold text-sky-600">01 · 安装一次</div>
          <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--text-secondary)]">
            把按钮拖到浏览器书签栏；直接点击也会带你去 Music。
          </p>
          <a
            href={bookmarkletHref}
            draggable
            onClick={(event) => {
              if (bookmarkletHref === '#') event.preventDefault();
            }}
            className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              bookmarkletHref === '#'
                ? 'cursor-wait bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'
                : 'cursor-grab bg-sky-600 text-white hover:bg-sky-700 active:cursor-grabbing'
            }`}
          >
            <RefreshCw size={16} /> 咪咕力自动导入
          </a>
        </div>

        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
          <div className="text-xs font-bold text-violet-600">02 · 登录 Music</div>
          <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--text-secondary)]">
            打开申请履历页并完成官方登录，再点击刚安装的书签。
          </p>
          <a
            href={MUSIC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:border-violet-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            登录 forTUNE music <ExternalLink size={15} />
          </a>
        </div>

        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
          <div className="text-xs font-bold text-pink-600">03 · 登录 Meets</div>
          <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--text-secondary)]">
            打开官方 Meets；若未登录，书签会带到实际活动登录页。
          </p>
          <a
            href={MEETS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:border-pink-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            登录 forTUNE meets <ExternalLink size={15} />
          </a>
        </div>
      </div>

      <ImportStatus state={state} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
        <span>Chrome / Edge 桌面版体验最佳；读取期间请保持官方页面在前台。</span>
        <button
          type="button"
          onClick={onOpenManualImport}
          className="min-h-11 rounded-xl px-3 font-medium text-sky-600 hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          无法自动读取？使用粘贴导入
        </button>
      </div>
    </section>
  );
}

function Breakdown({
  title,
  items,
}: {
  title: string;
  items: ReturnType<typeof aggregateMiguriDashboard>['categoryBreakdown'];
}) {
  return (
    <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <BarChart3 size={16} className="text-sky-500" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
      </div>
      {items.length > 0 ? (
        <div className="mt-4 space-y-4">
          {items.slice(0, 6).map((item) => (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-[var(--text-secondary)]">{item.label}</span>
                <span className="shrink-0 tabular-nums text-[var(--text-primary)]">
                  {item.tickets} · {Math.round(item.percentage * 100)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{ width: `${Math.max(3, item.percentage * 100)}%` }}
                  role="img"
                  aria-label={`${item.label} ${item.tickets}，占 ${Math.round(item.percentage * 100)}%`}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-tertiary)]">导入履历后会显示分布。</p>
      )}
    </section>
  );
}

export default function MiguriDashboard({ entries, importState, onOpenManualImport }: Props) {
  const dashboard = useMemo(() => aggregateMiguriDashboard(entries), [entries]);
  const nextStop = dashboard.nextStops[0];

  const metrics = [
    { label: '总口数 / 张数', value: dashboard.totalTickets, icon: Ticket, color: 'text-amber-500' },
    { label: '未来日期', value: dashboard.upcomingDates, icon: CalendarDays, color: 'text-emerald-500' },
    { label: '活动类型', value: dashboard.categoryBreakdown.length, icon: BarChart3, color: 'text-violet-500' },
    { label: '成员', value: dashboard.memberBreakdown.length, icon: UserRound, color: 'text-sky-500' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <ImportSetup state={importState} onOpenManualImport={onOpenManualImport} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <Icon size={15} className={metric.color} />
                {metric.label}
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{metric.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <section className="overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)]">
          <div className="border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-4 sm:px-6">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">下一站</div>
            {nextStop ? (
              <>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                  {displayDate(nextStop.date)}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {nextStop.venues.length > 0 ? nextStop.venues.join(' · ') : '会场信息待官方履历补充'}
                </p>
              </>
            ) : (
              <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">暂时没有未来行程</h2>
            )}
          </div>

          {nextStop ? (
            <div className="divide-y divide-[var(--border-primary)]">
              {nextStop.rows.map((row) => (
                <div key={`${row.member}-${row.category}`} className="px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">{row.member}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        {row.category} · <span className="font-semibold tabular-nums">{row.tickets}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {row.slots.map((slot) => (
                        <span
                          key={slot.slot}
                          className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
                        >
                          {slot.slot > 0 ? `第${slot.slot}部` : '部数未取得'} · {slot.tickets}{categoryUnit(row.category)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm leading-6 text-[var(--text-tertiary)] sm:px-6">
              登录 Music / Meets 并点击导入书签后，下一站会自动出现。
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-emerald-500" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">之后的日程</h3>
          </div>
          {dashboard.nextStops.length > 1 ? (
            <div className="mt-3 divide-y divide-[var(--border-primary)]">
              {dashboard.nextStops.slice(1, 6).map((stop) => (
                <div key={stop.date} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{displayDate(stop.date)}</span>
                    <span className="text-xs tabular-nums text-[var(--text-tertiary)]">{stop.tickets}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                    {stop.rows.map((row) => `${row.member} ${row.category}·${row.tickets}`).join(' / ')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[var(--text-tertiary)]">后续日期会在这里按时间顺序排列。</p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="类型分布" items={dashboard.categoryBreakdown} />
        <Breakdown title="成员分布" items={dashboard.memberBreakdown} />
      </div>
    </div>
  );
}
