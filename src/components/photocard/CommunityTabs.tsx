import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import {
  LayoutGrid, User, Bookmark, Image, LogIn, Share2, Loader2, Search, X,
} from 'lucide-react';
import { listWorks, listMyWorks, listMyBookmarks, type CommunityWork, type StampCounts, type StampType } from '@/utils/community-api';
import WorkCard from './WorkCard';
import WorkLightbox from './WorkLightbox';

const GROUP_FILTERS = [
  { label: '全部', value: '' },
  { label: '乃木坂', value: '乃木坂46' },
  { label: '櫻坂', value: '櫻坂46' },
  { label: '日向坂', value: '日向坂46' },
] as const;

const SORT_OPTIONS = [
  { label: '最新', value: 'latest' as const },
  { label: '最热', value: 'popular' as const },
];

type Tab = 'popular' | 'my' | 'bookmarks';

/** Skeleton placeholder for loading state */
function SkeletonCard() {
  return (
    <div className="break-inside-avoid rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden animate-pulse">
      <div className="bg-[var(--bg-tertiary)]" style={{ height: Math.floor(Math.random() * 80) + 160 }} />
      <div className="p-2.5 space-y-1.5">
        <div className="h-3 w-16 bg-[var(--bg-tertiary)] rounded" />
        <div className="h-2 w-24 bg-[var(--bg-tertiary)] rounded" />
        <div className="flex justify-between">
          <div className="h-2 w-8 bg-[var(--bg-tertiary)] rounded" />
          <div className="h-2 w-12 bg-[var(--bg-tertiary)] rounded" />
        </div>
      </div>
    </div>
  );
}

