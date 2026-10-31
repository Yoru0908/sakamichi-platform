import { useEffect, useRef, useState } from 'react';
import { Captions } from 'lucide-react';

// AI captions for the 坂道 live stream. The server (radio-caption on Homeserver) stamps each
// line with the wall-clock time its audio reached the server; MediaMTX stamps HLS segments
// with the same clock (EXT-X-PROGRAM-DATE-TIME), so a line is shown when the playhead gets there.

const API_BASE = 'https://api.46log.com';
const POLL_MS = 1500;
const LINGER_MS = 4000;           // keep a line up this long after its audio ends
const FALLBACK_DELAY_MS = 7000;   // listener lag assumed when the player has no PDT clock
const KEEP = 40;
const SETTINGS_KEY = '46log-radio-captions';

interface Caption { seq: number; t: number; dur: number; ja: string; zh: string }
interface Settings { on: boolean; ja: boolean }

interface Props {
  path: string;
  playing: boolean;
  playhead: () => number | null;  // epoch ms of the audio being heard, null if unknown
  accent: string;
}

function loadSettings(): Settings {
  try {
    return { on: true, ja: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { on: true, ja: true };
  }
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
        on
          ? 'border-[var(--color-brand-sakura,#F19DB5)] text-[var(--color-brand-sakura,#F19DB5)] bg-[var(--color-brand-sakura,#F19DB5)]/10'
          : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'
      }`}
    >
      {label}
    </button>
  );
}

export default function LiveCaptions({ path, playing, playhead, accent }: Props) {
  const [settings, setSettings] = useState<Settings>({ on: true, ja: true });
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [, setTick] = useState(0);
  const lastSeq = useRef(0);
  const skew = useRef(0);  // server clock minus client clock, ms

  useEffect(() => setSettings(loadSettings()), []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  // New stream: start over.
  useEffect(() => {
    setCaptions([]);
    lastSeq.current = 0;
  }, [path]);

  // Poll for new lines while the stream is playing.
  useEffect(() => {
    if (!playing || !settings.on) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/radio/live/captions/${path}?after=${lastSeq.current}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { now?: number; items?: Caption[]; unavailable?: boolean } = await res.json();
        if (stopped) return;
        if (data.now) skew.current = data.now - Date.now();
        setUnavailable(Boolean(data.unavailable));
        const items = data.items ?? [];
        if (!items.length) return;
        lastSeq.current = Math.max(lastSeq.current, ...items.map(c => c.seq));
        setCaptions(prev => [...prev, ...items].sort((a, b) => a.t - b.t).slice(-KEEP));
      } catch {
        if (!stopped) setUnavailable(true);
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [path, playing, settings.on]);

  // Re-pick the visible lines as the playhead moves.
  useEffect(() => {
    if (!playing || !settings.on) return;
    const id = setInterval(() => setTick(n => n + 1), 250);
    return () => clearInterval(id);
  }, [playing, settings.on]);

  const now = playhead() ?? Date.now() + skew.current - FALLBACK_DELAY_MS;
  // The last two lines the listener has reached stay up (transcript style); once the newest
  // has been over for LINGER_MS (music, CM, silence) both fade instead of disappearing.
  const lines = captions.filter(c => c.t <= now).slice(-2);
  const newest = lines[lines.length - 1];
  const stale = newest !== undefined && now > newest.t + newest.dur * 1000 + LINGER_MS;
  const waiting = unavailable ? '字幕サービスに接続できません' : playing ? '字幕を準備中…' : '再生すると字幕が表示されます';

  return (
    <div
      className="mt-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 cursor-default"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Captions size={14} style={{ color: accent }} />
        <span className="text-[11px] font-bold text-[var(--text-secondary)]">AI字幕</span>
        <span className="text-[9px] font-bold tracking-wide px-1.5 py-px rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
          BETA
        </span>
        <div className="ml-auto flex gap-1.5">
          {settings.on && <Toggle label="原文" on={settings.ja} onClick={() => update({ ja: !settings.ja })} />}
          <Toggle label={settings.on ? '字幕 ON' : '字幕 OFF'} on={settings.on} onClick={() => update({ on: !settings.on })} />
        </div>
      </div>

      {settings.on && (
        <div aria-live="polite" className="mt-3 min-h-[5.75rem] flex flex-col justify-end gap-2.5">
          {lines.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">{waiting}</p>
          ) : (
            lines.map((c, i) => (
              <div
                key={c.seq}
                className={`transition-opacity duration-300 ${i < lines.length - 1 || stale ? 'opacity-40' : ''}`}
              >
                <p className="text-[15px] sm:text-base font-medium leading-snug text-[var(--text-primary)]">
                  {c.zh || c.ja}
                </p>
                {settings.ja && c.zh && (
                  <p className="text-xs leading-snug text-[var(--text-tertiary)] mt-0.5">{c.ja}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <p className="mt-3 text-[10px] text-[var(--text-tertiary)]">
        音声認識と機械翻訳による自動字幕です。誤りを含む場合があります。
      </p>
    </div>
  );
}
