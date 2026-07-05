import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ListOrdered, Users } from 'lucide-react';
import { getMiguriSoldOut, type MiguriSoldOutPayload } from '@/utils/auth-api';
import {
  computeSoldOutAnalysis,
  formatDateShort,
  getCellRound,
  sortByGeneration,
  sortBySoldOut,
  type GenerationSummary,
  type MemberSoldOutInfo,
  type SoldOutAnalysis,
} from './soldout-analysis';

type SortMode = 'generation' | 'soldout';

const THEME = {
  sakurazaka: {
    accent: '#e91e63', accentLight: '#f48fb1', accentBg: '#fce4ec',
    headerBg: '#f8bbd0', cellSolid: '#f48fb1',
    genHeaderBg: 'linear-gradient(90deg, #f8bbd0 0%, #fce4ec 100%)',
  },
  hinatazaka: {
    accent: '#0097a7', accentLight: '#4dd0e1', accentBg: '#e0f7fa',
    headerBg: '#b2ebf2', cellSolid: '#4dd0e1',
    genHeaderBg: 'linear-gradient(90deg, #b2ebf2 0%, #e0f7fa 100%)',
  },
  nogizaka: {
    accent: '#7b1fa2', accentLight: '#ba68c8', accentBg: '#f3e5f5',
    headerBg: '#ce93d8', cellSolid: '#ba68c8',
    genHeaderBg: 'linear-gradient(90deg, #ce93d8 0%, #f3e5f5 100%)',
  },
};

function getCellColor(round: number | null, maxRound: number, theme: typeof THEME.sakurazaka): string | undefined {
  if (round === null) return 'var(--bg-primary)';
  if (maxRound <= 1) return theme.cellSolid;
  const t = 1 - (round - 1) / Math.max(1, maxRound - 1);
  const alpha = 0.4 + t * 0.6;
  return theme.cellSolid + Math.round(alpha * 255).toString(16).padStart(2, '0');
}

function SoldOutCell({ round, maxRound, theme }: { round: number | null; maxRound: number; theme: typeof THEME.sakurazaka }) {
  const bg = getCellColor(round, maxRound, theme);
  return (
    <td
      className="p-0 text-center border-r border-b"
      style={{ width: 22, minWidth: 22, height: 22, backgroundColor: bg, borderColor: 'rgba(0,0,0,0.06)' }}
    >
      {round !== null && (
        <span className="text-[10px] font-semibold leading-none text-white">{round}</span>
      )}
    </td>
  );
}

function MemberNameCell({
  member,
  rank,
  theme,
  showRank,
}: {
  member: MemberSoldOutInfo;
  rank?: number;
  theme: typeof THEME.sakurazaka;
  showRank: boolean;
}) {
  const round = member.fullSoldOutRound;
  return (
    <td
      className="sticky left-0 z-10 whitespace-nowrap border-r px-2 py-1 text-xs"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', minWidth: 140 }}
    >
      <div className="flex items-center gap-1.5">
        {showRank && rank != null && (
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: rank <= 3 ? theme.accent : 'var(--text-tertiary)' }}
          >
            {rank}
          </span>
        )}
        {round !== null && (
          <span className="font-bold text-[10px]" style={{ color: theme.accent }}>({round}次完売)</span>
        )}
        <span className="font-medium text-[var(--text-primary)]">{member.name}</span>
      </div>
    </td>
  );
}

function StatCell({ member }: { member: MemberSoldOutInfo }) {
  return (
    <td
      className="sticky right-0 z-10 whitespace-nowrap border-l px-2 py-1 text-right text-xs tabular-nums"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <span className="font-semibold text-[var(--text-primary)]">{member.soldOutCount}</span>
      <span className="text-[var(--text-tertiary)]">/{member.totalCount}</span>
    </td>
  );
}

