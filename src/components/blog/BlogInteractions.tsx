import { Fragment, useEffect, useMemo, useState } from 'react';
import { GROUPS, getApiBaseUrl, type GroupKey } from './blog-config';
import { formatInteractionMonth, getInteractionGroupMonths, getLatestInteractionMonth } from './blog-insights.js';

type InteractionTab = 'mentions' | 'ranking' | 'generation';

interface MentionTarget {
  name: string;
  count: number;
}

interface MentionRow {
  mentioner: string;
  targets: MentionTarget[];
  total: number;
}

interface RankingItem {
  name: string;
  gen: string;
  count: number;
}

interface GenerationMatrix {
  generations: string[];
  matrix: number[][];
}

interface GenDetailMention {
  name: string;
  gen: string;
  count: number;
}

interface GenDetail {
  gen: string;
  topMentioned: GenDetailMention[];
}

interface GenReceivedMember {
  name: string;
  count: number;
  mainSource: string;
  mainCount: string | number;
}

interface GenReceived {
  gen: string;
  members: GenReceivedMember[];
}

interface InteractionMonthData {
  group: string;
  yearMonth: string;
  blogCount: number;
  mentions: MentionRow[];
  ranking: RankingItem[];
  generationMatrix: GenerationMatrix;
  genDetails: GenDetail[];
  genReceived: GenReceived[];
}

type InteractionDataMap = Partial<Record<GroupKey, Record<string, InteractionMonthData>>>;

async function loadInteractionData(): Promise<InteractionDataMap> {
  const apiBase = getApiBaseUrl();
  try {
    const resp = await fetch(`${apiBase}/api/interactions/all`);
    if (resp.ok) {
      const json = await resp.json();
      if (json?.data) return json.data as InteractionDataMap;
    }
  } catch {}

  const fallback = await fetch('/data/interactions.json');
  if (!fallback.ok) {
    throw new Error('互动分析数据加载失败');
  }
  return await fallback.json();
}

