import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ExternalLink,
  Loader2,
  RefreshCcw,
  Ticket,
  Users,
} from 'lucide-react';
import {
  getMiguriLottery,
  type FortuneMeetsAwardAnalysis,
  type FortuneMeetsLotteryPayload,
  type FortuneMeetsMode,
  type MiguriGroupId,
} from '@/utils/auth-api';
import { resolveFortuneMeetsSource } from './meguri-helpers';

type TicketLedger = {
  owned: number;
  used: number;
  planned: number;
};

const MODE_LABEL: Record<FortuneMeetsMode, string> = {
  real: 'リアルミーグリ',
  online: 'オンラインミーグリ',
};

const THEME = {
  sakurazaka: {
    accent: '#e91e63', accentLight: '#f48fb1', accentBg: '#fce4ec',
    headerBg: '#f8bbd0', cellSolid: '#f48fb1',
  },
  hinatazaka: {
    accent: '#0097a7', accentLight: '#4dd0e1', accentBg: '#e0f7fa',
    headerBg: '#b2ebf2', cellSolid: '#4dd0e1',
  },
  nogizaka: {
    accent: '#7b1fa2', accentLight: '#ba68c8', accentBg: '#f3e5f5',
    headerBg: '#ce93d8', cellSolid: '#ba68c8',
  },
} satisfies Record<MiguriGroupId, {
  accent: string;
  accentLight: string;
  accentBg: string;
  headerBg: string;
  cellSolid: string;
}>;

type Theme = (typeof THEME)[MiguriGroupId];

function getTheme(group: string | undefined): Theme {
  return THEME[group as MiguriGroupId] || THEME.sakurazaka;
}

function storageKey(eventId: string) {
  return `miguri-lottery-ticket-ledger:${eventId}`;
}

function loadLedger(eventId: string): TicketLedger {
  if (typeof window === 'undefined') return { owned: 0, used: 0, planned: 0 };
  try {
    const raw = window.localStorage.getItem(storageKey(eventId));
    if (!raw) return { owned: 0, used: 0, planned: 0 };
    const parsed = JSON.parse(raw) as Partial<TicketLedger>;
    return {
      owned: Math.max(0, Number(parsed.owned || 0)),
      used: Math.max(0, Number(parsed.used || 0)),
      planned: Math.max(0, Number(parsed.planned || 0)),
    };
  } catch {
    return { owned: 0, used: 0, planned: 0 };
  }
}

function saveLedger(eventId: string, ledger: TicketLedger) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(eventId), JSON.stringify(ledger));
}