export default function SoldOutMatrix({ eventSlug }: { eventSlug: string }) {
  const [data, setData] = useState<MiguriSoldOutPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('generation');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError('');
    getMiguriSoldOut(eventSlug).then((res) => {
      if (!mounted) return;
      if (!res.success || !res.data) {
        setError(res.message || '完售数据加载失败');
      } else {
        setData(res.data);
      }
      setIsLoading(false);
    });
    return () => { mounted = false; };
  }, [eventSlug]);

  const analysis = useMemo<SoldOutAnalysis | null>(() => {
    if (!data) return null;
    return computeSoldOutAnalysis(data, selectedRound ?? undefined);
  }, [data, selectedRound]);

  const sortedMembers = useMemo(() => {
    if (!analysis) return [];
    return sortMode === 'generation'
      ? sortByGeneration(analysis.members)
      : sortBySoldOut(analysis.members);
  }, [analysis, sortMode]);

  const maxRound = useMemo(() => {
    if (!analysis) return 1;
    return Math.max(1, ...analysis.rounds.map((r) => r.round));
  }, [analysis]);

  const generationGroups = useMemo(() => {
    if (!analysis || sortMode !== 'generation') return null;
    const groups: { gen: GenerationSummary; members: MemberSoldOutInfo[] }[] = [];
    const genOrder = analysis.generations.map((g) => g.generation);

    for (const gen of analysis.generations) {
      groups.push({
        gen,
        members: sortedMembers.filter((m) => m.generation === gen.generation),
      });
    }
    const unknowns = sortedMembers.filter((m) => !genOrder.includes(m.generation));
    if (unknowns.length > 0) {
      groups.push({
        gen: {
          generation: '不明',
          soldOutCount: unknowns.reduce((s, m) => s + m.soldOutCount, 0),
          totalCount: unknowns.reduce((s, m) => s + m.totalCount, 0),
        },
        members: unknowns,
      });
    }
    return groups;
  }, [sortMode, sortedMembers, analysis]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-tertiary)] border-t-transparent" />
        <span className="text-xs text-[var(--text-tertiary)]">完售数据加载中…</span>
      </div>
    );
  }

  if (error || !analysis) {
    return <div className="text-center py-8 text-sm text-rose-500">{error || '暂无完售数据'}</div>;
  }

  if (analysis.rounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--text-tertiary)]">
        <BarChart3 size={28} className="opacity-30" />
        <span className="text-sm">暂无完售记录</span>
        <span className="text-xs opacity-60">等待下一轮受付结束后自动生成</span>
      </div>
    );
  }

  const theme = THEME[analysis.event.group as keyof typeof THEME] || THEME.sakurazaka;
  const { dates, slotNumbers } = analysis;
  const totalCols = dates.length * slotNumbers.length;
  const pctSold = analysis.totalCells > 0 ? Math.round((analysis.totalSoldOut / analysis.totalCells) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3">
        <div className="flex-1 min-w-[200px]">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums" style={{ color: theme.accent }}>{analysis.totalSoldOut}</span>
            <span className="text-xs text-[var(--text-tertiary)]">/ {analysis.totalCells} 枠</span>
            <span className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: theme.accent }}>
              {pctSold}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: theme.accentBg }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctSold}%`, backgroundColor: theme.accent }} />
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <div><span className="font-semibold text-[var(--text-primary)]">{analysis.members.length}</span> 成员</div>
          <div><span className="font-semibold text-[var(--text-primary)]">{dates.length}</span> 日程</div>
          <div><span className="font-semibold text-[var(--text-primary)]">{slotNumbers.length}</span> 部制</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg overflow-hidden border border-[var(--border-primary)]">
          {([
            { key: 'generation' as SortMode, label: '期別顺', icon: Users },
            { key: 'soldout' as SortMode, label: '完售顺', icon: ListOrdered },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortMode(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                sortMode === key
                  ? 'text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
              style={sortMode === key ? { backgroundColor: theme.accent } : {}}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {analysis.rounds.length > 1 && (
          <select
            className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs cursor-pointer"
            value={selectedRound ?? ''}
            onChange={(e) => setSelectedRound(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">全轮次累计</option>
            {analysis.rounds.map((r) => (
              <option key={r.round} value={r.round}>{r.windowLabel || `第${r.round}次結果`}</option>
            ))}
          </select>
        )}
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-primary)]">
        <table className="w-full border-collapse text-xs" style={{ minWidth: totalCols * 22 + 240 }}>
          <thead>
            {/* Date header row */}
            <tr>
              <th
                className="sticky left-0 z-20 border-r border-b px-2 py-2 text-left text-[10px] font-bold"
                style={{ backgroundColor: theme.headerBg, borderColor: 'rgba(0,0,0,0.08)', minWidth: 140 }}
                rowSpan={2}
              >
                成员
              </th>
              {dates.map((date) => (
                <th
                  key={date}
                  colSpan={slotNumbers.length}
                  className="border-b px-0 py-2 text-center text-[10px] font-bold"
                  style={{ backgroundColor: theme.headerBg, borderLeft: '1px solid rgba(0,0,0,0.08)', borderColor: 'rgba(0,0,0,0.08)' }}
                >
                  {formatDateShort(date)}
                </th>
              ))}
              <th
                className="sticky right-0 z-20 border-l border-b px-2 py-2 text-right text-[10px] font-semibold tabular-nums"
                style={{ backgroundColor: theme.headerBg, borderColor: 'rgba(0,0,0,0.08)' }}
                rowSpan={2}
              >
                {analysis.totalSoldOut}/{analysis.totalCells}
              </th>
            </tr>
            {/* Slot number header row */}
            {sortMode === 'generation' && (
              <tr>
                {dates.map((date) =>
                  slotNumbers.map((slot) => (
                    <th
                      key={`${date}-${slot}`}
                      className="border-b px-0 py-0.5 text-center text-[9px] font-normal text-[var(--text-tertiary)]"
                      style={{ width: 22, minWidth: 22, backgroundColor: theme.accentBg, borderColor: 'rgba(0,0,0,0.06)' }}
                    >
                      {slot}
                    </th>
                  )),
                )}
              </tr>
            )}
            {sortMode === 'soldout' && (
              <tr>
                {dates.map((date) =>
                  slotNumbers.map((slot) => (
                    <th
                      key={`${date}-${slot}`}
                      className="border-b px-0 py-0.5 text-center text-[9px] font-normal text-[var(--text-tertiary)]"
                      style={{ width: 22, minWidth: 22, backgroundColor: theme.accentBg, borderColor: 'rgba(0,0,0,0.06)' }}
                    >
                      {slot}
                    </th>
                  )),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {sortMode === 'generation' && generationGroups
              ? generationGroups.map(({ gen, members }) => (
                  <React.Fragment key={gen.generation}>
                    {/* Generation separator */}
                    <tr>
                      <td
                        colSpan={totalCols + 2}
                        className="px-2 py-1.5 text-xs font-bold"
                        style={{ background: theme.genHeaderBg }}
                      >
                        <div className="flex items-center justify-between">
                          <span>{gen.generation}</span>
                          <span className="tabular-nums font-semibold">
                            {gen.soldOutCount}/{gen.totalCount}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {members.map((member) => (
                      <tr key={member.name} className="transition-colors hover:bg-black/[0.02]">
                        <MemberNameCell member={member} theme={theme} showRank={false} />
                        {dates.map((date) =>
                          slotNumbers.map((slot) => (
                            <SoldOutCell key={`${date}-${slot}`} round={getCellRound(member, date, slot)} maxRound={maxRound} theme={theme} />
                          )),
                        )}
                        <StatCell member={member} />
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              : sortedMembers.map((member, idx) => (
                  <tr key={member.name} className="transition-colors hover:bg-black/[0.02]">
                    <MemberNameCell member={member} rank={idx + 1} theme={theme} showRank />
                    {dates.map((date) =>
                      slotNumbers.map((slot) => (
                        <SoldOutCell key={`${date}-${slot}`} round={getCellRound(member, date, slot)} maxRound={maxRound} theme={theme} />
                      )),
                    )}
                    <StatCell member={member} />
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
