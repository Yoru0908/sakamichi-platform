import { useEffect, useState } from 'react';
import { Calendar, Users, ArrowRight, Clock } from 'lucide-react';
import type { MiguriEvent, MiguriWindow, MiguriGroupId } from '@/utils/auth-api';

const API_BASE = 'https://api.46log.com/api/miguri';

const GROUP_COLORS: Record<MiguriGroupId, string> = {
  nogizaka: 'var(--color-brand-nogi)',
  sakurazaka: 'var(--color-brand-sakura)',
  hinatazaka: 'var(--color-brand-hinata)',
};

const GROUP_LABELS: Record<MiguriGroupId, string> = {
  nogizaka: '乃木坂46',
  sakurazaka: '櫻坂46',
  hinatazaka: '日向坂46',
};

// Parse "2026年6月24日（水）14:00" → Date (local time, JST assumed in source)
function parseWindowDate(value: string): Date | null {
  const match = value.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日.*?(\d{1,2})[：:](\d{2})/);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
  return Number.isNaN(date.getTime()) ? null : date;
}

type CardState = 'active' | 'upcoming';

interface MiguriCard {
  slug: string;
  group: MiguriGroupId;
  title: string;
  memberCount: number;
  windowLabel: string;
  state: CardState;
  target: Date; // active→end, upcoming→start
}

function buildCards(events: MiguriEvent[], now: Date): MiguriCard[] {
  const cards: MiguriCard[] = [];
  for (const ev of events) {
    let best: { window: MiguriWindow; state: CardState; target: Date } | null = null;
    for (const w of ev.windows) {
      const start = parseWindowDate(w.start);
      const end = parseWindowDate(w.end);
      if (!start || !end) continue;
      if (start <= now && end > now) {
        // active — highest priority
        best = { window: w, state: 'active', target: end };
        break;
      }
      if (start > now && (!best || best.state === 'upcoming' && start < best.target)) {
        best = { window: w, state: 'upcoming', target: start };
      }
    }
    if (!best) continue;
    cards.push({
      slug: ev.slug,
      group: ev.group,
      title: ev.title,
      memberCount: ev.members.length,
      windowLabel: best.window.label,
      state: best.state,
      target: best.target,
    });
  }
  // active first, then by target ascending
  cards.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'active' ? -1 : 1;
    return a.target.getTime() - b.target.getTime();
  });
  return cards.slice(0, 6);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '終了';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}日 ${hours}時間`;
  if (hours > 0) return `${hours}時間 ${mins}分`;
  return `${mins}分`;
}

export default function LatestMiguri() {
  const [cards, setCards] = useState<MiguriCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0); // force re-render for countdown

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/events`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.success && data.data?.events) {
          setCards(buildCards(data.data.events, new Date()));
        } else {
          setError('unexpected response');
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          console.error('[LatestMiguri] Failed to fetch:', e);
          setError(e.message || 'fetch failed');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  // Refresh countdown every minute
  useEffect(() => {
    if (cards.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, [cards.length]);

  if (!loading && cards.length === 0) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
          <Calendar size={14} />
          <h2 className="text-xs font-semibold uppercase tracking-wider">咪咕力受付</h2>
          {error && <span className="text-[10px] text-red-400 ml-2">[{error}]</span>}
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
          <Calendar size={14} />
          <h2 className="text-xs font-semibold uppercase tracking-wider">咪咕力受付</h2>
        </div>
        <a
          href="/miguri"
          className="flex items-center gap-1 text-xs font-medium text-[var(--color-brand-hinata)] hover:underline"
        >
          查看全部 <ArrowRight size={12} />
        </a>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 animate-pulse"
            >
              <div className="h-3 w-16 bg-[var(--bg-tertiary)] rounded mb-2" />
              <div className="h-4 w-full bg-[var(--bg-tertiary)] rounded mb-3" />
              <div className="h-6 w-20 bg-[var(--bg-tertiary)] rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {cards.map((card) => {
            const color = GROUP_COLORS[card.group];
            const now = new Date();
            const remaining = card.target.getTime() - now.getTime();
            const isActive = card.state === 'active';
            return (
              <a
                key={card.slug}
                href="/miguri"
                className="group rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="h-0.5" style={{ backgroundColor: color }} />
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color }}
                    >
                      {GROUP_LABELS[card.group]}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                        isActive
                          ? 'bg-red-500/15 text-red-500'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                      }`}
                    >
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                      {isActive ? '受付中' : '受付前'}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 mb-2 min-h-[2.5rem]">
                    {card.title}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                      <Users size={10} />
                      {card.memberCount}名
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${
                        isActive ? 'text-red-500' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <Clock size={11} />
                      {isActive
                        ? `残り ${formatCountdown(remaining)}`
                        : `${card.windowLabel} まで ${formatCountdown(remaining)}`}
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