function formatDate(date: string) {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function shortTitle(title: string) {
  return title.length > 42 ? `${title.slice(0, 41)}…` : title;
}

function groupSlotsByDate(award: FortuneMeetsAwardAnalysis) {
  const map = new Map<string, typeof award.slots>();
  for (const slot of award.slots) {
    const list = map.get(slot.date) || [];
    list.push(slot);
    map.set(slot.date, list);
  }
  return Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function memberClosedSet(award: FortuneMeetsAwardAnalysis, member: string) {
  const set = new Set<string>();
  for (const slot of award.slots) {
    if (slot.closedMembers.includes(member)) set.add(slot.id);
  }
  return set;
}

function AwardMatrix({ award, theme }: { award: FortuneMeetsAwardAnalysis; theme: Theme }) {
  const slotGroups = useMemo(() => groupSlotsByDate(award), [award]);
  const slots = award.slots;
  const topMembers = award.memberSummaries;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: '关闭枠', value: `${award.closedCells}/${award.totalCells}` },
          { label: '关闭率', value: `${award.closedRate}%` },
          { label: '成员/组合', value: award.members.length },
          { label: '日程/部', value: `${slotGroups.length}/${slots.length}` },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
            <div className="text-[11px] font-medium text-[var(--text-tertiary)]">{item.label}</div>
            <div className="mt-1 text-xl font-bold text-[var(--text-primary)]">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border-primary)]">
        <table className="min-w-[920px] w-full border-collapse bg-[var(--bg-primary)] text-xs">
          <thead>
            <tr style={{ backgroundColor: theme.headerBg, color: '#fff' }}>
              <th
                className="sticky left-0 z-10 w-40 border-b border-r px-3 py-2 text-left font-bold"
                style={{ backgroundColor: theme.headerBg, borderColor: 'rgba(0,0,0,0.08)' }}
              >
                成员
              </th>
              {slotGroups.map(([date, dateSlots]) => (
                <th
                  key={date}
                  colSpan={dateSlots.length}
                  className="border-b border-r px-2 py-2 text-center font-bold"
                  style={{ borderColor: 'rgba(0,0,0,0.08)' }}
                >
                  {formatDate(date)}
                  {dateSlots[0]?.venue ? <span className="ml-1 font-medium opacity-85">{dateSlots[0].venue}</span> : null}
                </th>
              ))}
              <th
                className="w-20 border-b px-3 py-2 text-right font-bold"
                style={{ borderColor: 'rgba(0,0,0,0.08)' }}
              >
                关闭
              </th>
            </tr>
            <tr style={{ backgroundColor: theme.accentBg, color: '#777' }}>
              <th
                className="sticky left-0 z-10 border-b border-r px-3 py-1 text-left font-medium"
                style={{ backgroundColor: theme.accentBg, borderColor: 'rgba(0,0,0,0.06)' }}
              />
              {slotGroups.flatMap(([, dateSlots]) => dateSlots.map((slot) => (
                <th
                  key={slot.id}
                  className="w-10 border-b border-r px-1 py-1 text-center font-medium"
                  style={{ borderColor: 'rgba(0,0,0,0.06)' }}
                >
                  {slot.part}
                </th>
              )))}
              <th className="border-b px-3 py-1" style={{ borderColor: 'rgba(0,0,0,0.06)' }} />
            </tr>
          </thead>
          <tbody>
            {topMembers.map((member, index) => {
              const closed = memberClosedSet(award, member.name);
              return (
                <tr key={member.name} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-inherit px-3 py-2 font-semibold text-[var(--text-primary)]">
                    {member.name}
                  </td>
                  {slots.map((slot) => {
                    const available = slot.members.includes(member.name);
                    const isClosed = closed.has(slot.id);
                    return (
                      <td
                        key={slot.id}
                        className="h-8 border-b border-r text-center font-bold"
                        style={{
                          borderColor: 'rgba(0,0,0,0.06)',
                          backgroundColor: isClosed ? theme.cellSolid : available ? '#fff' : '#f4f5f7',
                          color: isClosed ? '#fff' : 'transparent',
                        }}
                      >
                        {isClosed ? '×' : ''}
                      </td>
                    );
                  })}
                  <td className="border-b border-slate-100 px-3 py-2 text-right font-bold text-[var(--text-primary)]">
                    {member.closedCount}/{member.totalCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TicketLedgerPanel({ eventId, theme }: { eventId: string; theme: Theme }) {
  const [ledger, setLedger] = useState<TicketLedger>(() => loadLedger(eventId));

  useEffect(() => {
    setLedger(loadLedger(eventId));
  }, [eventId]);

  useEffect(() => {
    saveLedger(eventId, ledger);
  }, [eventId, ledger]);

  const remaining = Math.max(0, ledger.owned - ledger.used - ledger.planned);
  const fields: Array<{ key: keyof TicketLedger; label: string }> = [
    { key: 'owned', label: '持有券数' },
    { key: 'planned', label: '计划投入' },
    { key: 'used', label: '已消耗' },
  ];

  return (
    <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
      <div className="flex items-center gap-2">
        <Ticket size={16} style={{ color: theme.accent }} />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">応募券管理</h3>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="text-[11px] font-medium text-[var(--text-tertiary)]">{field.label}</span>
            <input
              type="number"
              min={0}
              value={ledger[field.key]}
              onChange={(event) => setLedger((current) => ({
                ...current,
                [field.key]: Math.max(0, Number(event.target.value || 0)),
              }))}
              className="mt-1 h-10 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--lottery-accent-light)]"
              style={{ '--lottery-accent-light': theme.accentLight } as CSSProperties}
            />
          </label>
        ))}
        <div
          className="rounded-xl border px-3 py-2"
          style={{ borderColor: theme.accentBg, backgroundColor: theme.accentBg }}
        >
          <div className="text-[11px] font-medium" style={{ color: theme.accent }}>剩余可分配</div>
          <div className="mt-1 text-xl font-black" style={{ color: theme.accent }}>{remaining}</div>
        </div>
      </div>
    </div>
  );
}

type Props = {
  group: MiguriGroupId;
  eventTitle: string;
};

export default function LotteryAnalysisPanel({ group, eventTitle }: Props) {
  const [data, setData] = useState<FortuneMeetsLotteryPayload | null>(null);
  const [mode, setMode] = useState<FortuneMeetsMode>('real');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const source = useMemo(
    () => resolveFortuneMeetsSource(group, eventTitle),
    [eventTitle, group],
  );

  async function load() {
    setLoading(true);
    setError('');
    if (!source) {
      setError('当前活动标题无法匹配对应的 forTUNE meets 全握数据');
      setData(null);
      setLoading(false);
      return;
    }
    const res = await getMiguriLottery(source.artist, source.event);
    if (!res.success || !res.data) {
      setError(res.message || res.error || '全握数据加载失败');
      setData(null);
      setLoading(false);
      return;
    }
    setData(res.data);
    const availableModes = new Set(res.data.awards.map((award) => award.mode));
    setMode((current) => (availableModes.has(current) ? current : (res.data!.awards[0]?.mode || 'real')));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [source?.artist, source?.event]);

  const award = useMemo(() => data?.awards.find((item) => item.mode === mode) || data?.awards[0] || null, [data, mode]);
  const theme = getTheme(award?.group || data?.group);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
        <Loader2 size={16} className="animate-spin" />
        全握データ加载中…
      </div>
    );
  }

  if (error || !data || !award) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">
        {error || '没有可用的全握分析数据'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ backgroundColor: theme.accentBg, color: theme.accent }}
            >
              全国ミーグリ / 応募抽選
            </span>
            <span className="text-xs font-medium text-[var(--text-tertiary)]">{data.artistName}</span>
          </div>
          <h3 className="mt-2 text-lg font-black leading-snug text-[var(--text-primary)]">{shortTitle(award.name)}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--text-secondary)]">
              ticket.fortunemeets.app <ExternalLink size={12} />
            </a>
            <span>更新 {new Date(data.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo' })}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <RefreshCcw size={14} /> 更新
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {data.awards.map((item) => (
          <button
            key={item.awardId}
            type="button"
            onClick={() => setMode(item.mode)}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${
              mode === item.mode
                ? ''
                : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            style={mode === item.mode ? {
              borderColor: theme.accentLight,
              backgroundColor: theme.accentBg,
              color: theme.accent,
            } : undefined}
          >
            <Users size={15} />
            {MODE_LABEL[item.mode]}
          </button>
        ))}
      </div>

      <AwardMatrix award={award} theme={theme} />
      <TicketLedgerPanel eventId={data.eventId} theme={theme} />
    </div>
  );
}
