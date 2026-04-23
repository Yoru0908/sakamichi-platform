import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { Search, ChevronDown, ExternalLink, Play, Pause, X, SkipBack, SkipForward, Heart } from 'lucide-react';
import { $auth } from '@/stores/auth';
import { getBookmarks, addBookmark, removeBookmark } from '@/utils/auth-api';

// ─── Types ───────────────────────────────────────
interface Episode {
  ep: number;
  date: string;
  members: string[];
  summary: string;
  image: string;
  cover_url: string;
  audio_url: string;
  bilibili_bv: string;
  bilibili_url: string;
  detail_url: string;
  updated_at: string;
}

interface SakumimiIndex {
  lastUpdate: string;
  totalEpisodes: number;
  episodes: Record<string, Episode>;
}

// ─── Constants ───────────────────────────────────
const INDEX_URL = 'https://alist.46log.com/d/sakumimi/sakumimi_index.json?t=' + Date.now();
const MEMBERS_URL = '/data/member-images.json';
const PAGE_SIZE = 12;

const BRAND_PINK = '#F19DB5';
const BRAND_PINK_LIGHT = 'rgba(241,157,181,0.12)';

// ─── Component ───────────────────────────────────
export default function SakumimiArchive() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Members data
  const [sakuraMembers, setSakuraMembers] = useState<{ name: string; imageUrl: string; generation: string }[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [showMemberFilter, setShowMemberFilter] = useState(false);

  // Search & pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // Audio player
  const [playingEp, setPlayingEp] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Expanded episode (modal)
  const [expandedEp, setExpandedEp] = useState<Episode | null>(null);

  // Bookmarks
  const auth = useStore($auth);
  const [bookmarkedEps, setBookmarkedEps] = useState<Set<number>>(new Set());
  const [bookmarkLoading, setBookmarkLoading] = useState<number | null>(null);


  // ─── Fetch data ─────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch(INDEX_URL, { signal: controller.signal }).then(r => r.json()),
      fetch(MEMBERS_URL, { signal: controller.signal }).then(r => r.json()),
    ])
      .then(([indexData, membersData]: [SakumimiIndex, any]) => {
        // Process episodes - sort newest first
        const eps = Object.values(indexData.episodes)
          .sort((a, b) => b.ep - a.ep);
        setEpisodes(eps);

        // Extract sakurazaka members (no-space names only), sort by generation then あいうえお
        const GEN_ORDER: Record<string, number> = { '二期生': 1, '三期生': 2, '四期生': 3 };
        const members = Object.entries(membersData.images || {})
          .filter(([name, v]: [string, any]) => v.group === '樱坂46' && !name.includes(' '))
          .map(([name, v]: [string, any]) => ({ name, imageUrl: v.imageUrl, generation: v.generation || '' }))
          .sort((a, b) => {
            const ga = GEN_ORDER[a.generation] ?? 99;
            const gb = GEN_ORDER[b.generation] ?? 99;
            if (ga !== gb) return ga - gb;
            return a.name.localeCompare(b.name, 'ja');
          });
        setSakuraMembers(members);
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          console.error('[SakumimiArchive] fetch failed:', e);
          setError('データの読み込みに失敗しました');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  // ─── Fetch bookmarks when logged in ───────────────
  useEffect(() => {
    if (!auth.isLoggedIn) { setBookmarkedEps(new Set()); return; }
    getBookmarks().then(res => {
      if (res.success && res.data?.bookmarks) {
        setBookmarkedEps(new Set(res.data.bookmarks.map(b => b.episodeId)));
      }
    });
  }, [auth.isLoggedIn]);

  // ─── Filtering ──────────────────────────────────
  const filteredEpisodes = episodes.filter(ep => {
    // Member filter
    if (selectedMembers.size > 0) {
      if (!ep.members.some(m => selectedMembers.has(m))) return false;
    }
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !ep.summary.toLowerCase().includes(q) &&
        !ep.members.some(m => m.includes(searchQuery)) &&
        !String(ep.ep).includes(q)
      ) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredEpisodes.length / PAGE_SIZE);
  const pagedEpisodes = filteredEpisodes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [selectedMembers, searchQuery]);

  // ─── Bookmark toggle ─────────────────────────────
  const toggleBookmark = useCallback(async (epNum: number) => {
    if (!auth.isLoggedIn || bookmarkLoading !== null) return;
    setBookmarkLoading(epNum);
    try {
      if (bookmarkedEps.has(epNum)) {
        const res = await removeBookmark(epNum);
        if (res.success) setBookmarkedEps(prev => { const next = new Set(prev); next.delete(epNum); return next; });
      } else {
        const res = await addBookmark(epNum);
        if (res.success) setBookmarkedEps(prev => new Set(prev).add(epNum));
      }
    } finally {
      setBookmarkLoading(null);
    }
  }, [auth.isLoggedIn, bookmarkedEps, bookmarkLoading]);

  // ─── Member filter toggle ──────────────────────
  const toggleMember = useCallback((name: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // ─── Audio controls ────────────────────────────
  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startProgressTracking = useCallback(() => {
    stopProgressTracking();
    progressIntervalRef.current = setInterval(() => {
      const a = audioRef.current;
      if (a) {
        setAudioCurrentTime(a.currentTime);
        setAudioDuration(a.duration || 0);
        setAudioProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
      }
    }, 250);
  }, [stopProgressTracking]);

  const togglePlay = useCallback((ep: Episode) => {
    if (!ep.audio_url) return;
    if (playingEp === ep.ep) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
        stopProgressTracking();
      } else {
        audioRef.current?.play().catch(() => {});
        setIsPlaying(true);
        startProgressTracking();
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        stopProgressTracking();
      }
      const audio = new Audio(ep.audio_url);
      audio.play().catch(() => {});
      audio.onended = () => { setPlayingEp(null); setIsPlaying(false); stopProgressTracking(); setAudioProgress(0); };
      audio.onloadedmetadata = () => setAudioDuration(audio.duration);
      audioRef.current = audio;
      setPlayingEp(ep.ep);
      setIsPlaying(true);
      setAudioProgress(0);
      setAudioCurrentTime(0);
      startProgressTracking();
    }
  }, [playingEp, isPlaying, stopProgressTracking, startProgressTracking]);

  const seekAudio = useCallback((delta: number) => {
    const a = audioRef.current;
    if (a) {
      a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
    }
  }, []);

  const seekToPosition = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * a.duration;
  }, []);

  const formatTime = (sec: number) => {
    if (!sec || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { audioRef.current?.pause(); stopProgressTracking(); };
  }, [stopProgressTracking]);

  // ─── Render ─────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5">
            <div className="flex gap-4">
              <div className="w-36 sm:w-48 aspect-video rounded-lg bg-[var(--bg-tertiary)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[var(--bg-tertiary)] rounded w-20" />
                <div className="h-3 bg-[var(--bg-tertiary)] rounded w-full" />
                <div className="h-3 bg-[var(--bg-tertiary)] rounded w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-8 text-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Member Filter Toggle */}
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden">
        <button
          onClick={() => setShowMemberFilter(!showMemberFilter)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
        >
          <span>メンバーで絞り込み {selectedMembers.size > 0 && `(${selectedMembers.size})`}</span>
          <ChevronDown size={14} className={`transition-transform ${showMemberFilter ? 'rotate-180' : ''}`} />
        </button>

        {showMemberFilter && (
          <div className="px-4 pb-4 border-t border-[var(--border-primary)]">
            {(() => {
              const groups: { gen: string; members: typeof sakuraMembers }[] = [];
              let current: typeof sakuraMembers = [];
              let currentGen = '';
              for (const m of sakuraMembers) {
                if (m.generation !== currentGen) {
                  if (current.length > 0) groups.push({ gen: currentGen, members: current });
                  current = [m];
                  currentGen = m.generation;
                } else {
                  current.push(m);
                }
              }
              if (current.length > 0) groups.push({ gen: currentGen, members: current });

              return groups.map((g, gi) => (
                <div key={g.gen}>
                  <div className={`text-[10px] font-semibold text-[var(--text-tertiary)] ${gi > 0 ? 'mt-3 pt-2 border-t border-[var(--border-primary)]' : 'mt-3'} mb-1.5`}>
                    {g.gen || '不明'}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {g.members.map(m => (
                      <button
                        key={m.name}
                        onClick={() => toggleMember(m.name)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                          selectedMembers.has(m.name)
                            ? 'text-white shadow-sm'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                        style={selectedMembers.has(m.name) ? { backgroundColor: BRAND_PINK } : {}}
                      >
                        {m.imageUrl && (
                          <img
                            src={m.imageUrl}
                            alt={m.name}
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                            loading="lazy"
                          />
                        )}
                        <span className="truncate">{m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ));
            })()}
            {selectedMembers.size > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setSelectedMembers(new Set())}
                  className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline"
                >
                  選択をクリア
                </button>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {filteredEpisodes.length} 件
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder="期数・メンバー名・キーワードで検索..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[#F19DB5]/40"
        />
      </div>

      {/* Episode count */}
      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
        <span>{filteredEpisodes.length} エピソード</span>
        {totalPages > 1 && <span>{page} / {totalPages} ページ</span>}
      </div>

      {/* Episode List */}
      <div className="space-y-3">
        {pagedEpisodes.map(ep => (
          <div
            key={ep.ep}
            className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden hover:border-[var(--border-secondary)] transition-colors"
          >
            <div className="flex gap-4 p-4">
              {/* Cover image */}
              <div className="shrink-0">
                {(ep.cover_url || ep.image) ? (
                  <img
                    src={ep.cover_url || ep.image}
                    alt={`#${ep.ep}`}
                    className="w-36 sm:w-48 aspect-video rounded-lg object-cover bg-[var(--bg-tertiary)]"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-36 sm:w-48 aspect-video rounded-lg flex items-center justify-center text-white text-lg font-bold"
                    style={{ backgroundColor: BRAND_PINK }}
                  >
                    #{ep.ep}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header: EP number + date */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-bold" style={{ color: BRAND_PINK }}>
                    #{ep.ep}
                  </span>
                  {ep.date && (
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {ep.date} UP
                    </span>
                  )}
                </div>

                {/* Summary */}
                {ep.summary ? (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-2">
                    {ep.summary}
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)] italic mb-2">
                    詳細は公式サイトをご確認ください
                  </p>
                )}

                {/* Member tags */}
                {ep.members.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {ep.members.map(m => (
                      <span
                        key={m}
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: BRAND_PINK_LIGHT, color: BRAND_PINK }}
                      >
                        #{m}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {/* Bookmark button */}
                  {auth.isLoggedIn && (
                    <button
                      onClick={() => toggleBookmark(ep.ep)}
                      disabled={bookmarkLoading === ep.ep}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                        bookmarkedEps.has(ep.ep)
                          ? 'text-white'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                      } ${bookmarkLoading === ep.ep ? 'opacity-50' : ''}`}
                      style={bookmarkedEps.has(ep.ep) ? { backgroundColor: '#e74c6f' } : {}}
                      title={bookmarkedEps.has(ep.ep) ? 'お気に入り解除' : 'お気に入り'}
                    >
                      <Heart size={10} fill={bookmarkedEps.has(ep.ep) ? 'currentColor' : 'none'} />
                      {bookmarkedEps.has(ep.ep) ? '収藏済み' : '収藏'}
                    </button>
                  )}
                  {/* Audio play button */}
                  {ep.audio_url && (
                    <button
                      onClick={() => togglePlay(ep)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: BRAND_PINK }}
                    >
                      {playingEp === ep.ep && isPlaying ? <Pause size={10} /> : <Play size={10} />}
                      {playingEp === ep.ep && isPlaying ? '一時停止' : '再生'}
                    </button>
                  )}

                  {/* Bilibili link */}
                  {ep.bilibili_url && (
                    <a
                      href={ep.bilibili_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <ExternalLink size={10} />
                      B站
                    </a>
                  )}

                  {/* Official detail link */}
                  {ep.detail_url && (
                    <a
                      href={ep.detail_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <ExternalLink size={10} />
                      公式
                    </a>
                  )}
                </div>

                {/* Audio progress bar (visible when this episode is playing) */}
                {playingEp === ep.ep && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => seekAudio(-10)} className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors" title="-10秒">
                        <SkipBack size={12} />
                      </button>
                      <div
                        className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full cursor-pointer relative group"
                        onClick={seekToPosition}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${audioProgress}%`, backgroundColor: BRAND_PINK }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          style={{ left: `calc(${audioProgress}% - 6px)`, backgroundColor: BRAND_PINK }}
                        />
                      </div>
                      <button onClick={() => seekAudio(10)} className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors" title="+10秒">
                        <SkipForward size={12} />
                      </button>
                    </div>
                    <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] px-5">
                      <span>{formatTime(audioCurrentTime)}</span>
                      <span>{formatTime(audioDuration)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] disabled:opacity-30 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            前へ
          </button>
          <span className="text-xs text-[var(--text-tertiary)]">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] disabled:opacity-30 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            次へ
          </button>
        </div>
      )}

      {/* Empty state */}
      {filteredEpisodes.length === 0 && !loading && (
        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            該当するエピソードが見つかりませんでした
          </p>
        </div>
      )}
    </div>
  );
}
