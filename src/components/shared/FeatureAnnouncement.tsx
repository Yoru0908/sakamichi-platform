import { useEffect, useState } from 'react';
import { BarChart3, X } from 'lucide-react';
import { useLanguage } from '@/i18n/use-language';
import type { Language } from '@/stores/language';

// One-time feature popup (2026-10-24): desktop only, marked seen as soon as it shows. Bump the id for the next one.
const STORAGE_KEY = 'feature-announcement-seen';
const ANNOUNCEMENT_ID = 'miguri-stats-2026-10-24';
const DESKTOP = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

const COPY: Record<Language, { title: string; lead: string; points: string[]; note: string; go: string; close: string; x: string }> = {
  zh: {
    title: '新功能：中签率和实际开销',
    lead: '在「咪咕力管理」同步 forTUNE music / meets 履历后，可以看到：',
    points: ['过往每一期的抽选中签率推移（按成员、按部、按会场）', '自己实际花了多少钱，按成员、按类别分开统计'],
    note: 'Music 只算中签张数；Meets 用自己买的碟应募的中没中都算，保障应募不重复计费。',
    go: '去看看',
    close: '知道了',
    x: '关闭',
  },
  ja: {
    title: '新機能：当選率と実際の支払額',
    lead: '「ミーグリ管理」で forTUNE music / meets の履歴を同期すると、次の内容が見られます：',
    points: ['過去の抽選ごとの当選率の推移（メンバー別・部別・会場別）', '実際に支払った金額（メンバー別・種類別）'],
    note: 'Music は当選枚数だけ、Meets は自分で買った CD での応募を当落に関係なく計上。保障応募は二重に計上しません。',
    go: '見てみる',
    close: 'OK',
    x: '閉じる',
  },
  en: {
    title: 'New: win rates and what you actually spent',
    lead: 'Sync your forTUNE music / meets history in Miguri Manager to see:',
    points: ['Your win rate over past lotteries, by member, part and venue', 'What you actually spent, by member and by category'],
    note: 'Music counts won tickets only; Meets counts every entry made with CDs you bought, won or lost. Guarantee entries are not charged twice.',
    go: 'Take a look',
    close: 'Got it',
    x: 'Close',
  },
};

function claim() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === ANNOUNCEMENT_ID) return false;
    localStorage.setItem(STORAGE_KEY, ANNOUNCEMENT_ID);
    return true;
  } catch {
    return false;
  }
}

export default function FeatureAnnouncement() {
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const copy = COPY[lang] || COPY.zh;

  useEffect(() => {
    // Already on the dashboard: nothing to announce, and it counts as seen.
    if (location.pathname.startsWith('/miguri')) { claim(); return; }
    if (window.matchMedia(DESKTOP).matches && claim()) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-announcement-title"
        className="relative w-full max-w-md rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-7 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-secondary)]"
          aria-label={copy.x}
        >
          <X size={18} />
        </button>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--color-brand-nogi)]">
          <BarChart3 size={22} />
        </div>
        <h2 id="feature-announcement-title" className="mt-4 text-xl font-bold text-[var(--text-primary)]">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{copy.lead}</p>
        <ul className="mt-3 space-y-1.5 text-sm leading-6 text-[var(--text-primary)]">
          {copy.points.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-nogi)]" />
              {point}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-5 text-[var(--text-tertiary)]">{copy.note}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-primary)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            {copy.close}
          </button>
          <a
            href="/miguri/"
            className="inline-flex min-h-11 items-center rounded-xl bg-[var(--text-primary)] px-4 text-sm font-bold text-[var(--bg-primary)] transition-opacity hover:opacity-85"
          >
            {copy.go}
          </a>
        </div>
      </div>
    </div>
  );
}
