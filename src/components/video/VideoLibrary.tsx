import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Maximize, Volume2, VolumeX, ChevronLeft, Loader2, AlertCircle, List, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import DanmakuPlayer from './DanmakuPlayer';

// ─── Types ──────────────────────────────────────
interface Episode {
  name: string;
  size: number;
  modified: string;
  url: string;
  epNum: number;
  date: string;
  title: string;
}

interface EpisodeMetadata {
  episodes: Record<string, { title?: string; duration_sec?: number; size_mb?: number }>;
}

interface Props {
  showId: string;
  alistBase: string;
  alistPath: string;
  r2Base?: string;
  r2Prefix?: string;
}

// ─── Helpers ────────────────────────────────────
function parseEpisodeName(name: string): { epNum: number; date: string } {
  // Format 1: 230_25-4-14.mp4
  const numMatch = name.match(/^(\d+)_/);
  if (numMatch) {
    const epNum = parseInt(numMatch[1], 10);
    const dateMatch = name.match(/(\d+-\d+-\d+)/);
    const date = dateMatch ? dateMatch[1] : '';
    return { epNum, date };
  }
  // Format 2: そこ曲がったら、櫻坂_[25_4_14配信]#230.mp4
  const hashMatch = name.match(/#(\d+)/);
  const epNum = hashMatch ? parseInt(hashMatch[1], 10) : 0;
  // Extract date from [25_4_14配信] or 【25/4/14配信】
  const dateMatch = name.match(/[【\[]\s*(\d+)[/_](\d+)[/_](\d+)\s*配信\s*[】\]]/);
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : '';
  return { epNum, date };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

function formatDate(dateStr: string): string {
  // 25-4-14 → 2025/4/14
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `20${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Component ──────────────────────────────────
export default function VideoLibrary({ showId, alistBase, alistPath, r2Base, r2Prefix }: Props) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEp, setSelectedEp] = useState<Episode | null>(null);
  const [showList, setShowList] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const danmakuContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  // Dev: proxy through Vite /alist-api → Homeserver:5244/api
  const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const apiPrefix = isDev ? '/alist-api' : `${alistBase}/api`;
  const alistTokenRef = useRef<string>('');

  async function getAlistToken(): Promise<string> {
    if (alistTokenRef.current) return alistTokenRef.current;
    try {
      const resp = await fetch(`${apiPrefix}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'srzwyuu', password: 'admin123' }),
      });
      const data = await resp.json();
      if (data.code === 200 && data.data?.token) {
        alistTokenRef.current = data.data.token;
        return data.data.token;
      }
    } catch { /* ignore */ }
    return '';
  }

  // ─── Fetch episodes ─────────────────
  useEffect(() => {
    if (r2Base && r2Prefix) {
      fetchEpisodesR2();
    } else {
      fetchEpisodesAlist();
    }
  }, [alistBase, alistPath, r2Base, r2Prefix]);

  async function fetchEpisodesR2() {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${r2Base}/list/${r2Prefix}`);
      if (!resp.ok) throw new Error(`R2 list failed: ${resp.status}`);
      const files: Array<{ name: string; key: string; size: number; modified: string }> = await resp.json();
      const mp4s = files.filter((f) => f.name?.endsWith('.mp4'));

      const eps: Episode[] = mp4s.map((f) => {
        const { epNum, date } = parseEpisodeName(f.name!);
        return {
          name: f.name!,
          size: f.size,
          modified: f.modified,
          url: `${r2Base}/${f.key}`,
          epNum,
          date,
          title: '',
        };
      });

      eps.sort((a, b) => a.epNum - b.epNum);
      setEpisodes(eps);
      if (eps.length > 0 && !selectedEp) {
        setSelectedEp(eps[eps.length - 1]);
      }
    } catch (e: any) {
      setError(e.message || 'R2 error');
    }
    setLoading(false);
  }

  async function fetchEpisodesAlist() {
    setLoading(true);
    setError('');
    try {
      const token = await getAlistToken();
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) authHeaders['Authorization'] = token;

      const resp = await fetch(`${apiPrefix}/fs/list`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ path: alistPath, password: '', page: 1, per_page: 100, refresh: false }),
      });
      const data = await resp.json();
      if (data.code !== 200) {
        setError(data.message || 'Failed to fetch');
        setLoading(false);
        return;
      }
      const content = data.data?.content || [];
      const mp4s = content.filter((f: any) => f.name.endsWith('.mp4'));

      // Fetch metadata.json for episode titles
      let metadata: EpisodeMetadata | null = null;
      try {
        const metaResp = await fetch(`${apiPrefix}/fs/get`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ path: `${alistPath}/metadata.json`, password: '' }),
        });
        const metaData = await metaResp.json();
        if (metaData.code === 200 && metaData.data?.raw_url) {
          let metaUrl = metaData.data.raw_url;
          if (isDev) metaUrl = metaUrl.replace(/https?:\/\/[^/]+\/p\//, '/alist-p/');
          const metaJson = await fetch(metaUrl);
          if (metaJson.ok) metadata = await metaJson.json();
        }
      } catch { /* metadata optional */ }

      // Get raw_url for each file via fs/get
      const eps: Episode[] = [];
      for (const f of mp4s) {
        const { epNum, date } = parseEpisodeName(f.name);
        const filePath = `${alistPath}/${f.name}`;

        // Get raw download URL
        let rawUrl = '';
        try {
          const getResp = await fetch(`${apiPrefix}/fs/get`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ path: filePath, password: '' }),
          });
          const getData = await getResp.json();
          if (getData.code === 200 && getData.data?.raw_url) {
            rawUrl = getData.data.raw_url;
            // In dev mode, rewrite Homeserver Alist /p/ URLs to proxy
            if (isDev) {
              rawUrl = rawUrl.replace(/https?:\/\/[^/]+\/p\//, '/alist-p/');
            }
          }
        } catch { /* use fallback */ }

        // Get title from metadata
        const meta = metadata?.episodes?.[f.name];
        const title = meta?.title || '';

        eps.push({
          name: f.name,
          size: f.size,
          modified: f.modified,
          url: rawUrl,
          epNum,
          date,
          title,
        });
      }

      eps.sort((a, b) => a.epNum - b.epNum);
      setEpisodes(eps);
      if (eps.length > 0 && !selectedEp) {
        setSelectedEp(eps[eps.length - 1]);
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    }
    setLoading(false);
  }

  // ─── Video controls ────────────────────────────
  function playEpisode(ep: Episode) {
    setSelectedEp(ep);
    setVideoLoading(true);
    setShowList(false);
    // Video will auto-play when ready via onCanPlay
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }

  function toggleFullscreen() {
    const el = playerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  // Sync fullscreen state on ESC or programmatic exit
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = parseFloat(e.target.value);
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    setDuration(v.duration || 0);
  }

  // ─── Keyboard shortcuts ───────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const v = videoRef.current;
      if (!v) return;

      // Only handle shortcuts when not focused on inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          setIsMuted(v.muted);
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          setIsMuted(v.muted);
          break;
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        case 'm':
        case 'M':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleMute();
          }
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
          break;
        case 'c':
        case 'C':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setSidebarCollapsed(prev => !prev);
          }
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Sidebar episode list (shared between desktop/mobile) ───
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected episode in sidebar
  useEffect(() => {
    if (!selectedEp || !sidebarRef.current) return;
    const active = sidebarRef.current.querySelector('[data-active="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedEp]);

  function EpisodeSidebar({ compact = false }: { compact?: boolean }) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div
          className="shrink-0 px-3 py-2.5 flex items-center justify-between border-b"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            全 {episodes.length} 話
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            毎週自動更新
          </span>
        </div>

        {/* Scrollable episode list */}
        <div ref={sidebarRef} className="flex-1 overflow-y-auto overscroll-contain">
          {episodes.map((ep) => {
            const isActive = selectedEp?.name === ep.name;
            return (
              <button
                key={ep.name}
                data-active={isActive}
                onClick={() => playEpisode(ep)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-secondary)] group border-b"
                style={{
                  borderColor: 'var(--border-primary)',
                  background: isActive ? 'var(--bg-tertiary)' : undefined,
                }}
              >
                {/* Episode number badge */}
                <div
                  className={`shrink-0 rounded-lg flex items-center justify-center text-xs font-bold ${compact ? 'w-8 h-8' : 'w-9 h-9'}`}
                  style={{
                    background: isActive ? 'var(--color-brand-sakura)' : 'var(--bg-tertiary)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {ep.epNum}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`} style={{ color: 'var(--text-primary)' }}>
                    #{ep.epNum}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {formatDate(ep.date)}
                  </p>
                </div>

                {/* Size + play icon */}
                <div className="shrink-0 flex items-center gap-1.5">
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                    {formatSize(ep.size)}
                  </span>
                  {isActive ? (
                    <div className="w-3.5 h-3.5 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-brand-sakura)' }} />
                    </div>
                  ) : (
                    <Play
                      size={12}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--color-brand-sakura)' }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--text-tertiary)' }} />
        <span className="ml-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 gap-2">
        <AlertCircle size={18} style={{ color: '#ef4444' }} />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</span>
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>まだエピソードがありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* ─── Left: Player ─── */}
      <div className="flex-1 min-w-0">
        {selectedEp && (
          <div ref={playerRef} className="rounded-xl overflow-hidden" style={{ background: '#000' }}>
            {/* Episode info bar (above player) - hidden in fullscreen */}
            {!isFullscreen && <div className="px-4 py-3" style={{ background: 'var(--bg-secondary)' }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {selectedEp.title || `#${selectedEp.epNum}`}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {selectedEp.title ? `#${selectedEp.epNum} · ` : ''}{formatDate(selectedEp.date)} · {formatSize(selectedEp.size)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {episodes.indexOf(selectedEp) > 0 && (
                    <button
                      onClick={() => {
                        const idx = episodes.indexOf(selectedEp);
                        if (idx > 0) playEpisode(episodes[idx - 1]);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                    >
                      <ChevronLeft size={14} className="inline -mt-0.5" /> 前の回
                    </button>
                  )}
                  {episodes.indexOf(selectedEp) < episodes.length - 1 && (
                    <button
                      onClick={() => {
                        const idx = episodes.indexOf(selectedEp);
                        if (idx < episodes.length - 1) playEpisode(episodes[idx + 1]);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'var(--color-brand-sakura)', color: '#fff' }}
                    >
                      次の回 ›
                    </button>
                  )}
                </div>
              </div>
            </div>}

            {/* Video */}
            <div className="relative aspect-video">
              <video
                ref={videoRef}
                src={selectedEp.url}
                className="w-full h-full"
                onTimeUpdate={handleTimeUpdate}
                onCanPlay={() => {
                  setVideoLoading(false);
                  if (videoRef.current) {
                    videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  // Auto-play next episode
                  const idx = episodes.indexOf(selectedEp);
                  if (idx < episodes.length - 1) playEpisode(episodes[idx + 1]);
                }}
                onClick={togglePlay}
                playsInline
              />

              {/* Danmaku overlay container */}
              <div
                ref={danmakuContainerRef}
                className="absolute inset-0 pointer-events-none overflow-hidden"
                style={{ zIndex: 5 }}
              />

              {/* Loading overlay */}
              {videoLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="animate-spin text-white" size={32} />
                </div>
              )}

              {/* Controls overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                {/* Progress bar */}
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  step="any"
                  className="w-full h-1 appearance-none rounded-full cursor-pointer mb-2"
                  style={{
                    background: `linear-gradient(to right, var(--color-brand-sakura) ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.3) 0%)`,
                  }}
                />

                <div className="flex items-center justify-between text-white text-xs">
                  <div className="flex items-center gap-3">
                    <button onClick={togglePlay} className="hover:opacity-80 transition-opacity">
                      {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button onClick={toggleMute} className="hover:opacity-80 transition-opacity">
                      {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <span className="tabular-nums opacity-80">
                      {formatDuration(currentTime)} / {formatDuration(duration)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setShowList(!showList)} className="lg:hidden hover:opacity-80 transition-opacity">
                      <List size={16} />
                    </button>
                    <button onClick={toggleFullscreen} className="hover:opacity-80 transition-opacity">
                      <Maximize size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Danmaku input bar - hidden in fullscreen */}
            {!isFullscreen && <DanmakuPlayer
              videoRef={videoRef}
              danmakuContainerRef={danmakuContainerRef}
              videoId={`${showId}-${selectedEp.epNum}`}
            />}

            {/* Keyboard shortcuts hint - hidden in fullscreen */}
            {!isFullscreen && <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">Space</kbd> 播放/暂停</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">←/→</kbd> 5秒</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">J/L</kbd> 10秒</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">↑/↓</kbd> 音量</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">F</kbd> 全屏</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">M</kbd> 静音</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono">C</kbd> 折叠列表</span>
              </div>
            </div>}
          </div>
        )}

        {/* Mobile episode list (toggle) */}
        {showList && (
          <div className="lg:hidden mt-4 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-primary)' }}>
            <EpisodeSidebar />
          </div>
        )}
      </div>

      {/* ─── Right: Desktop Sidebar ─── */}
      <div
        className="hidden lg:flex flex-col shrink-0 rounded-xl overflow-hidden border transition-all duration-300"
        style={{ 
          borderColor: 'var(--border-primary)', 
          maxHeight: 'calc(100vh - 10rem)',
          width: sidebarCollapsed ? '48px' : '288px',
        }}
      >
        {sidebarCollapsed ? (
          // Collapsed state: just toggle button
          <div className="flex flex-col items-center py-4">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              title="展开集数列表 (C)"
            >
              <PanelLeftOpen size={18} />
            </button>
            <div className="mt-2 text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>
              {episodes.length}
            </div>
          </div>
        ) : (
          // Expanded state: full episode list
          <>
            <div className="shrink-0 px-3 py-2.5 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                全 {episodes.length} 話
              </span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                title="折叠集数列表 (C)"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
            <div ref={sidebarRef} className="flex-1 overflow-y-auto overscroll-contain">
              {episodes.map((ep) => {
                const isActive = selectedEp?.name === ep.name;
                return (
                  <button
                    key={ep.name}
                    data-active={isActive}
                    onClick={() => playEpisode(ep)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-secondary)] group border-b"
                    style={{
                      borderColor: 'var(--border-primary)',
                      background: isActive ? 'var(--bg-tertiary)' : undefined,
                    }}
                  >
                    {/* Episode number badge */}
                    <div
                      className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{
                        background: isActive ? 'var(--color-brand-sakura)' : 'var(--bg-tertiary)',
                        color: isActive ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {ep.epNum}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {ep.title ? ep.title.replace(/^.*?[【\[]/, '').replace(/[】\]].*$/, '').replace(/#\d+$/, '').trim() || `#${ep.epNum}` : `#${ep.epNum}`}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {formatDate(ep.date)}
                      </p>
                    </div>

                    {/* Play icon */}
                    <div className="shrink-0 flex items-center">
                      {isActive ? (
                        <div className="w-3.5 h-3.5 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-brand-sakura)' }} />
                        </div>
                      ) : (
                        <Play
                          size={12}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--color-brand-sakura)' }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
