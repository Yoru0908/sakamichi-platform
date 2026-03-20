import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, AlertCircle, Loader2, Radio } from 'lucide-react';

// ─── Config ─────────────────────────────────────
const API_BASE = 'https://radio.sakamichi-tools.cn';
const HEARTBEAT_INTERVAL = 60_000;
const HLS_BUFFER_SEC = 10;

// ─── Types ──────────────────────────────────────
interface Station {
  id: string;
  name: string;
  region: string;
  streaming: boolean;
  hls_url: string | null;
}

const REGION_ORDER = ['関東', '山梨', '関西', '東海', '北海道'];

// ─── Component ──────────────────────────────────
export default function RadikoPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [hlsReady, setHlsReady] = useState(false);
  const [hlsError, setHlsError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [tuning, setTuning] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch station list ───────────────────────
  const fetchStations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/live/stations`);
      if (!res.ok) return;
      const data = await res.json();
      setStations(data.stations || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStations();
    const id = setInterval(fetchStations, 15_000);
    return () => clearInterval(id);
  }, [fetchStations]);

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

  // ─── Tune to station ──────────────────────────
  const tuneToStation = useCallback(async (station: Station) => {
    if (tuning) return;
    setTuning(true);
    setIsLoading(true);
    setHlsError('');

    audioRef.current?.pause();
    setIsPlaying(false);

    try {
      const res = await fetch(`${API_BASE}/api/live/tune/${station.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.hls_url) {
        setSelectedStation({ ...station, streaming: true, hls_url: data.hls_url });
        loadHls(data.hls_url);

        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          fetch(`${API_BASE}/api/live/heartbeat/${station.id}`, { method: 'POST' }).catch(() => {});
        }, HEARTBEAT_INTERVAL);
      } else {
        setHlsError(data.error || 'チューニング失敗');
        setIsLoading(false);
      }
    } catch {
      setHlsError('接続エラー');
      setIsLoading(false);
    } finally {
      setTuning(false);
    }
  }, [tuning, loadHls]);

  // ─── Play/Pause ───────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else if (selectedStation?.hls_url) {
      setIsLoading(true);
      if (!hlsReady) loadHls(selectedStation.hls_url);
      audio.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
        setHlsError('再生失敗');
      });
    }
  }, [isPlaying, hlsReady, selectedStation, loadHls]);

  // ─── Volume ───────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // ─── Cleanup ──────────────────────────────────
  useEffect(() => {
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, []);

  // ─── Group stations by region ─────────────────
  const stationsByRegion = REGION_ORDER.reduce<Record<string, Station[]>>((acc, region) => {
    const list = stations.filter(s => s.region === region);
    if (list.length) acc[region] = list;
    return acc;
  }, {});

  // ─── Render ───────────────────────────────────
  return (
    <div>
      <audio ref={audioRef} preload="none" />

      {/* Station Selector */}
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Radio size={13} className="text-[var(--text-tertiary)]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            電台選択
          </h2>
          {selectedStation && (
            <span className="text-[10px] text-[var(--color-brand-sakura,#F19DB5)] ml-auto">
              {selectedStation.name}
            </span>
          )}
        </div>

        {Object.entries(stationsByRegion).map(([region, stationList]) => (
          <div key={region} className="mb-3 last:mb-0">
            <p className="text-[10px] text-[var(--text-tertiary)] mb-1.5 pl-0.5">{region}</p>
            <div className="flex flex-wrap gap-1.5">
              {stationList.map(s => {
                const isSelected = selectedStation?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => tuneToStation(s)}
                    disabled={tuning && !isSelected}
                    className={`px-3 py-1.5 text-[11px] rounded-lg border transition-all whitespace-nowrap ${
                      isSelected
                        ? 'bg-[var(--color-brand-sakura,#F19DB5)] text-white border-transparent font-medium'
                        : s.streaming
                          ? 'border-[var(--color-brand-sakura,#F19DB5)] text-[var(--color-brand-sakura,#F19DB5)] bg-transparent hover:bg-[var(--bg-secondary)]'
                          : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:border-[var(--text-tertiary)]'
                    } disabled:opacity-40`}
                  >
                    {s.name}
                    {isSelected && isPlaying && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-white ml-1.5 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {stations.length === 0 && (
          <div className="py-4 text-center text-xs text-[var(--text-tertiary)]">
            <Loader2 size={14} className="animate-spin inline mr-1" />
            電台リスト読み込み中...
          </div>
        )}
      </div>

      {/* Player Card */}
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2 w-2">
            {isPlaying ? (
              <>
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" style={{ animationDuration: '2s' }} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </>
            ) : (
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--text-tertiary)]" />
            )}
          </span>
          <span className="text-[10px] font-medium text-[var(--text-secondary)]">
            {isPlaying ? 'LIVE' : selectedStation ? 'TUNED' : 'STANDBY'}
          </span>
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
            onClick={selectedStation ? togglePlay : undefined}
            disabled={isLoading || !selectedStation}
            className="w-12 h-12 rounded-full bg-[var(--color-brand-sakura,#F19DB5)] flex items-center justify-center text-white shrink-0 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={20} />
            ) : (
              <Play size={20} className="ml-0.5" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {selectedStation ? `${selectedStation.name} を受信中` : '電台を選択してください'}
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
              {selectedStation ? `${selectedStation.id} · ${selectedStation.region} · Radiko HLS` : '--'}
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
              background: 'var(--color-brand-sakura, #F19DB5)',
              opacity: isPlaying ? 0.5 : 0,
            }}
          />
        </div>
      </div>

      <p className="text-[10px] text-[var(--text-tertiary)] mt-3 text-center">
        日本電台 ライブストリーミング · 30分無操作で自動停止 · Radiko経由
      </p>
    </div>
  );
}