export default function BlogInteractions() {
  const [data, setData] = useState<InteractionDataMap>({});
  const [group, setGroup] = useState<GroupKey>('sakurazaka');
  const [tab, setTab] = useState<InteractionTab>('mentions');
  const [monthKey, setMonthKey] = useState('');
  const [currentGenTab, setCurrentGenTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const loaded = await loadInteractionData();
        if (cancelled) return;
        setData(loaded);
        const latest = getLatestInteractionMonth(loaded, 'sakurazaka');
        setMonthKey(latest || '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '互动分析加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const months = useMemo(() => getInteractionGroupMonths(data, group), [data, group]);

  useEffect(() => {
    const latest = getLatestInteractionMonth(data, group);
    setMonthKey(latest || '');
  }, [data, group]);

  const current = data[group]?.[monthKey];

  useEffect(() => {
    const firstGen = current?.generationMatrix?.generations?.[0] || '';
    setCurrentGenTab(firstGen);
  }, [monthKey, current?.generationMatrix?.generations]);

  function moveMonth(direction: -1 | 1) {
    const index = months.indexOf(monthKey);
    if (index === -1) return;
    const next = months[index + direction];
    if (next) setMonthKey(next);
  }

  function getCellColor(value: number, maxValue: number) {
    if (value === 0) return { bg: 'var(--bg-tertiary)', text: 'var(--text-tertiary)' };
    const ratio = maxValue > 0 ? value / maxValue : 0;
    if (ratio > 0.7) return { bg: 'var(--color-brand-nogi)', text: 'white' };
    if (ratio > 0.4) return { bg: 'var(--color-brand-nogi-light, #9b4dca)', text: 'white' };
    if (ratio > 0.2) return { bg: 'var(--bg-secondary)', text: 'var(--text-secondary)' };
    return { bg: 'var(--bg-tertiary)', text: 'var(--text-tertiary)' };
  }

  if (loading) {
    return <div className="loading-state">正在加载互动分析数据...</div>;
  }

  if (error) {
    return <div className="empty-state">{error}</div>;
  }

  return (
    <div className="interaction-page-container page-container">
      <div className="group-tabs" id="groupTabs">
        {(['sakurazaka', 'nogizaka', 'hinatazaka'] as GroupKey[]).map((item) => (
          <button
            key={item}
            className={`group-tab ${group === item ? 'active' : ''}`}
            type="button"
            onClick={() => setGroup(item)}
          >
            {GROUPS[item].name}
          </button>
        ))}
      </div>

      <div className="month-selector">
        <button className="month-nav-btn" type="button" onClick={() => moveMonth(-1)} disabled={months.indexOf(monthKey) <= 0}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="month-display" id="monthDisplay">{formatInteractionMonth(monthKey)}</div>
        <button className="month-nav-btn" type="button" onClick={() => moveMonth(1)} disabled={months.indexOf(monthKey) === -1 || months.indexOf(monthKey) >= months.length - 1}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div className="panel" style={{ padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          关系分析按周更新，默认展示最近一次周更结果，并非实时统计。
          <br />
          每月1日会补全上个月的最终统计数据。
        </div>
      </div>

      <div className="analysis-tabs">
        <button className={`analysis-tab ${tab === 'mentions' ? 'active' : ''}`} type="button" onClick={() => setTab('mentions')}>提及关系</button>
        <button className={`analysis-tab ${tab === 'ranking' ? 'active' : ''}`} type="button" onClick={() => setTab('ranking')}>被提及排行</button>
        <button className={`analysis-tab ${tab === 'generation' ? 'active' : ''}`} type="button" onClick={() => setTab('generation')}>期别互动</button>
      </div>

      {!current ? (
        <div className="empty-state">
          <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>暂无数据</h3>
          <p>该月份暂无互动分析数据</p>
        </div>
      ) : tab === 'mentions' ? (
        <MentionsPanel data={current} />
      ) : tab === 'ranking' ? (
        <RankingPanel data={current} />
      ) : (
        <GenerationPanel data={current} currentGenTab={currentGenTab} onGenTabChange={setCurrentGenTab} getCellColor={getCellColor} />
      )}
    </div>
  );
}

function MentionsPanel({ data }: { data: InteractionMonthData }) {
  const sorted = [...(data.mentions || [])].sort((a, b) => b.total - a.total);

  return (
    <div className="panel">
      <div className="panel-title">{data.group} {data.yearMonth.replace('-', '年')}月 成员互相提及分析</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="mention-table">
          <thead>
            <tr>
              <th>成员</th>
              <th>提及对象</th>
              <th style={{ textAlign: 'right' }}>合计</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.mentioner}>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{item.mentioner}</td>
                <td>
                  <div className="mention-targets">
                    {item.targets.map((target) => (
                      <span key={`${item.mentioner}-${target.name}`} className="mention-tag">
                        {target.name} <span className="count">{target.count}次</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-brand-nogi, #742581)' }}>{item.total}次</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankingPanel({ data }: { data: InteractionMonthData }) {
  const maxCount = data.ranking?.[0]?.count || 1;
  const colors = ['#7e57c2', '#9575cd', '#b39ddb', '#ce93d8', '#e1bee7'];

  return (
    <div className="panel">
      <div className="panel-title">{data.group} {data.yearMonth.replace('-', '年')}月 被提及总排行</div>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>谁是本月的“话题中心”——被其他成员在博客中提到最多的人</p>
      {(data.ranking || []).map((item, index) => {
        const pct = Math.round((item.count / maxCount) * 100);
        const numClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : 'normal';
        const color = colors[Math.min(index, colors.length - 1)];
        return (
          <div className="ranking-item" key={item.name}>
            <div className={`ranking-number ${numClass}`}>{index + 1}</div>
            <div className="ranking-name">{item.name}</div>
            <div className="ranking-gen">{item.gen}</div>
            <div className="ranking-bar-wrapper">
              <div className="ranking-bar" style={{ width: `${pct}%`, background: color }}>
                {pct > 15 ? <span className="ranking-bar-label">{item.count}次</span> : null}
              </div>
            </div>
            <div className="ranking-count">{item.count}次</div>
          </div>
        );
      })}
    </div>
  );
}

function GenerationPanel({
  data,
  currentGenTab,
  onGenTabChange,
  getCellColor,
}: {
  data: InteractionMonthData;
  currentGenTab: string;
  onGenTabChange: (value: string) => void;
  getCellColor: (value: number, maxValue: number) => { bg: string; text: string };
}) {
  const generations = data.generationMatrix?.generations || [];
  const matrix = data.generationMatrix?.matrix || [];
  const maxValue = Math.max(0, ...matrix.flat());
  const activeDetail = data.genDetails?.find((item) => item.gen === currentGenTab);
  const activeReceived = data.genReceived?.find((item) => item.gen === currentGenTab);

  return (
    <>
      <div className="panel">
        <div className="panel-title">{data.group} {data.yearMonth.replace('-', '年')}月 期别互动分析</div>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>期别间的提及热力图——数字越大颜色越深</p>
        <div className="heatmap-grid" style={{ gridTemplateColumns: `80px repeat(${generations.length}, 1fr)`, maxWidth: generations.length > 4 ? '100%' : 400 }}>
          <div className="heatmap-header" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>提及 → 被提及</div>
          {generations.map((generation) => <div key={`head-${generation}`} className="heatmap-header">{generation}</div>)}
          {matrix.map((row, rowIndex) => (
            <Fragment key={`row-${generations[rowIndex] || rowIndex}`}>
              <div key={`row-label-${generations[rowIndex]}`} className="heatmap-header">{generations[rowIndex]}</div>
              {row.map((value, colIndex) => {
                const color = getCellColor(value, maxValue);
                return (
                  <div key={`${rowIndex}-${colIndex}`} className="heatmap-cell" style={{ background: color.bg, color: color.text }}>
                    {value}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {generations.map((generation) => (
            <button key={generation} type="button" className={`gen-sub-tab ${generation === currentGenTab ? 'active' : ''}`} onClick={() => onGenTabChange(generation)}>
              {generation}
            </button>
          ))}
        </div>
        <div className="gen-panel">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div className="gen-detail-title" style={{ marginBottom: 12 }}>{currentGenTab}最喜欢提及</div>
              {(activeDetail?.topMentioned || []).map((item, index) => {
                const maxMention = activeDetail?.topMentioned?.[0]?.count || 1;
                const width = Math.round((item.count / maxMention) * 100);
                const isSame = item.gen === '同期';
                return (
                  <div className="gen-detail-item" key={`${item.name}-${index}`}>
                    <span style={{ width: 20, textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 13 }}>{index + 1}.</span>
                    <span style={{ fontWeight: 500, minWidth: 80 }}>{item.name}</span>
                    <span className={`gen-badge ${isSame ? 'same' : 'cross'}`}>{item.gen}</span>
                    <div style={{ flex: 1, margin: '0 12px', height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${width}%`, background: 'var(--color-brand-nogi)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--color-brand-nogi)', whiteSpace: 'nowrap' }}>{item.count}次</span>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="gen-detail-title" style={{ marginBottom: 12 }}>{currentGenTab}被谁提及</div>
              {(activeReceived?.members || []).map((item) => {
                const maxReceived = activeReceived?.members?.[0]?.count || 1;
                const width = Math.round((item.count / maxReceived) * 100);
                return (
                  <div className="gen-detail-item" key={item.name}>
                    <span style={{ fontWeight: 500, minWidth: 80 }}>{item.name}</span>
                    <div style={{ flex: 1, margin: '0 12px', height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${width}%`, background: 'var(--color-brand-nogi-light, #9b4dca)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--color-brand-nogi, #742581)', whiteSpace: 'nowrap' }}>{item.count}次</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12, whiteSpace: 'nowrap', marginLeft: 8 }}>← {item.mainSource} {item.mainCount}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
