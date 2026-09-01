import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, ExternalLink, Headphones } from 'lucide-react';

// ─── Types ───────────────────────────────────────
interface Member {
  name: string;
  image: string;
}

interface Episode {
  ep: number;
  code: string;
  video_id: string;
  members: Member[];
  audio_url: string;
  detail_url: string;
  updated_at: string;
}

interface FourthLiveIndex {
  title: string;
  lead: string;
  lastUpdate: string;
  totalEpisodes: number;
  detailUrl: string;
  episodes: Episode[];
}

// ─── Constants ───────────────────────────────────
const INDEX_URL = 'https://alist.46log.com/d/sakumimi/4thlive/4thlive_index.json?t=' + Date.now();

const BRAND_PINK = '#F19DB5';
const BRAND_PINK_LIGHT = 'rgba(241,157,181,0.12)';

// ─── Component ───────────────────────────────────
export default function FourthLiveRadioArchive() {
  const [index, setIndex] = useState<FourthLiveIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Audio player
  const [playingEp, setPlayingEp] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch data ─────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetch(INDEX_URL, { signal: controller.signal })
      .then(r => r.json())
      .then((data: FourthLiveIndex) => setIndex(data))
      .catch(e => {
        if (e.name !== 'AbortError') {
          console.error('[FourthLiveRadio] fetch failed:', e);
          setError('データの読み込みに失敗しました');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
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
    if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
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

  if (!index || index.episodes.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-8 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">エピソードがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5">
        <div className="flex items-center gap-2 mb-2">
          <Headphones size={16} style={{ color: BRAND_PINK }} />
          <h2 className="text-base font-bold text-[var(--text-primary)]">{index.title}</h2>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
          {index.lead}
        </p>
        <div className="flex items-center gap-2 mt-3">
          <a
            href={index.detailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <ExternalLink size={10} />
            公式サイト
          </a>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {index.totalEpisodes} エピソード ・ {index.lastUpdate.slice(0, 10)} 更新
          </span>
        </div>
      </div>

      {/* Episode List */}
      <div className="space-y-4">
        {index.episodes.map(ep => (
          <div
            key={ep.ep}
            className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden hover:border-[var(--border-secondary)] transition-colors"
          >
            <div className="p-4">
              {/* Header: EP number */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-bold" style={{ color: BRAND_PINK }}>
                  #{String(ep.ep).padStart(2, '0')}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {ep.code}
                </span>
              </div>

              {/* Member photos */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                {ep.members.map((m, i) => (
                  <div key={i} className="text-center">
                    <div className="aspect-square rounded-lg overflow-hidden bg-[var(--bg-tertiary)] mb-1.5">
                      {m.image ? (
                        <img
                          src={m.image}
                          alt={m.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-[var(--text-tertiary)]">
                          {m.name}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full inline-block"
                      style={{ backgroundColor: BRAND_PINK_LIGHT, color: BRAND_PINK }}
                    >
                      {m.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
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

              {/* Audio progress bar */}
              {playingEp === ep.ep && (
                <div className="mt-3 space-y-1">
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
        ))}
      </div>
    </div>
  );
}
