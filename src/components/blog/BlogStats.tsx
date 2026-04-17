import { useEffect, useMemo, useState } from 'react';
import type { BlogItem } from './blog-api';
import { fetchGroupMembers } from './blog-api';
import { GROUPS, getApiBaseUrl, getGroupApiName, type GroupKey } from './blog-config';
import { calculateMemberStats, filterBlogsByYearMonth } from './blog-insights.js';

type StatsGroup = 'all' | GroupKey;

interface RawGroupData {
  allBlogs: BlogItem[];
  currentMembersList: string[];
  totalMembers: number;
}

interface MemberCountItem {
  name: string;
  count: number;
}

interface StatsResult {
  activeMembers: number;
  totalMembers: number;
  members: number;
  blogs: number;
  avgBlogs: number;
  topMembers: MemberCountItem[];
}

const GROUP_ORDER: GroupKey[] = ['nogizaka', 'sakurazaka', 'hinatazaka'];

async function fetchGroupBlogs(group: GroupKey): Promise<BlogItem[]> {
  const apiBase = getApiBaseUrl();
  const limit = 500;
  const allBlogs: BlogItem[] = [];
  let offset = 0;

  while (true) {
    const response = await fetch(`${apiBase}/api/blogs?group=${encodeURIComponent(getGroupApiName(group))}&limit=${limit}&offset=${offset}&exclude_content=true`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.blogs)) {
      throw new Error(`加载 ${group} 博客失败`);
    }

    allBlogs.push(...data.blogs);

    const total = data.total ?? data.pagination?.total ?? data.pagination?.totalCount;
    if ((typeof total === 'number' && allBlogs.length >= total) || data.blogs.length < limit) {
      break;
    }

    offset += limit;
  }

  return allBlogs;
}

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear - 1, currentYear - 2];
}

