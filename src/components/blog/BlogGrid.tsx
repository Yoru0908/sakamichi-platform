/** Blog grid view — list, filtering, pagination, infinite scroll */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import BlogCard from './BlogCard';
import { fetchBlogs, fetchGroupMembers, searchBlogs, type BlogItem, type GroupMembersData } from './blog-api';
import { getGroupDisplayName, formatBlogDate, ALL_PAGE_SIZE, PAGE_SIZE } from './blog-config';

interface Props {
  group: string;
  memberFilter?: string;
  searchQuery?: string;
  onClearSearch?: () => void;
  onNavigate: (hash: string) => void;
}

export default function BlogGrid({ group, memberFilter, searchQuery: externalSearch = '', onClearSearch, onNavigate }: Props) {
  const [blogs, setBlogs] = useState<BlogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [groupData, setGroupData] = useState<GroupMembersData | null>(null);
  const [memberSelect, setMemberSelect] = useState(memberFilter || '');
  const [searchResults, setSearchResults] = useState<BlogItem[] | null>(null);
  const [searchCount, setSearchCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const prevGroupRef = useRef(group);
  const pageRef = useRef(page);
  pageRef.current = page;

  const isAll = group === 'all';

  // Load blogs
  const loadBlogs = useCallback(async (p: number, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      const result = await fetchBlogs({
        group,
        member: memberSelect || undefined,
        page: p,
        useCache: !memberSelect,
      });

      if (append) {
        setBlogs(prev => {
          const ids = new Set(prev.map(b => b.id));
          const newBlogs = result.blogs.filter(b => !ids.has(b.id));
          return [...prev, ...newBlogs];
        });
      } else {
        setBlogs(result.blogs);
      }

      setHasMore(result.hasMore);
      if (result.total) {
        const perPage = isAll ? ALL_PAGE_SIZE : PAGE_SIZE;
        setTotalPages(Math.max(1, Math.ceil(result.total / perPage)));
      }
    } catch (error) {
      console.error('[BlogGrid] 加载失败:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [group, memberSelect, isAll]);

  // Load group members info
  useEffect(() => {
    if (group !== 'all') {
      fetchGroupMembers(group).then(data => {
        if (data) setGroupData(data);
      });
    } else {
      setGroupData(null);
    }
  }, [group]);


  // Reset on group change
  useEffect(() => {
    if (prevGroupRef.current !== group) {
      setPage(1);
      setBlogs([]);
      setSearchResults(null);
      setMemberSelect('');
      prevGroupRef.current = group;
    }
    loadBlogs(1);
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on page change (for pagination mode)
  useEffect(() => {
    if (!isAll && page > 0) {
      loadBlogs(page);
    }
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore member filter from URL
  useEffect(() => {
    if (memberFilter && memberFilter !== memberSelect) {
      setMemberSelect(memberFilter);
    }
  }, [memberFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on member filter change
  useEffect(() => {
    if (prevGroupRef.current === group) {
      setPage(1);
      loadBlogs(1);
    }
  }, [memberSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll for #all
  useEffect(() => {
    if (!isAll || !hasMore) return;

    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) {
          const nextPage = pageRef.current + 1;
          setPage(nextPage);
          pageRef.current = nextPage;
          loadBlogs(nextPage, true);
        }
      },
      { rootMargin: '200px' }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [isAll, hasMore, loadingMore, loading, loadBlogs]);

  // Handle external search query from parent
  useEffect(() => {
    if (!externalSearch) {
      if (searchResults) {
        setSearchResults(null);
        loadBlogs(1);
      }
      return;
    }
    setLoading(true);
    searchBlogs(externalSearch, group)
      .then(result => {
        setSearchResults(result.blogs);
        setSearchCount(result.count);
      })
      .catch(err => console.error('[BlogGrid] 搜索失败:', err))
      .finally(() => setLoading(false));
  }, [externalSearch, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearSearch = useCallback(() => {
    setSearchResults(null);
    setPage(1);
    loadBlogs(1);
    onClearSearch?.();
  }, [loadBlogs, onClearSearch]);

  // Member filter handler
  const handleMemberFilter = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const member = e.target.value;
    setMemberSelect(member);
    const newHash = member
      ? `#${group}?member=${encodeURIComponent(member)}`
      : `#${group}`;
    window.history.pushState(null, '', newHash);
  }, [group]);

  // Today count
  const todayCount = blogs.filter(b => {
    if (!b.publish_date) return false;
    const now = new Date();
    const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const today = jst.toISOString().split('T')[0];
    try {
      const d = new Date(b.publish_date.replace(/[\/\.]/g, '-').split(/[\sT]/)[0]);
      return d.toISOString().split('T')[0] === today;
    } catch { return false; }
  }).length;

  // Latest blog date per member from API (groupData.generations[].lastPostDates)
  const memberLatestDate = useMemo(() => {
    const fmt = new Map<string, string>();
    if (!groupData?.generations) return fmt;
    for (const gen of groupData.generations) {
      if (!gen.lastPostDates) continue;
      for (const [member, date] of Object.entries(gen.lastPostDates)) {
        try {
          const d = new Date(date.replace(/[\/\.]/g, '-'));
          if (!isNaN(d.getTime())) {
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            fmt.set(member, `${mm}.${dd} ${hh}:${min} 更新`);
          }
        } catch {}
      }
    }
    return fmt;
  }, [groupData]);

  const displayBlogs = searchResults ?? blogs;

  return (
    <>
      {/* Search results header */}
      {searchResults && (
        <div style={{ padding: '20px 0', borderBottom: '1px solid var(--border-primary)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              搜索结果："{externalSearch}" <span style={{ color: 'var(--text-secondary)' }}>(找到 {searchCount} 篇博客)</span>
            </h3>
            <button
              onClick={clearSearch}
              style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              清除搜索
            </button>
          </div>
        </div>
      )}

      {/* Group info section */}
      {!searchResults && group !== 'all' && (
        <div className="mb-8">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="grid grid-cols-2 gap-4 flex-1">
              <div className="stat-card">
                <div className="stat-number">{groupData?.totalMembers ?? '-'}</div>
                <div className="stat-label">成员数</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{todayCount}</div>
                <div className="stat-label">今日更新</div>
              </div>
            </div>
            <div className="filter-card" style={{ minWidth: 300 }}>
              <div className="filter-label">FILTER</div>
              <select
                className="select select-bordered w-full"
                value={memberSelect}
                onChange={handleMemberFilter}
              >
                <option value="">全部成员</option>
                {groupData?.generations?.map(gen => (
                  <optgroup key={gen.name} label={gen.name}>
                    {gen.members
                      .filter(m => !groupData.graduated?.includes(m))
                      .map(m => (
                        <option key={m} value={m}>{m}{memberLatestDate.has(m) ? `（${memberLatestDate.get(m)}）` : ''}</option>
                      ))}
                  </optgroup>
                ))}
                {groupData?.graduated && groupData.graduated.length > 0 && (
                  <optgroup label="── 已毕業 ──">
                    {groupData.graduated.map(m => (
                      <option key={m} value={m}>{m}（已毕业）</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Loading state — inline, non-blocking */}
      {loading && displayBlogs.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent" style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>加载中...</span>
          </div>
        </div>
      )}

      {/* Blog grid */}
      <div className="mb-8">
        <div
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4"
          style={{ minHeight: displayBlogs.length === 0 ? 0 : 400 }}
        >
          {displayBlogs.map((blog, i) => (
            <BlogCard key={blog.id} blog={blog} index={i} onNavigate={onNavigate} />
          ))}
        </div>
      </div>

      {/* Empty state */}
      {!loading && displayBlogs.length === 0 && (
        <div className="text-center py-12" style={{ background: 'var(--bg-primary)' }}>
          <p style={{ color: 'var(--text-tertiary)' }}>暂无博客</p>
        </div>
      )}

      {/* Infinite scroll sentinel (for #all) */}
      {isAll && hasMore && !searchResults && (
        <div ref={sentinelRef} style={{ height: 1 }} />
      )}

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="text-center mb-8">
          <div className="inline-flex items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--text-primary)' }} />
            <span className="ml-3" style={{ color: 'var(--text-secondary)' }}>加载中...</span>
          </div>
        </div>
      )}

      {/* Pagination (for group pages) */}
      {!isAll && !searchResults && totalPages > 1 && (
        <div className="mb-8 mt-8">
          <div className="flex flex-col items-center gap-4">
            <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              第 {page} / {totalPages} 页
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={page <= 1}
                className="flex items-center justify-center w-8 h-8 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {generatePageNumbers(page, totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="px-1" style={{ color: 'var(--text-tertiary)' }}>...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => { setPage(Number(p)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="flex items-center justify-center w-8 h-8 text-sm border rounded transition-colors"
                    style={{
                      borderColor: page === p ? 'var(--color-brand-nogi)' : 'var(--border-primary)',
                      background: page === p ? 'var(--color-brand-nogi)' : 'transparent',
                      color: page === p ? '#fff' : 'var(--text-primary)',
                    }}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={page >= totalPages}
                className="flex items-center justify-center w-8 h-8 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member grid */}
      {!searchResults && group !== 'all' && groupData?.generations && (
        <div className="p-8" style={{ background: 'var(--bg-primary)' }}>
          <h2 className="section-title">メンバー別ブログ</h2>
          <div className="member-grid">
            {groupData.generations.map(gen => (
              <div key={gen.name} style={{ display: 'contents' }}>
                <div className="col-span-full text-sm font-bold mt-4 mb-2 px-2" style={{ color: 'var(--text-secondary)' }}>
                  {gen.name}
                </div>
                {gen.members.map(member => {
                  const isGraduated = groupData.graduated?.includes(member);
                  return (
                    <div
                      key={member}
                      className={`member-item ${isGraduated ? 'member-item--graduated' : ''}`}
                      onClick={() => onNavigate(`#${group}/member/${encodeURIComponent(member)}`)}
                    >
                      {member}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
