import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Play, Pause, SkipBack, SkipForward, Calendar, Download, Loader2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────
interface Recording {
  filename: string;
  title: string;
  date: string;
  size: number;
  format: string;
  created_at: string;
  modified_at: string;
  station?: string;
  station_id?: string;
  performer?: string;
  image?: string;
  url?: string;
  info?: string;
  description?: string;
}

type GroupFilter = 'all' | 'nogizaka' | 'sakurazaka' | 'hinatazaka' | 'other';

const GROUP_META: Record<Exclude<GroupFilter, 'all'>, { label: string; color: string; keywords: string[] }> = {
  nogizaka:  { label: '乃木坂', color: '#7B4BC1', keywords: ['乃木坂'] },
  sakurazaka:{ label: '櫻坂',  color: '#F19DB5', keywords: ['櫻坂', '桜坂'] },
  hinatazaka:{ label: '日向坂', color: '#64B5F6', keywords: ['日向坂'] },
  other:     { label: 'その他', color: '#9CA3AF', keywords: [] },
};

function detectGroup(title: string): Exclude<GroupFilter, 'all'> {
  for (const [key, meta] of Object.entries(GROUP_META) as [Exclude<GroupFilter,'all'>, typeof GROUP_META[keyof typeof GROUP_META]][]) {
    if (key === 'other') continue;
    if (meta.keywords.some(kw => title.includes(kw))) return key;
  }
  return 'other';
}

// ─── Constants ───────────────────────────────────
const PAGE_SIZE = 12;

// ─── Helpers ─────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(sec: number): string {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getRadioApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://127.0.0.1:8500';
    }
  }
  return 'https://radio.46log.com';
}