export default function BlogStats() {
  const yearOptions = useMemo(() => getYearOptions(), []);
  const [selectedGroup, setSelectedGroup] = useState<StatsGroup>('all');
  const [year, setYear] = useState(String(yearOptions[0]));
  const [month, setMonth] = useState('all');
  const [rawData, setRawData] = useState<Partial<Record<GroupKey, RawGroupData>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const entries = await Promise.all(
          GROUP_ORDER.map(async (group) => {
            const [blogs, memberData] = await Promise.all([
              fetchGroupBlogs(group),
              fetchGroupMembers(group),
            ]);

            let totalMembers = 0;
            let currentMembersList: string[] = [];
            if (memberData?.generations) {
              for (const generation of memberData.generations) {
                totalMembers += generation.members.length;
                currentMembersList.push(...generation.members);
              }
            }
            if (typeof memberData?.totalMembers === 'number') {
              totalMembers = memberData.totalMembers;
            }

            return [group, { allBlogs: blogs, currentMembersList, totalMembers }] as const;
          })
        );

        if (!cancelled) {
          setRawData(Object.fromEntries(entries));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '统计数据加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const computed = useMemo(() => {
    const perGroup = {} as Record<GroupKey, StatsResult>;
    let allBlogs: BlogItem[] = [];
    let allMembers: string[] = [];
    let allTotalMembers = 0;

    for (const group of GROUP_ORDER) {
      const groupData = rawData[group];
      if (!groupData) continue;
      const filteredBlogs = filterBlogsByYearMonth(groupData.allBlogs, year, month) as BlogItem[];
      const stats = calculateMemberStats(filteredBlogs, groupData.currentMembersList, groupData.totalMembers) as StatsResult;
      perGroup[group] = stats;
      allBlogs = allBlogs.concat(filteredBlogs);
      allMembers = allMembers.concat(groupData.currentMembersList);
      allTotalMembers += groupData.totalMembers;
    }

    const allStats = calculateMemberStats(allBlogs, allMembers, allTotalMembers) as StatsResult;

    return {
      perGroup,
      allStats,
      totalMembers: allTotalMembers,
      totalBlogs: allBlogs.length,
    };
  }, [rawData, year, month]);

  const activeStats = selectedGroup === 'all' ? computed.allStats : computed.perGroup[selectedGroup];
  const activeColor = selectedGroup === 'all' ? '#6b7280' : GROUPS[selectedGroup].color;
  const maxCount = activeStats?.topMembers?.[0]?.count || 1;
  const monthText = month === 'all' ? '全年' : `${month}月`;
  const periodText = `${year}年${monthText}`;

  if (loading) {
    return <div className="loading-state">正在加载统计数据...</div>;
  }

  if (error) {
    return <div className="empty-state">{error}</div>;
  }

  if (!activeStats) {
    return <div className="empty-state">暂无统计数据</div>;
  }

  return (
    <div className="stats-page-container">
      <div className="panel" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>年份</label>
            <select
              id="statsYearSelect"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              {yearOptions.map((item) => (
                <option key={item} value={item}>{item}年</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>月份</label>
            <select
              id="statsMonthSelect"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              <option value="all">全年</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
                <option key={item} value={String(item)}>{item}月</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, marginTop: 16, borderBottom: '1px solid var(--border-primary)', overflowX: 'auto' }}>
          <button
            className={`stats-group-tab ${selectedGroup === 'all' ? 'active' : ''}`}
            type="button"
            onClick={() => setSelectedGroup('all')}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 500, fontSize: 13, color: 'var(--text-secondary)', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' }}
          >
            全部团体
          </button>
          {GROUP_ORDER.map((group) => (
            <button
              key={group}
              className={`stats-group-tab ${selectedGroup === group ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedGroup(group)}
              style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 500, fontSize: 13, color: 'var(--text-secondary)', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' }}
            >
              {GROUPS[group].name}
            </button>
          ))}
        </div>
      </div>

      <div id="statsCards" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {selectedGroup === 'all' ? (
          <>
            <div className="stat-card">
              <div className="stat-label">总成员数</div>
              <div className="stat-number" style={{ color: 'var(--color-brand-nogi, #742581)' }}>{computed.totalMembers}</div>
              <div style={{ marginTop: 16 }}>
                {GROUP_ORDER.map((group) => {
                  const stats = computed.perGroup[group];
                  if (!stats) return null;
                  return (
                    <div key={group} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{GROUPS[group].name}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, padding: '2px 10px', background: `${GROUPS[group].color}20`, color: GROUPS[group].color, borderRadius: 6 }}>{stats.activeMembers}/{stats.totalMembers}人</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">总博客数</div>
              <div className="stat-number" style={{ color: '#f59e0b' }}>{computed.totalBlogs}</div>
              <div style={{ marginTop: 16 }}>
                {GROUP_ORDER.map((group) => {
                  const stats = computed.perGroup[group];
                  if (!stats) return null;
                  return (
                    <div key={group} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{GROUPS[group].name}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, padding: '2px 10px', background: `${GROUPS[group].color}20`, color: GROUPS[group].color, borderRadius: 6 }}>{stats.blogs}篇</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">查询时段</div>
              <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 500, margin: '12px 0', background: '#d1fae5', color: '#065f46' }}>{periodText}</div>
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>平均博客数</span>
                  <span style={{ fontSize: 16, fontWeight: 700, padding: '2px 10px', background: '#10b98120', color: '#10b981', borderRadius: 6 }}>{activeStats.avgBlogs}篇/人</span>
                </div>
                {GROUP_ORDER.map((group) => {
                  const stats = computed.perGroup[group];
                  if (!stats) return null;
                  return (
                    <div key={group} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{GROUPS[group].name}平均</span>
                      <span style={{ fontSize: 16, fontWeight: 700, padding: '2px 10px', background: `${GROUPS[group].color}20`, color: GROUPS[group].color, borderRadius: 6 }}>{stats.avgBlogs}篇/人</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-label">总成员数</div>
              <div className="stat-number" style={{ color: 'var(--color-brand-nogi, #742581)' }}>{activeStats.activeMembers}/{activeStats.totalMembers}</div>
              <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 500, marginTop: 8, background: '#ede7f6', color: '#5e35b1' }}>{GROUPS[selectedGroup].name}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">总博客数</div>
              <div className="stat-number" style={{ color: '#f59e0b' }}>{activeStats.blogs}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">查询时段</div>
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>平均博客数</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{activeStats.avgBlogs}篇/人</span>
                </div>
              </div>
              <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 500, background: '#d1fae5', color: '#065f46' }}>{periodText}</div>
            </div>
          </>
        )}
      </div>

      <div className="panel chart-container" style={{ padding: 20 }}>
        <h2 id="statsChartTitle" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          成员博客统计图表 - {selectedGroup === 'all' ? '全部团体' : GROUPS[selectedGroup].name} (前20名)
        </h2>
        {activeStats.topMembers.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>当前筛选条件下暂无统计数据</div>
        ) : (
          <div>
            {activeStats.topMembers.map((member, index) => {
              const width = Math.max(8, Math.round((member.count / maxCount) * 100));
              const numClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : 'normal';
              return (
                <div className="ranking-item" key={member.name}>
                  <div className={`ranking-number ${numClass}`}>{index + 1}</div>
                  <div className="ranking-name">{member.name}</div>
                  <div className="ranking-bar-wrapper">
                    <div className="ranking-bar" style={{ width: `${width}%`, background: activeColor, borderRadius: 12 }}>
                      {width > 18 ? <span className="ranking-bar-label">{member.count}篇</span> : null}
                    </div>
                  </div>
                  <div className="ranking-count">{member.count}篇</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
