import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useLanguage } from '@/i18n/use-language';
import type { Language } from '@/stores/language';

// One-time popup (2026-10-28): desktop only, marked seen as soon as it shows. Bump the id for the next one.
const STORAGE_KEY = 'feature-announcement-seen';
const ANNOUNCEMENT_ID = 'miguri-lapse-resync-2026-10-28';
const DESKTOP = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

const COPY: Record<Language, { title: string; lead: string; points: string[]; note: string; go: string; close: string; x: string }> = {
  zh: {
    title: 'Music 履历已更新：请再同步一次',
    lead: '之前没付款而失效的 Music 当选，被算进了持有张数和金额里，现在已修正：',
    points: ['手续期限已过、整笔申请被官方取消（失效）的当选，不再计入持有张数和金额', '请到「咪咕力管理」重新同步一次 Music，旧记录才会被更正'],
    note: '还在手续期限内、未付款的当选，官方页面上看不出来，暂时仍会计入；过期变成失效后再同步一次即可去掉。',
    go: '去同步',
    close: '知道了',
    x: '关闭',
  },
  ja: {
    title: 'Music 履歴を修正しました：もう一度同期してください',
    lead: '未入金で失効した Music の当選が、所持枚数と金額に含まれていた問題を修正しました：',
    points: ['手続き期限切れで応募ごとキャンセル（失効）になった当選は、所持枚数・金額に入らなくなります', '「ミーグリ管理」で Music をもう一度同期すると、これまでの記録が修正されます'],
    note: '手続き期限内でまだ未入金の当選は公式ページから判別できないため、今は含まれます。失効になった後にもう一度同期すると外れます。',
    go: '同期する',
    close: 'OK',
    x: '閉じる',
  },
  en: {
    title: 'Music history fixed: please sync again',
    lead: 'Music wins that lapsed unpaid were counted as held tickets and spend. That is fixed:',
    points: ['Wins from an application the official site cancelled for a missed payment deadline (失効) no longer count as held or as spend', 'Sync Music again in Miguri Manager to correct your existing records'],
    note: 'Unpaid wins still inside the payment window cannot be told apart on the official page, so they count for now. Sync again after they lapse and they drop out.',
    go: 'Go sync',
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
          <RefreshCw size={22} />
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
