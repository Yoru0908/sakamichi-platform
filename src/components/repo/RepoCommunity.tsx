import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { Search, SlidersHorizontal, RefreshCw, LayoutGrid, User, LogIn } from 'lucide-react';
import type { GroupId, AtmosphereTag } from '@/types/repo';
import { GROUP_META, ATMOSPHERE_TAGS } from '@/types/repo';
import { getMyRepoWorks, getRepoWork, listRepoWorks } from '@/utils/auth-api';
import type { RepoWorkItem, RepoReaction } from '@/utils/auth-api';
import { $auth } from '@/stores/auth';
import RepoCard from './RepoCard';
import RepoDetailModal from './RepoDetailModal';
import { getRepoIdFromSearch } from './repo-url-state';

type SortMode = 'latest' | 'popular';
type ViewMode = 'community' | 'mine';

export default function RepoCommunity() {
  const auth = useStore($auth);
  const [groupFilter, setGroupFilter] = useState<GroupId | 'all'>('all');
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<AtmosphereTag | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [viewMode, setViewMode] = useState<ViewMode>('community');
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [repos, setRepos] = useState<RepoWorkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoWorkItem | null>(null);
  const deepLinkHandledRef = useRef(false);

  const LIMIT = 18;

  const fetchRepos = useCallback(async (reset = false) => {
    if (viewMode === 'mine' && !auth.isLoggedIn) {
      setRepos([]);
      setTotal(0);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const currentPage = reset ? 1 : page;
    try {
      const params = {
        group: groupFilter !== 'all' ? groupFilter : undefined,
        memberId: memberFilter || undefined,
        tag: tagFilter || undefined,
        query: searchQuery || undefined,
        sort: sortMode,
        page: currentPage,
        limit: LIMIT,
      };
      const res = viewMode === 'mine'
        ? await getMyRepoWorks(params)
        : await listRepoWorks(params);
      if (res.success && res.data) {
        const newRepos = res.data.repos;
        setRepos(reset ? newRepos : prev => [...prev, ...newRepos]);
        setTotal(res.data!.pagination.total);
        setHasMore(currentPage < res.data!.pagination.totalPages);
        if (reset) setPage(1);
      } else {
        setError(res.message || '加载失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [auth.isLoggedIn, groupFilter, memberFilter, tagFilter, sortMode, page, searchQuery, viewMode]);

  // Fetch on filter/sort change (reset)
  useEffect(() => {
    setPage(1);
    fetchRepos(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFilter, memberFilter, tagFilter, sortMode, searchQuery, viewMode, auth.isLoggedIn]);

  function handleLoadMore() {
    setPage(p => p + 1);
  }

  // Fetch when page increments (for load more)
  useEffect(() => {
    if (page > 1) fetchRepos(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    if (deepLinkHandledRef.current || typeof window === 'undefined') return;
    const repoId = getRepoIdFromSearch(window.location.search);
    if (!repoId) {
      deepLinkHandledRef.current = true;
      return;
    }
    deepLinkHandledRef.current = true;
    getRepoWork(repoId).then((res) => {
      if (res.success && res.data) setSelectedRepo(res.data);
    }).catch(() => {});
  }, []);

  // Update a single card's reactions optimistically
  function handleReactionUpdate(workId: string, updatedReactions: RepoReaction, myReactions: string[]) {
    setRepos(prev => prev.map(r =>
      r.id === workId ? { ...r, reactions: updatedReactions, myReactions } : r
    ));
    setSelectedRepo(prev =>
      prev?.id === workId ? { ...prev, reactions: updatedReactions, myReactions } : prev
    );
  }

  function handleDelete(workId: string) {
    setRepos(prev => prev.filter(r => r.id !== workId));
    setSelectedRepo(prev => prev?.id === workId ? null : prev);
    setTotal(prev => Math.max(0, prev - 1));
  }

  const needsLogin = viewMode === 'mine' && !auth.isLoggedIn;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setViewMode('community')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              viewMode === 'community' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutGrid size={12} /> 社区
          </button>
          <button
            type="button"
            onClick={() => setViewMode('mine')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              viewMode === 'mine' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <User size={12} /> 我的Repo
          </button>
        </div>
        {viewMode === 'mine' && !auth.isLoggedIn && (
          <a href="/auth/login" className="text-xs text-[var(--color-brand-nogi)] hover:underline">登录后查看你的作品</a>
        )}
      </div>

      {/* Search-like filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              setSearchQuery(value.trim());
            }}
            placeholder={viewMode === 'mine' ? '搜索我的 Repo...' : '搜索成员 / 昵称 / 对话...'}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`shrink-0 p-2.5 rounded-xl border transition-colors ${
            showFilters ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          {/* Group tabs */}
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">グループ</div>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'nogizaka', 'sakurazaka', 'hinatazaka'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setGroupFilter(g); setMemberFilter(null); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    groupFilter === g
                      ? g === 'all' ? 'bg-gray-800 text-white' : 'text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  style={groupFilter === g && g !== 'all' ? { backgroundColor: GROUP_META[g].color } : undefined}
                >
                  {g === 'all' ? '全部' : GROUP_META[g].name}
                </button>
              ))}
            </div>
          </div>

          {/* Tag filter */}
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">タグ</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                  !tagFilter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                全部
              </button>
              {ATMOSPHERE_TAGS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
                  className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                    tagFilter === t.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">並び替え</div>
            <div className="flex gap-1.5">
              {([['latest', '最新'], ['popular', '人気']] as [SortMode, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSortMode(id)}
                  className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                    sortMode === id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results count + refresh */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">{viewMode === 'mine' ? `我的 ${total} 件Repo` : `${total} 件のレポ`}</div>
        <button type="button" onClick={() => fetchRepos(true)} disabled={loading}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {needsLogin && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <LogIn size={20} />
          </div>
          <div className="text-sm font-medium text-gray-700">登录后查看和管理你发布的 Repo</div>
          <a href="/auth/login" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:opacity-90">
            <LogIn size={12} /> 登录 / 注册
          </a>
        </div>
      )}

      {/* Error state */}
      {error && !needsLogin && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 text-center">
          {error}
          <button type="button" onClick={() => fetchRepos(true)} className="ml-2 underline text-red-500 text-xs">重试</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && repos.length === 0 && !needsLogin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="h-8 bg-gray-100 rounded" />
                <div className="h-8 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && repos.length === 0 && !needsLogin && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📝</div>
          <div className="text-sm text-gray-500">{viewMode === 'mine' ? '你还没有发布 Repo' : 'まだRepoがありません'}</div>
          <div className="text-xs text-gray-400 mt-1">{viewMode === 'mine' ? '先去生成器发布你的第一篇吧' : '最初のRepoを書いてみよう！'}</div>
        </div>
      )}

      {/* Repo grid */}
      {repos.length > 0 && !needsLogin && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {repos.map(repo => (
              <RepoCard
                key={repo.id}
                repo={repo}
                onReactionUpdate={handleReactionUpdate}
                onCardClick={setSelectedRepo}
              />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2 rounded-full text-sm border border-gray-200 bg-white text-gray-500 hover:border-gray-300 transition-colors disabled:opacity-40"
              >
                {loading ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </>
      )}
      {selectedRepo && (
        <RepoDetailModal
          repo={selectedRepo}
          onClose={() => setSelectedRepo(null)}
          onReactionUpdate={handleReactionUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