export default function CommunityTabs() {
  const [tab, setTab] = useState<Tab>('popular');
  const [groupFilter, setGroupFilter] = useState('');
  const [sort, setSort] = useState<'latest' | 'popular'>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [works, setWorks] = useState<CommunityWork[]>([]);
  const [myWorks, setMyWorks] = useState<CommunityWork[]>([]);
  const [bookmarkWorks, setBookmarkWorks] = useState<CommunityWork[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedWork, setSelectedWork] = useState<CommunityWork | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const auth = useStore($auth);

  const loadWorks = useCallback(async (reset = false) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const p = reset ? 1 : page;
      const data = await listWorks({
        group: groupFilter || undefined,
        member: searchQuery || undefined,
        sort,
        page: p,
        limit: 20,
      });
      setWorks(prev => reset ? data.works : [...prev, ...data.works]);
      setHasMore(data.hasMore);
      if (reset) setPage(1);
    } catch (e) {
      console.error('Failed to load works:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [groupFilter, sort, page, searchQuery]);

  const loadMyWorks = useCallback(async () => {
    if (!auth.isLoggedIn) return;
    setLoading(true);
    try {
      const data = await listMyWorks(1, 50);
      setMyWorks(data.works);
    } catch (e) {
      console.error('Failed to load my works:', e);
    } finally {
      setLoading(false);
    }
  }, [auth.isLoggedIn]);

  const loadBookmarks = useCallback(async () => {
    if (!auth.isLoggedIn) return;
    setLoading(true);
    try {
      const data = await listMyBookmarks(1, 50);
      setBookmarkWorks(data.works);
    } catch (e) {
      console.error('Failed to load bookmarks:', e);
    } finally {
      setLoading(false);
    }
  }, [auth.isLoggedIn]);

  // Load works on filter/sort/search change
  useEffect(() => {
    if (tab === 'popular') loadWorks(true);
  }, [groupFilter, sort, tab, searchQuery]);

  // Load my works on tab switch
  useEffect(() => {
    if (tab === 'my') loadMyWorks();
  }, [tab, loadMyWorks]);

  // Load bookmarks on tab switch
  useEffect(() => {
    if (tab === 'bookmarks') loadBookmarks();
  }, [tab, loadBookmarks]);

  // Load next page
  useEffect(() => {
    if (page > 1 && tab === 'popular') loadWorks(false);
  }, [page]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (tab !== 'popular' || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && hasMore) {
          setPage(p => p + 1);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab, hasMore, loading, loadingMore]);

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const handleLikeUpdate = (id: string, liked: boolean, likeCount: number) => {
    const update = (list: CommunityWork[]) =>
      list.map(w => w.id === id ? { ...w, liked, likeCount } : w);
    setWorks(update);
    setMyWorks(update);
    setBookmarkWorks(update);
    if (selectedWork?.id === id) {
      setSelectedWork(prev => prev ? { ...prev, liked, likeCount } : null);
    }
  };

  const handleBookmarkUpdate = (id: string, bookmarked: boolean) => {
    const update = (list: CommunityWork[]) =>
      list.map(w => w.id === id ? { ...w, bookmarked } : w);
    setWorks(update);
    setMyWorks(update);
    if (bookmarked) {
      // add to bookmarks if not present
      setBookmarkWorks(prev => {
        if (prev.some(w => w.id === id)) return update(prev);
        const work = works.find(w => w.id === id) || myWorks.find(w => w.id === id);
        return work ? [{ ...work, bookmarked: true }, ...prev] : prev;
      });
    } else {
      setBookmarkWorks(prev => prev.filter(w => w.id !== id));
    }
    if (selectedWork?.id === id) {
      setSelectedWork(prev => prev ? { ...prev, bookmarked } : null);
    }
  };

  const handleStampUpdate = (id: string, stamps: StampCounts, myStamps: StampType[]) => {
    const update = (list: CommunityWork[]) =>
      list.map(w => w.id === id ? { ...w, stamps, myStamps } : w);
    setWorks(update);
    setMyWorks(update);
    setBookmarkWorks(update);
    if (selectedWork?.id === id) setSelectedWork(w => w ? { ...w, stamps, myStamps } : w);
  };

  const handleDelete = (id: string) => {
    setWorks(prev => prev.filter(w => w.id !== id));
    setMyWorks(prev => prev.filter(w => w.id !== id));
    setBookmarkWorks(prev => prev.filter(w => w.id !== id));
  };

  const displayWorks = tab === 'popular' ? works : tab === 'my' ? myWorks : bookmarkWorks;

  // Lightbox navigation
  const openLightbox = (work: CommunityWork) => {
    const idx = displayWorks.findIndex(w => w.id === work.id);
    setSelectedWork(work);
    setSelectedIndex(idx);
  };

  const goPrev = selectedIndex > 0 ? () => {
    const prev = displayWorks[selectedIndex - 1];
    if (prev) { setSelectedWork(prev); setSelectedIndex(selectedIndex - 1); }
  } : undefined;

  const goNext = selectedIndex < displayWorks.length - 1 ? () => {
    const next = displayWorks[selectedIndex + 1];
    if (next) { setSelectedWork(next); setSelectedIndex(selectedIndex + 1); }
  } : undefined;

  const needsLogin = (tab === 'my' || tab === 'bookmarks') && !auth.isLoggedIn;

  return (
    <div>
      {/* Tab headers */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('popular')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === 'popular'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <LayoutGrid size={12} />
            社区
          </button>
          <button
            onClick={() => setTab('my')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === 'my'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <User size={12} />
            我的作品
          </button>
          <button
            onClick={() => setTab('bookmarks')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === 'bookmarks'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <Bookmark size={12} />
            收藏
          </button>
        </div>

        {/* Filters (only for popular tab) */}
        {tab === 'popular' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="flex items-center gap-1">
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索成员名..."
                  className="w-28 sm:w-36 pl-6 pr-6 py-1 text-[10px] rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--color-brand-sakura)] transition-colors"
                />
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                {searchInput && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {GROUP_FILTERS.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setGroupFilter(f.value)}
                  className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                    groupFilter === f.value
                      ? 'border-[var(--color-brand-sakura)] text-[var(--color-brand-sakura)]'
                      : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:border-[var(--border-secondary)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 ml-1">
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSort(s.value)}
                  className={`px-2 py-1 text-[10px] rounded transition-colors ${
                    sort === s.value
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search active indicator */}
      {tab === 'popular' && searchQuery && (
        <div className="flex items-center gap-2 mb-3 text-[10px] text-[var(--text-secondary)]">
          <span>搜索: <strong>{searchQuery}</strong></span>
          <button onClick={clearSearch} className="text-[var(--color-brand-sakura)] hover:underline">清除</button>
        </div>
      )}

      {/* Content */}
      {loading && displayWorks.length === 0 ? (
        <div className="columns-2 sm:columns-3 md:columns-4 gap-3 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : needsLogin ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
            <LogIn size={24} className="text-[var(--text-tertiary)] opacity-40" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
            {tab === 'bookmarks' ? '登录查看你的收藏' : '登录查看你的作品'}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-xs">
            {tab === 'bookmarks' ? '登录后可以收藏喜欢的作品' : '登录后可以管理和查看你发布的作品'}
          </p>
          <div className="flex items-center gap-2">
            <a
              href="/auth/login"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-sakura)' }}
            >
              <LogIn size={12} />
              登录 / 注册
            </a>
          </div>
        </div>
      ) : displayWorks.length > 0 ? (
        <>
          <div className="columns-2 sm:columns-3 md:columns-4 gap-3 space-y-3">
            {displayWorks.map((work) => (
              <WorkCard
                key={work.id}
                work={work}
                onClick={() => openLightbox(work)}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          {tab === 'popular' && hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-6">
              {loadingMore && <Loader2 size={18} className="animate-spin text-[var(--text-tertiary)]" />}
            </div>
          )}
        </>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
            <Image size={24} className="text-[var(--text-tertiary)] opacity-40" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
            {tab === 'bookmarks' ? '还没有收藏' : tab === 'my' ? '还没有作品' : searchQuery ? '未找到匹配的作品' : '暂无作品'}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mb-4">
            {tab === 'bookmarks' ? '浏览社区并收藏喜欢的作品吧' : searchQuery ? '试试其他搜索条件' : '去创作你的第一张生写卡片吧'}
          </p>
          {!searchQuery && (
            <a
              href="/photocard/create"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-sakura)' }}
            >
              <Share2 size={12} />
              开始创作
            </a>
          )}
        </div>
      )}

      {/* Lightbox */}
      {selectedWork && (
        <WorkLightbox
          work={selectedWork}
          onClose={() => { setSelectedWork(null); setSelectedIndex(-1); }}
          onLikeUpdate={handleLikeUpdate}
          onBookmarkUpdate={handleBookmarkUpdate}
          onStampUpdate={handleStampUpdate}
          onDelete={handleDelete}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </div>
  );
}