// ─── Component ───────────────────────────────────
export default function RecordingArchive() {
  const apiBase = getRadioApiBase();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [page, setPage] = useState(1);

  // Audio player
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch recordings ─────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(`${apiBase}/api/recordings`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setRecordings(data.recordings || []);
        setDates(data.dates || []);
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          console.error('[RecordingArchive] fetch failed:', e);
          setError('録音データの読み込みに失敗しました');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [apiBase]);

  // ─── Filtering ─────────────────────────────────
  const filtered = recordings.filter(r => {
    if (selectedDate && r.date !== selectedDate) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !r.filename.toLowerCase().includes(q)) return false;
    }
    if (groupFilter !== 'all') {
      if (detectGroup(r.title) !== groupFilter) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [selectedDate, searchQuery, groupFilter]);

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

  const togglePlay = useCallback((rec: Recording) => {
    const audioUrl = `${apiBase}/api/recordings/play/${encodeURIComponent(rec.filename)}`;

    if (playingFile === rec.filename) {
      audioRef.current?.pause();
      setPlayingFile(null);
      stopProgressTracking();
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        stopProgressTracking();
      }
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {});
      audio.onended = () => { setPlayingFile(null); stopProgressTracking(); setAudioProgress(0); };
      audio.onloadedmetadata = () => setAudioDuration(audio.duration);
      audioRef.current = audio;
      setPlayingFile(rec.filename);
      setAudioProgress(0);
      setAudioCurrentTime(0);
      startProgressTracking();
    }
  }, [apiBase, playingFile, stopProgressTracking, startProgressTracking]);

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

  useEffect(() => {
    return () => { audioRef.current?.pause(); stopProgressTracking(); };
  }, [stopProgressTracking]);

  // ─── Render ────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
        <span className="ml-2 text-xs text-[var(--text-tertiary)]">読み込み中...</span>
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
      {/* Group filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'nogizaka', 'sakurazaka', 'hinatazaka', 'other'] as GroupFilter[]).map(g => {
          const isActive = groupFilter === g;
          const meta = g !== 'all' ? GROUP_META[g] : null;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGroupFilter(g)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border ${
                isActive
                  ? 'text-white border-transparent'
                  : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
              }`}
              style={isActive ? { backgroundColor: meta?.color ?? 'var(--text-primary)', borderColor: 'transparent' } : undefined}
            >
              {g === 'all' ? '全部' : meta!.label}
              {g !== 'all' && (
                <span className={`ml-1 text-[10px] ${isActive ? 'opacity-70' : 'opacity-50'}`}>
                  {recordings.filter(r => detectGroup(r.title) === g).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="番組名・キーワードで検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-sakura)]/40"
          />
        </div>

        {/* Date filter */}
        {dates.length > 0 && (
          <div className="relative shrink-0">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="appearance-none pl-9 pr-8 py-2.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-sakura)]/40 cursor-pointer"
            >
              <option value="">全日期</option>
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Count */}
      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
        <span>{filtered.length} 件の録音</span>
        {totalPages > 1 && <span>{page} / {totalPages} ページ</span>}
      </div>

      {/* Recording list */}
      <div className="space-y-2">
        {paged.map(rec => {
          const isActive = playingFile === rec.filename;
          const group = detectGroup(rec.title);
          const groupColor = GROUP_META[group].color;
          return (
            <div
              key={rec.filename}
              className={`rounded-xl border bg-[var(--bg-primary)] overflow-hidden transition-colors ${
                isActive ? 'border-[var(--color-brand-sakura)]/50' : 'border-[var(--border-primary)] hover:border-[var(--border-secondary)]'
              }`}
            >
              <div className="flex items-start gap-3 p-4">
                {rec.image ? (
                  <img
                    src={rec.image}
                    alt={rec.title}
                    className="hidden sm:block w-28 lg:w-32 aspect-video rounded-lg object-cover bg-[var(--bg-tertiary)] shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="hidden sm:flex w-28 lg:w-32 aspect-video rounded-lg bg-[var(--bg-tertiary)] shrink-0 items-center justify-center text-[10px] text-[var(--text-tertiary)]">
                    NO IMAGE
                  </div>
                )}

                {/* Play button */}
                <button
                  onClick={() => togglePlay(rec)}
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isActive ? 'text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                  }`}
                  style={isActive ? { backgroundColor: groupColor } : undefined}
                >
                  {isActive ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {rec.title}
                  </p>
                  {(rec.station || rec.performer) && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-[var(--text-secondary)]">
                      {rec.station && <span>{rec.station}</span>}
                      {rec.station && rec.performer && <span>·</span>}
                      {rec.performer && <span className="truncate">{rec.performer}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-tertiary)]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: groupColor }} />
                    <span>{GROUP_META[group].label}</span>
                    <span>·</span>
                    <span>{rec.date}</span>
                    <span>·</span>
                    <span>{formatFileSize(rec.size)}</span>
                    <span>·</span>
                    <span>{rec.format.toUpperCase()}</span>
                  </div>
                  {rec.description && (
                    <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-tertiary)] line-clamp-2">
                      {rec.description}
                    </p>
                  )}
                </div>

                {/* Download */}
                <a
                  href={`${apiBase}/api/recordings/play/${encodeURIComponent(rec.filename)}`}
                  download={rec.filename}
                  className="shrink-0 p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  title="ダウンロード"
                >
                  <Download size={14} />
                </a>
              </div>

              {/* Progress bar (visible when playing) */}
              {isActive && (
                <div className="px-4 pb-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => seekAudio(-10)}
                      className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                      title="-10秒"
                    >
                      <SkipBack size={12} />
                    </button>
                    <div
                      className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full cursor-pointer relative group"
                      onClick={seekToPosition}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${audioProgress}%`, backgroundColor: 'var(--color-brand-sakura, #F19DB5)' }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        style={{ left: `calc(${audioProgress}% - 6px)`, backgroundColor: 'var(--color-brand-sakura, #F19DB5)' }}
                      />
                    </div>
                    <button
                      onClick={() => seekAudio(10)}
                      className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                      title="+10秒"
                    >
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
          );
        })}
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
      {filtered.length === 0 && !loading && (
        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            {recordings.length === 0
              ? '録音ファイルはまだありません'
              : '該当する録音が見つかりませんでした'}
          </p>
          {recordings.length === 0 && (
            <p className="text-[10px] text-[var(--text-tertiary)] mt-2">
              坂道番組が録制されると、ここに表示されます
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] text-[var(--text-tertiary)] text-center">
        HomeServer 録制アーカイブ
      </p>
    </div>
  );
}
