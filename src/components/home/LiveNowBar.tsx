import { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';

const RADIO_API = 'https://radio.sakamichi-tools.cn';

interface Program {
  title: string;
  station: string;
  performer: string;
  startTime: string;
  endTime: string;
}

function formatRadioTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const displayH = h < 5 ? h + 24 : h;
  return `${displayH}:${m}`;
}

export default function LiveNowBar() {
  const [current, setCurrent] = useState<Program | null>(null);
  const [next, setNext] = useState<Program | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${RADIO_API}/api/schedule/sakamichi`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        const now = new Date();
        const progs: Program[] = data.programs || [];

        // Find currently airing sakamichi program
        const airing = progs.find(p => {
          const st = new Date(p.startTime);
          const et = new Date(p.endTime);
          return st <= now && now <= et;
        });

        if (airing) {
          setCurrent(airing);
        } else {
          // Find next upcoming program
          const upcoming = progs
            .filter(p => new Date(p.startTime) > now)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
          if (upcoming.length > 0) {
            setNext(upcoming[0]);
          }
        }
      })
      .catch(e => {
        if (e.name !== 'AbortError') console.error('[LiveNowBar] fetch failed:', e);
      });

    return () => controller.abort();
  }, []);

  if (!current && !next) return null;

  return (
    <div className="border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-2.5 text-sm">
          {current ? (
            <>
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" style={{ animationDuration: '2s' }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>

              <Radio size={14} className="text-[var(--text-tertiary)] shrink-0" />

              <span className="text-[var(--text-secondary)] truncate">
                <span className="font-medium text-[var(--text-primary)]">{current.station}</span>
                {' '}
                <span className="hidden sm:inline">「{current.title}」</span>
                {current.performer && (
                  <span className="text-[var(--text-tertiary)]"> · {current.performer}</span>
                )}
                <span className="text-[var(--text-tertiary)]"> · {formatRadioTime(current.startTime)} - {formatRadioTime(current.endTime)}</span>
              </span>

              <a
                href="/radio"
                className="ml-auto shrink-0 text-xs font-medium text-[var(--color-brand-nogi)] hover:underline"
              >
                立即收听 →
              </a>
            </>
          ) : next ? (
            <>
              <Radio size={14} className="text-[var(--text-tertiary)] shrink-0" />
              <span className="text-[var(--text-secondary)] truncate">
                次回放送:
                <span className="font-medium text-[var(--text-primary)] ml-1">{next.station}</span>
                {' '}
                <span className="hidden sm:inline">「{next.title}」</span>
                {next.performer && (
                  <span className="text-[var(--text-tertiary)]"> · {next.performer}</span>
                )}
              </span>
              <span className="ml-auto shrink-0 text-xs text-[var(--text-tertiary)]">
                {formatRadioTime(next.startTime)} - {formatRadioTime(next.endTime)}
              </span>
              <a
                href="/radio"
                className="shrink-0 text-xs font-medium text-[var(--color-brand-nogi)] hover:underline hidden sm:inline"
              >
                查看节目表 →
              </a>
              <a
                href="/radio"
                className="shrink-0 text-xs font-medium text-[var(--color-brand-nogi)] hover:underline sm:hidden"
              >
                收听 →
              </a>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
