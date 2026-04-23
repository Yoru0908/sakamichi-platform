import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import {
  Camera, Search, Download, ChevronDown, Star,
  Play, X, ChevronLeft, ChevronRight, Link2,
} from 'lucide-react';
import {
  type GroupFilter, type GroupKey, type InsAccount,
  GROUP_LABELS, GROUP_HEX,
  getAccountsByGroup, getDisplayName, INS_CONFIG,
} from '@/utils/ins-data';
import { $favorites } from '@/stores/favorites';

// ---------- Types ----------
interface MediaItem {
  Key: string;
  AlistUrl?: string;
  Size?: number;
  LastModified?: string;
  PublishTime?: string;
  contentType?: 'stories' | 'posts';
  isVideo?: boolean;
  date?: string;
  username?: string;
}

type ContentFilter = 'all' | 'stories' | 'posts';
type CardSize = 'small' | 'medium' | 'large';

const PAGE_SIZE = 48;

interface Pagination {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_more: boolean;
}

// Lazy media: only loads src when visible via IntersectionObserver
function LazyImage({ src, fallbackSrc, alt, className }: {
  src: string; fallbackSrc?: string; alt: string; className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const activeSrc = useFallback && fallbackSrc ? fallbackSrc : src;

  return (
    <div ref={ref} className={className}>
      {visible ? (
        <img
          src={activeSrc}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => {
            if (!useFallback && fallbackSrc) setUseFallback(true);
          }}
        />
      ) : (
        <div className="w-full h-full bg-[var(--bg-tertiary)]" />
      )}
    </div>
  );
}

function LazyVideo({ src, className }: { src: string; className: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {visible ? (
        <video
          src={`${src}#t=0.001`}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).currentTime = 0.001; }}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-[var(--bg-tertiary)]" />
      )}
    </div>
  );
}

