import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Clock, Calendar, AlertCircle, Loader2, Radio } from 'lucide-react';

// ─── Config ─────────────────────────────────────
const API_BASE = 'https://radio.sakamichi-tools.cn';
const POLL_INTERVAL = 15_000;
const HLS_BUFFER_SEC = 10;
const HLS_PRIMARY_URL = '/hls/primary/index.m3u8';

// ─── Types ──────────────────────────────────────
interface NowPlayingStatus {
  primary_running: boolean;
  current_task: {
    title: string;
    station: string;
    station_id: string;
    performer: string;
    startTime: string;
    endTime: string;
  } | null;
  backup_station: string;
}

interface Program {
  id: string;
  title: string;
  station: string;
  station_id: string;
  startTime: string;
  endTime: string;
  duration: number;
  performer: string;
  image: string;
  tags: string[];
  genre: string;
}

// ─── Helpers ────────────────────────────────────
const GROUP_MAP: Record<string, string> = {
  '乃木坂': 'nogizaka',
  '日向坂': 'hinatazaka',
  '櫻坂': 'sakurazaka', '桜坂': 'sakurazaka',
};
const GROUP_COLORS: Record<string, string> = {
  nogizaka: 'var(--color-brand-nogi, #7B4BC1)',
  sakurazaka: 'var(--color-brand-sakura, #F19DB5)',
  hinatazaka: 'var(--color-brand-hinata, #64B5F6)',
  unknown: 'var(--text-tertiary, #999)',
};
function detectGroup(p: Program | { title: string; performer: string; station: string }): string {
  const text = `${p.title} ${p.performer} ${p.station}`;
  for (const [kw, group] of Object.entries(GROUP_MAP)) {
    if (text.includes(kw)) return group;
  }
  return 'unknown';
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const displayH = h < 5 ? h + 24 : h;
  return `${displayH}:${m}`;
}
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
function getDayLabel(iso: string): string {
  const d = new Date(iso);
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  return DAY_LABELS[d.getDay()];
}
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'まもなく開始';
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}時間${m}分${ss}秒後`;
  return `${m}分${ss}秒後`;
}

// ─── Component ──────────────────────────────────
export default function LiveRadioPlayer() {
  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [hlsReady, setHlsReady] = useState(false);
  const [hlsError, setHlsError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Live status
  const [liveStatus, setLiveStatus] = useState<NowPlayingStatus | null>(null);
  const [wasLive, setWasLive] = useState(false);

  // Schedule state
  const [schedule, setSchedule] = useState<Program[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    const now = new Date();
    if (now.getHours() < 5) now.setDate(now.getDate() - 1);
    return DAY_LABELS[now.getDay()];
  });
  const [nextProgram, setNextProgram] = useState<Program | null>(null);
  const [countdown, setCountdown] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // ─── Poll now-playing status ──────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/now-playing`);
      if (!res.ok) return;
      const data = await res.json();
      const status: NowPlayingStatus = {
        primary_running: data.status?.primary_running ?? false,
        current_task: data.status?.current_task ?? null,
        backup_station: data.status?.backup_station ?? '',
      };
      setLiveStatus(status);

      // Auto-connect when primary starts
      if (status.primary_running && !wasLive) {
        setWasLive(true);
        loadHls(HLS_PRIMARY_URL);
      }
      // Auto-disconnect when primary stops
      if (!status.primary_running && wasLive) {
        setWasLive(false);
        hlsRef.current?.destroy();
        audioRef.current?.pause();
        setIsPlaying(false);
        setHlsReady(false);
      }
    } catch { /* ignore */ }
  }, [wasLive]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // ─── HLS Setup ────────────────────────────────
  const loadHls = useCallback((hlsUrl: string) => {
    hlsRef.current?.destroy();
    setHlsReady(false);
    setHlsError('');
    const audio = audioRef.current;
    if (!audio) return;

    const fullUrl = `${API_BASE}${hlsUrl}`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: HLS_BUFFER_SEC + 5,
        maxMaxBufferLength: HLS_BUFFER_SEC + 15,
        liveSyncDurationCount: 5,
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 3,
      });
      hls.loadSource(fullUrl);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsReady(true);
        setHlsError('');
        setIsLoading(false);
        audio.play().then(() => setIsPlaying(true)).catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setHlsError('ストリーム接続失敗');
          setIsPlaying(false);
          setIsLoading(false);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setTimeout(() => hls.startLoad(), 3000);
          }
        }
      });
      hlsRef.current = hls;
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = fullUrl;
      audio.addEventListener('loadedmetadata', () => {
        setHlsReady(true);
        setIsLoading(false);
        audio.play().then(() => setIsPlaying(true)).catch(() => {});
      });
    }
  }, []);

  useEffect(() => {
    return () => { hlsRef.current?.destroy(); };
  }, []);

  // ─── Play/Pause ───────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !liveStatus?.primary_running) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      if (!hlsReady) loadHls(HLS_PRIMARY_URL);
      audio.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
        setHlsError('再生失敗');
      });
    }
  }, [isPlaying, hlsReady, liveStatus, loadHls]);

  // ─── Volume ───────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // ─── Fetch schedule ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/schedule/sakamichi`);
        if (!res.ok) return;
        const data = await res.json();
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 3600_000);
        const weekLater = new Date(now.getTime() + 7 * 86400_000);
        const progs = (data.programs || []).filter((p: Program) => {
          const t = new Date(p.startTime);
          return t >= dayAgo && t <= weekLater;
        });
        setSchedule(progs);

        // Find next upcoming (future only)
        const upcoming = progs
          .filter((p: Program) => new Date(p.startTime) > now)
          .sort((a: Program, b: Program) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        if (upcoming.length > 0) setNextProgram(upcoming[0]);
      } catch (e) {
        console.error('[LiveRadio] schedule fetch failed:', e);
      } finally {
        setScheduleLoading(false);
      }
    })();
  }, []);

  // ─── Countdown timer ──────────────────────────
  useEffect(() => {
    if (!nextProgram || liveStatus?.primary_running) {
      setCountdown('');
      return;
    }
    const update = () => {
      const diff = new Date(nextProgram.startTime).getTime() - Date.now();
      setCountdown(formatCountdown(diff));
    };
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [nextProgram, liveStatus?.primary_running]);

  // ─── Auto-select today (before 5 AM counts as previous day) ──
  // (initialized in useState above, effect kept for schedule data refresh)
  useEffect(() => {
    if (!selectedDay) {
      const now = new Date();
      if (now.getHours() < 5) now.setDate(now.getDate() - 1);
      setSelectedDay(DAY_LABELS[now.getDay()]);
    }
  }, []);

  // ─── Group schedule by day (dedup same-title programs across weeks) ──
  const scheduleByDay = (() => {
    const raw: Record<string, Program[]> = {};
    for (const p of schedule) {
      const day = getDayLabel(p.startTime);
      (raw[day] ??= []).push(p);
    }
    // Dedup: keep only the nearest-future occurrence per title per day
    const now = Date.now();
    const deduped: Record<string, Program[]> = {};
    for (const [day, progs] of Object.entries(raw)) {
      const seen = new Map<string, Program>();
      for (const p of progs) {
        const normTitle = p.title.replace(/[\s\u3000]/g, '');
        const existing = seen.get(normTitle);
        if (!existing) {
          seen.set(normTitle, p);
        } else {
          // Prefer the occurrence closest to (but >= ) now; fallback to nearest overall
          const eDiff = Math.abs(new Date(existing.startTime).getTime() - now);
          const pDiff = Math.abs(new Date(p.startTime).getTime() - now);
          if (pDiff < eDiff) seen.set(normTitle, p);
        }
      }
      deduped[day] = Array.from(seen.values());
    }
    // Sort each day by start time (display time)
    Object.values(deduped).forEach(arr =>
      arr.sort((a, b) => {
        const ha = new Date(a.startTime).getHours();
        const hb = new Date(b.startTime).getHours();
        const ta = ha < 5 ? ha + 24 : ha;
        const tb = hb < 5 ? hb + 24 : hb;
        return ta * 60 + new Date(a.startTime).getMinutes() - (tb * 60 + new Date(b.startTime).getMinutes());
      })
    );
    return deduped;
  })();

  const isLive = liveStatus?.primary_running && liveStatus.current_task;
  const currentTask = liveStatus?.current_task;

  // ─── Render ───────────────────────────────────
  return (
    <div>
      <audio ref={audioRef} preload="none" />

      {/* Live Player / Waiting Card */}
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 mb-5">
        {isLive && currentTask ? (
          <>
            {/* Currently airing sakamichi program */}
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" style={{ animationDuration: '2s' }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-[10px] font-bold text-red-500 uppercase">ON AIR</span>
              {hlsError && (
                <span className="flex items-center gap-1 text-[10px] text-red-400 ml-2">
                  <AlertCircle size={10} /> {hlsError}
                </span>
              )}
              <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                Buffer: {HLS_BUFFER_SEC}s
              </span>
            </div>

            <div className="flex items-center gap-4 py-2">
              <button
                onClick={togglePlay}
                disabled={isLoading}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0 hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: GROUP_COLORS[detectGroup(currentTask)] || GROUP_COLORS.unknown }}
              >
                {isLoading ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : isPlaying ? (
                  <Pause size={22} />
                ) : (
                  <Play size={22} className="ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-[var(--text-primary)] truncate">{currentTask.title}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                  {currentTask.station}
                  {currentTask.performer && ` · ${currentTask.performer}`}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                  {formatTime(currentTask.startTime)} - {formatTime(currentTask.endTime)}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={e => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                  className="w-20 h-1 accent-[var(--color-brand-sakura,#F19DB5)]"
                />
              </div>
            </div>

            <div className="h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden mt-3">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: isPlaying ? '100%' : '0%',
                  background: GROUP_COLORS[detectGroup(currentTask)] || GROUP_COLORS.unknown,
                  opacity: isPlaying ? 0.5 : 0,
                }}
              />
            </div>
          </>
        ) : (
          <>
            {/* No sakamichi program currently airing */}
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--text-tertiary)]" />
              </span>
              <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase">STANDBY</span>
            </div>

            <div className="py-6 text-center">
              <Radio size={28} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-40" />
              <p className="text-sm text-[var(--text-secondary)] font-medium">
                現在放送中の坂道番組はありません
              </p>
              {nextProgram && (
                <div className="mt-4 inline-flex flex-col items-center gap-1 px-5 py-3 rounded-lg bg-[var(--bg-secondary)]">
                  <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">次回放送</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{nextProgram.title}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {nextProgram.station}
                    {nextProgram.performer && ` · ${nextProgram.performer}`}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {formatTime(nextProgram.startTime)} - {formatTime(nextProgram.endTime)}
                  </p>
                  {countdown && (
                    <p className="text-xs font-medium mt-1" style={{ color: GROUP_COLORS[detectGroup(nextProgram)] }}>
                      {countdown}
                    </p>
                  )}
                </div>
              )}
              <p className="text-[10px] text-[var(--text-tertiary)] mt-4">
                番組開始時に自動的にストリームが開始されます
              </p>
            </div>
          </>
        )}
      </div>

      {/* Schedule */}
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border-primary)]">
          <Calendar size={13} className="text-[var(--text-tertiary)]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            坂道番組表
          </h2>
          <span className="text-[10px] text-[var(--text-tertiary)] ml-1">({schedule.length})</span>
        </div>

        {/* Day selector */}
        <div className="flex gap-1 px-5 py-2 border-b border-[var(--border-primary)] overflow-x-auto">
          {DAY_LABELS.map(day => {
            const count = scheduleByDay[day]?.length || 0;
            const isToday = day === DAY_LABELS[new Date().getDay()];
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                  selectedDay === day
                    ? 'bg-[var(--color-brand-sakura,#F19DB5)] text-white font-medium'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                {day}{isToday ? '(今日)' : ''}
                {count > 0 && (
                  <span className={`ml-1 text-[10px] ${selectedDay === day ? 'text-white/80' : ''}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Programs */}
        <div className="divide-y divide-[var(--border-primary)]">
          {scheduleLoading ? (
            <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)]">
              <Loader2 size={16} className="animate-spin mr-2" />
              <span className="text-xs">読み込み中...</span>
            </div>
          ) : !(scheduleByDay[selectedDay]?.length) ? (
            <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">
              {selectedDay}曜日の坂道番組はありません
            </div>
          ) : (
            scheduleByDay[selectedDay].map(prog => {
              const color = GROUP_COLORS[detectGroup(prog)];
              return (
                <div key={prog.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-secondary)] transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{prog.title}</p>
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                      {prog.station}{prog.performer && ` · ${prog.performer}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[var(--text-tertiary)] shrink-0">
                    <Clock size={10} />
                    <span className="text-[10px]">{formatTime(prog.startTime)}-{formatTime(prog.endTime)}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-tertiary)] w-8 text-right shrink-0">{prog.duration}m</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