// ---------- Component ----------
export default function InsArchive() {
  const [group, setGroup] = useState<GroupFilter>('all');
  const [selectedAccount, setSelectedAccount] = useState<InsAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');
  const [cardSize, setCardSize] = useState<CardSize>('small');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [modalItem, setModalItem] = useState<MediaItem | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showMobileMembers, setShowMobileMembers] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const currentRequestRef = useRef(0);

  // Favorites store for filtering
  const favorites = useStore($favorites);
  const favoriteNames = favorites.map((f) => f.name);

  // Filtered accounts
  const accounts = getAccountsByGroup(group).filter((a) =>
    !searchQuery || a.displayName.includes(searchQuery) || a.username.includes(searchQuery)
  );

  const alistPublic = `https://${INS_CONFIG.alistDomain}`;
  const rewriteUrl = (url: string | undefined, key: string): string => {
    if (url) {
      const pathMatch = url.match(/\/d\/instagram\/(.*)/);
      if (pathMatch) return `${alistPublic}/d/instagram/${pathMatch[1]}`;
    }
    return INS_CONFIG.getMediaUrl(key);
  };

  const transformItem = (f: any): MediaItem => {
    const key = typeof f === 'string' ? f : f.Key || f.key || '';
    const isVideo = /\.(mp4|mov|webm)$/i.test(key);
    const contentType = key.includes('/stories/') ? 'stories' as const : 'posts' as const;
    const publishTime = f.PublishTime || f.LastModified || '';
    let dateStr = '';
    if (publishTime) {
      try {
        const d = new Date(publishTime);
        const ymd = d.toISOString().split('T')[0];
        const hms = d.toTimeString().split(' ')[0];
        dateStr = hms === '00:00:00' || hms === '09:00:00' ? ymd : `${ymd} ${hms.slice(0, 5)}`;
      } catch {
        const dm = key.match(/\/(\d{4})[-]?(\d{2})[-]?(\d{2})\//); 
        dateStr = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : '';
      }
    }
    // Extract username from key: media/username/stories/... or username/stories/...
    const keyParts = key.split('/');
    const username = keyParts[0] === 'media' ? keyParts[1] || '' : keyParts[0] || '';
    return {
      Key: key,
      AlistUrl: rewriteUrl(f.AlistUrl, key),
      Size: f.Size || 0,
      LastModified: f.LastModified || '',
      PublishTime: publishTime,
      isVideo,
      contentType,
      date: dateStr,
      username,
    };
  };

  // Fetch a single page from /api/media
  const fetchPage = useCallback(async (opts: {
    page: number; account?: string; type?: string; append?: boolean;
  }) => {
    const requestId = ++currentRequestRef.current;
    if (opts.append) { setLoadingMore(true); } else { setLoading(true); setItems([]); setPagination(null); }
    try {
      const url = INS_CONFIG.getMediaApiUrl({
        page: opts.page,
        limit: PAGE_SIZE,
        account: opts.account,
        type: opts.type,
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error('API error');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'API error');
      if (requestId !== currentRequestRef.current) return; // stale request
      const newItems = (json.data.items || []).map(transformItem);
      if (opts.append) {
        setItems((prev) => [...prev, ...newItems]);
      } else {
        setItems(newItems);
      }
      setPagination(json.data.pagination);
    } catch {
      if (requestId === currentRequestRef.current && !opts.append) setItems([]);
    } finally {
      if (requestId === currentRequestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Load content — uses paginated API
  const loadContent = useCallback((account: InsAccount | null, typeFilter?: string) => {
    fetchPage({ page: 1, account: account?.username, type: typeFilter });
  }, [fetchPage]);

  const loadGroupContent = useCallback((groupFilter: GroupFilter, typeFilter?: string) => {
    if (groupFilter === 'favorites') { setItems([]); setPagination(null); return; }
    // For group filters other than 'all', the API doesn't support group filtering,
    // so we pass no account (returns all) — a future enhancement could add group param.
    fetchPage({ page: 1, type: typeFilter });
  }, [fetchPage]);

  // Auto-load all content on mount
  useEffect(() => { loadGroupContent('all'); }, [loadGroupContent]);

  const selectAccount = (account: InsAccount) => {
    setSelectedAccount(account);
    setContentFilter('all');
    setShowMobileMembers(false);
    loadContent(account);
  };

  // Items are already sorted by server (publish_time desc).
  // Content filter is applied server-side via type param.
  // For client-side content filter tabs, we re-fetch with type param.
  const filteredItems = items;
  const hasMore = pagination?.has_more ?? false;

  // Infinite scroll: load next page from API
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && pagination) {
          fetchPage({
            page: pagination.page + 1,
            account: selectedAccount?.username,
            type: contentFilter !== 'all' ? contentFilter : undefined,
            append: true,
          });
        }
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, pagination, selectedAccount, contentFilter, fetchPage]);

  const totalCount = pagination?.total ?? items.length;
  const storyCount = items.filter((i) => i.contentType === 'stories').length;
  const postCount = items.filter((i) => i.contentType === 'posts').length;
  const videoCount = items.filter((i) => i.isVideo).length;
  const imageCount = items.filter((i) => !i.isVideo).length;

  // Modal navigation
  const modalIndex = modalItem ? filteredItems.indexOf(modalItem) : -1;
  const navigateModal = (dir: -1 | 1) => {
    const next = filteredItems[modalIndex + dir];
    if (next) setModalItem(next);
  };

  // Keyboard navigation for modal
  useEffect(() => {
    if (!modalItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setModalItem(null);
          break;
        case 'ArrowLeft': {
          const v = modalItem.isVideo ? videoRef.current : null;
          if (v && v.currentTime > 1) {
            v.currentTime = Math.max(0, v.currentTime - 5);
          } else {
            const prev = filteredItems[modalIndex - 1];
            if (prev) setModalItem(prev);
          }
          break;
        }
        case 'ArrowRight': {
          const v = modalItem.isVideo ? videoRef.current : null;
          if (v && v.duration - v.currentTime > 1) {
            v.currentTime = Math.min(v.duration, v.currentTime + 5);
          } else {
            const next = filteredItems[modalIndex + 1];
            if (next) setModalItem(next);
          }
          break;
        }
        case ' ':
          e.preventDefault();
          if (modalItem.isVideo && videoRef.current) {
            videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalItem, modalIndex, filteredItems]);

  // Grid class based on card size
  const gridCols: Record<CardSize, string> = {
    small: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6',
    medium: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
    large: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-[var(--color-brand-nogi)]" />
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">INS归档</h1>
        </div>
        {/* Stats */}
        {!loading && items.length > 0 && (
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
            <span>总计 {totalCount}</span>
            <span>视频 {videoCount}</span>
            <span>图片 {imageCount}</span>
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* === Sidebar (desktop) === */}
        <aside className="hidden lg:block w-56 shrink-0 sticky top-[3.75rem] self-start max-h-[calc(100vh-4rem)] overflow-y-auto scrollbar-hide">
          {/* Group tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {(['all', 'nogizaka', 'sakurazaka', 'hinatazaka', 'favorites'] as GroupFilter[]).map((g) => (
              <button
                key={g}
                onClick={() => { setGroup(g); setSelectedAccount(null); setContentFilter('all'); loadGroupContent(g); }}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md transition-colors ${
                  group === g
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {g !== 'all' && g !== 'favorites' && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GROUP_HEX[g] }} />
                )}
                {g === 'favorites' && <Star size={10} />}
                {GROUP_LABELS[g]}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索成员..."
              className="w-full pl-7 pr-2 py-1.5 text-[11px] border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-nogi)]"
            />
          </div>

          {/* Account list */}
          <div className="space-y-0.5 overflow-y-auto scrollbar-hide flex-1">
            {accounts.map((a) => (
              <button
                key={a.username}
                onClick={() => selectAccount(a)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  selectedAccount?.username === a.username
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                }`}
              >
                <span
                  className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
                  style={{ backgroundColor: GROUP_HEX[a.group] }}
                >
                  {a.displayName.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{a.displayName}</p>
                  <p className="text-[9px] text-[var(--text-tertiary)] truncate">@{a.username}</p>
                </div>
              </button>
            ))}
            {accounts.length === 0 && (
              <p className="text-[10px] text-[var(--text-tertiary)] text-center py-4">
                {group === 'favorites' ? '暂无收藏' : '无匹配结果'}
              </p>
            )}
          </div>
        </aside>

        {/* === Main content === */}
        <div className="flex-1 min-w-0">
          {/* Mobile: member selector button (group tabs moved to bottom bar) */}
          <div className="lg:hidden mb-4">
            <button
              onClick={() => setShowMobileMembers(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-primary)] text-xs text-[var(--text-secondary)]"
            >
              <span>{selectedAccount ? selectedAccount.displayName : '选择成员'}</span>
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Content header + controls */}
          {(selectedAccount || items.length > 0 || loading) ? (
            <>
              <div className="sticky top-14 z-20 bg-[var(--bg-primary)] pb-2 -mx-4 px-4 pt-2 border-b border-[var(--border-primary)]">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedAccount ? (
                    <>{selectedAccount.displayName}<span className="ml-2 text-[10px] font-normal text-[var(--text-tertiary)]">@{selectedAccount.username}</span></>
                  ) : (
                    GROUP_LABELS[group]
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {/* Card size */}
                  <div className="hidden sm:flex items-center gap-0.5 bg-[var(--bg-secondary)] rounded-md p-0.5">
                    {(['small', 'medium', 'large'] as CardSize[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setCardSize(s)}
                        className={`px-2 py-0.5 text-[9px] rounded transition-colors ${
                          cardSize === s ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)]'
                        }`}
                      >
                        {s === 'small' ? '小' : s === 'medium' ? '中' : '大'}
                      </button>
                    ))}
                  </div>

                  {/* Batch download */}
                  <div className="relative">
                    <button
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                      disabled={items.length === 0}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-40 transition-colors"
                    >
                      <Download size={11} />
                      批量下载
                      <ChevronDown size={10} />
                    </button>
                    {showDownloadMenu && (
                      <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-lg z-20 py-1">
                        {[
                          { label: '下载所有内容', count: items.length, key: 'all' },
                          { label: '下载所有Post', count: postCount, key: 'posts' },
                          { label: '下载所有Story', count: storyCount, key: 'stories' },
                          null,
                          { label: '仅下载视频', count: videoCount, key: 'videos' },
                          { label: '仅下载图片', count: imageCount, key: 'images' },
                        ].map((opt, i) =>
                          opt === null ? (
                            <div key={i} className="border-t border-[var(--border-primary)] my-1" />
                          ) : (
                            <button
                              key={opt.key}
                              onClick={() => { setShowDownloadMenu(false); /* TODO: batch download */ }}
                              className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                            >
                              <span>{opt.label}</span>
                              <span className="text-[var(--text-tertiary)]">{opt.count}</span>
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-1">
                {([
                  { key: 'all' as ContentFilter, label: '全部' },
                  { key: 'stories' as ContentFilter, label: 'Story' },
                  { key: 'posts' as ContentFilter, label: 'Post' },
                ]).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setContentFilter(f.key);
                      const typeParam = f.key !== 'all' ? f.key : undefined;
                      if (selectedAccount) {
                        fetchPage({ page: 1, account: selectedAccount.username, type: typeParam });
                      } else {
                        fetchPage({ page: 1, type: typeParam });
                      }
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                      contentFilter === f.key
                        ? 'border-[var(--color-brand-nogi)] text-[var(--color-brand-nogi)] font-medium'
                        : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:border-[var(--border-secondary)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              </div>

              {/* Content grid */}
              {loading ? (
                <div className={`grid ${gridCols[cardSize]} gap-2`}>
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="aspect-square rounded-lg bg-[var(--bg-tertiary)] animate-pulse" />
                  ))}
                </div>
              ) : filteredItems.length > 0 ? (
                <>
                  <div className={`grid ${gridCols[cardSize]} gap-2`}>
                    {filteredItems.map((item, i) => {
                      const originalUrl = item.AlistUrl || INS_CONFIG.getMediaUrl(item.Key);
                      const thumbWidth = cardSize === 'small' ? 200 : cardSize === 'medium' ? 400 : 600;
                      const thumbUrl = item.isVideo ? originalUrl : INS_CONFIG.getThumbUrl(item.Key, thumbWidth);
                      return (
                        <div
                          key={item.Key || i}
                          onClick={() => setModalItem(item)}
                          role="button"
                          tabIndex={0}
                          className="group relative aspect-square rounded-lg overflow-hidden bg-[var(--bg-tertiary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] transition-colors cursor-pointer"
                        >
                          {item.isVideo ? (
                            <LazyVideo src={originalUrl} className="w-full h-full" />
                          ) : (
                            <LazyImage
                              src={thumbUrl}
                              fallbackSrc={originalUrl}
                              alt=""
                              className="w-full h-full"
                            />
                          )}
                          {/* Overlay on hover */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end">
                            <div className="w-full px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[8px] text-white/80 bg-black/40 px-1.5 py-0.5 rounded">
                                {item.username ? getDisplayName(item.username) : ''}
                                {item.date ? ` · ${item.date}` : ''}
                              </span>
                            </div>
                          </div>
                          {/* Video play icon */}
                          {item.isVideo && (
                            <div className="absolute top-1.5 left-1.5 pointer-events-none">
                              <Play size={14} className="text-white drop-shadow-md" fill="white" />
                            </div>
                          )}
                          {/* Content type badge */}
                          <div className="absolute bottom-1.5 right-1.5 pointer-events-none">
                            <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${item.contentType === 'stories' ? 'bg-purple-500/80' : 'bg-blue-500/80'} text-white`}>
                              {item.contentType === 'stories' ? 'S' : 'P'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Infinite scroll sentinel */}
                  {hasMore && (
                    <div ref={sentinelRef} className="flex justify-center py-6">
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        已显示 {items.length} / {totalCount}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-[var(--text-tertiary)]">
                  <p className="text-xs">暂无内容</p>
                </div>
              )}
            </>
          ) : (
            /* Empty state — no account selected */
            <div className="text-center py-16">
              <Camera size={32} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-40" />
              <p className="text-sm font-medium text-[var(--text-secondary)]">选择成员查看内容</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                从侧边栏选择账号浏览 Instagram 归档
              </p>
            </div>
          )}
        </div>
      </div>

      {/* === Mobile member drawer === */}
      {showMobileMembers && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowMobileMembers(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-[var(--bg-primary)] rounded-t-2xl max-h-[70vh] flex flex-col">
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-8 h-1 rounded-full bg-[var(--bg-tertiary)]" />
            </div>
            <div className="px-4 pb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">选择成员</h3>
              <button onClick={() => setShowMobileMembers(false)}>
                <X size={16} className="text-[var(--text-tertiary)]" />
              </button>
            </div>
            <div className="px-4 pb-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索成员..."
                  className="w-full pl-7 pr-2 py-1.5 text-[11px] border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-2 pb-6">
              {accounts.map((a) => (
                <button
                  key={a.username}
                  onClick={() => selectAccount(a)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <span
                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: GROUP_HEX[a.group] }}
                  >
                    {a.displayName.charAt(0)}
                  </span>
                  <div className="text-left min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">{a.displayName}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)] truncate">@{a.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* === Mobile bottom tab bar === */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--bg-primary)] border-t border-[var(--border-primary)] flex items-center justify-around py-2 px-1 safe-area-bottom">
        {([
          { key: 'all' as GroupFilter, label: '全部', icon: null },
          { key: 'nogizaka' as GroupFilter, label: '乃木坂', color: GROUP_HEX.nogizaka },
          { key: 'sakurazaka' as GroupFilter, label: '櫻坂', color: GROUP_HEX.sakurazaka },
          { key: 'hinatazaka' as GroupFilter, label: '日向坂', color: GROUP_HEX.hinatazaka },
          { key: 'favorites' as GroupFilter, label: '収藏', icon: 'star' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setGroup(tab.key); setSelectedAccount(null); setContentFilter('all'); loadGroupContent(tab.key); }}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 ${
              group === tab.key
                ? 'text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            {tab.icon === 'star' ? (
              <Star size={16} className={group === tab.key ? 'text-[var(--color-brand-nogi)]' : ''} />
            ) : tab.color ? (
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tab.color, opacity: group === tab.key ? 1 : 0.5 }} />
            ) : (
              <span className={`w-3 h-3 rounded-full border-2 ${group === tab.key ? 'border-[var(--text-primary)]' : 'border-[var(--text-tertiary)]'}`} />
            )}
            <span className="text-[9px] leading-tight">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* === Preview modal === */}
      {modalItem && createPortal(
        <div
          className="fixed inset-0 bg-black/90 flex flex-col"
          style={{ zIndex: 9999 }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalItem(null); }}
        >
          {/* Top toolbar */}
          <div className="flex-none flex items-center justify-end gap-1 p-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(modalItem.AlistUrl || INS_CONFIG.getMediaUrl(modalItem.Key));
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              title={linkCopied ? '已复制' : '复制链接'}
            >
              <Link2 size={18} />
              {linkCopied && <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] text-white/80 whitespace-nowrap bg-black/70 px-2 py-0.5 rounded">已复制</span>}
            </button>
            <a
              href={modalItem.AlistUrl || INS_CONFIG.getMediaUrl(modalItem.Key)}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              title="下载"
            >
              <Download size={18} />
            </a>
            <button
              onClick={() => setModalItem(null)}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Middle: content + nav */}
          <div className="flex-1 flex items-center justify-center min-h-0 relative px-12">
            {/* Nav prev */}
            {modalIndex > 0 && (
              <button
                onClick={() => navigateModal(-1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                style={{ zIndex: 1 }}
              >
                <ChevronLeft size={32} />
              </button>
            )}

            {/* Nav next */}
            {modalIndex < filteredItems.length - 1 && (
              <button
                onClick={() => navigateModal(1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                style={{ zIndex: 1 }}
              >
                <ChevronRight size={32} />
              </button>
            )}

            {/* Media */}
            <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
              {modalItem.isVideo ? (
                <video
                  ref={videoRef}
                  src={modalItem.AlistUrl || INS_CONFIG.getMediaUrl(modalItem.Key)}
                  controls
                  autoPlay
                  className="w-full max-h-[78vh] object-contain rounded-lg"
                />
              ) : (
                <img
                  src={modalItem.AlistUrl || INS_CONFIG.getMediaUrl(modalItem.Key)}
                  alt=""
                  className="w-full max-h-[78vh] object-contain rounded-lg"
                />
              )}
            </div>
          </div>

          {/* Bottom caption */}
          <div className="flex-none py-2 text-center">
            <span className="text-[10px] text-white/50">
              {modalItem.username ? getDisplayName(modalItem.username) : ''}
              {modalItem.contentType === 'stories' ? ' · Story' : ' · Post'}
              {modalItem.date ? ` · ${modalItem.date}` : ''}
              {` · ${modalIndex + 1}/${filteredItems.length}`}
            </span>
          </div>
        </div>
      , document.body)}

      {/* Close download menu on outside click */}
      {showDownloadMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowDownloadMenu(false)} />
      )}
    </div>
  );
}
