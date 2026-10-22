import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPin, RefreshCw, Search, Users } from 'lucide-react';
import { t, type TranslationKey } from '@/i18n';
import { useLanguage } from '@/i18n/use-language';
import { API_CONFIG } from '@/utils/constants';
import { SCHEDULE_GROUPS } from '@/components/schedule/schedule-ics';
import {
  byMonth, filterCards, FIRST_YEAR, toCards, yearsOf,
  type CategoryFilter, type EventCard, type EventGroupId, type SakamichiEvent,
} from './events-data';

const API = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.miguri}/sakamichi-events`;
const LOCALE = { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' } as const;
const CATEGORIES: { id: CategoryFilter; label: TranslationKey }[] = [
  { id: 'all', label: 'events.all' }, { id: 'attend', label: 'events.attend' }, { id: 'online', label: 'events.online' },
];
const jstYear = () => new Date(Date.now() + 9 * 3600e3).getUTCFullYear();
const isGroup = (s: string | null): s is EventGroupId => !!s && Object.hasOwn(FIRST_YEAR, s);

/** ?grp=&year= of a shared link, else Nogizaka this year (JST). Mounted with client:only: today's year, not the build's. */
function initialView(): { grp: EventGroupId; year: number } {
  const q = new URLSearchParams(location.search), g = q.get('grp'), grp = isGroup(g) ? g : 'nogizaka', y = Number(q.get('year'));
  return { grp, year: Number.isInteger(y) && y >= FIRST_YEAR[grp] && y <= jstYear() + 1 ? y : jstYear() };
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; events: SakamichiEvent[] };
const loaded = new Map<string, SakamichiEvent[]>();   // grp:year → rows, for switching back without a refetch

export default function SakamichiEvents() {
  const lang = useLanguage(), tr = (k: TranslationKey, n?: number) => t(k, lang, n === undefined ? undefined : { n: String(n) });
  const [start] = useState(initialView);
  const [grp, setGrp] = useState(start.grp);
  const [year, setYear] = useState(start.year);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { history.replaceState(null, '', `?grp=${grp}&year=${year}`); }, [grp, year]);   // the view stays shareable

  useEffect(() => {
    const key = `${grp}:${year}`, hit = loaded.get(key);
    if (hit) { setLoad({ state: 'ready', events: hit }); return; }
    const ctl = new AbortController();
    setLoad({ state: 'loading' });
    fetch(`${API}?grp=${grp}&year=${year}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: { data?: { events?: SakamichiEvent[] } }) => {
        const events = body.data?.events ?? [];
        loaded.set(key, events);
        setLoad({ state: 'ready', events });
      })
      .catch((e) => { if (e.name !== 'AbortError') setLoad({ state: 'error' }); });
    return () => ctl.abort();
  }, [grp, year, attempt]);

  const cards = useMemo(() => (load.state === 'ready' ? toCards(load.events) : []), [load]);
  const shown = useMemo(() => filterCards(cards, category, query), [cards, category, query]);
  const group = SCHEDULE_GROUPS.find((g) => g.id === grp)!;
  const pickGroup = (g: EventGroupId) => { setGrp(g); setYear((y) => Math.max(y, FIRST_YEAR[g])); };

  return (
    <div>
      <section className="mb-5 space-y-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {SCHEDULE_GROUPS.map((g) => {
            const active = g.id === grp;
            return (
              <button key={g.id} type="button" onClick={() => pickGroup(g.id)} aria-pressed={active}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold"
                style={{ borderColor: active ? `${g.color}88` : 'var(--border-primary)', backgroundColor: active ? g.softColor : 'var(--bg-primary)',
                  color: active ? '#202024' : 'var(--text-tertiary)' }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                {g.label}
              </button>
            );
          })}
          <label className="ml-auto inline-flex min-h-10 items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span>{tr('events.year')}</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="min-h-10 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 text-sm font-semibold text-[var(--text-primary)]">
              {yearsOf(grp).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" onClick={() => setCategory(c.id)} aria-pressed={category === c.id}
                className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-semibold ${category === c.id
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}`}>
                {tr(c.label)}
              </button>
            ))}
          </div>
          <label className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('events.search')}
              className="min-h-10 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] pl-8 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]" />
          </label>
        </div>
      </section>

      {load.state === 'loading' && <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">{tr('events.loading')}</p>}
      {load.state === 'error' && (
        <div className="flex flex-col items-center py-16 text-center">
          <strong className="text-sm text-[var(--text-primary)]">{tr('events.error')}</strong>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-xs font-bold text-[var(--bg-primary)]">
            <RefreshCw size={15} /> {tr('events.retry')}
          </button>
        </div>
      )}
      {load.state === 'ready' && (
        <>
          <p className="mb-3 text-xs text-[var(--text-tertiary)]">{group.label} · {year} · {tr('events.count', shown.length)}</p>
          {shown.length === 0 && <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">{tr(cards.length ? 'events.no_match' : 'events.empty')}</p>}
          {byMonth(shown).map(([month, list]) => (
            <section key={month} className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                {new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))}
              </h2>
              <div className="space-y-2">
                {list.map((c) => <Card key={c.key} card={c} color={group.color} lang={lang} tr={tr} />)}
              </div>
            </section>
          ))}
        </>
      )}

      <p className="mt-6 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3 text-[11px] leading-5 text-[var(--text-tertiary)]">{tr('events.note')}</p>
    </div>
  );
}

type Tr = (k: TranslationKey, n?: number) => string;
const MEMBERS_SHOWN = 8;

function Card({ card, color, lang, tr }: { card: EventCard; color: string; lang: keyof typeof LOCALE; tr: Tr }) {
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const wd = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', timeZone: 'UTC' });
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const first = card.days[0], last = card.days[card.days.length - 1], many = card.days.length > 1;
  const shows = !many ? first.shows : [];
  return (
    <article className="flex gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 sm:gap-4 sm:p-4">
      <div className="w-16 shrink-0 text-center sm:w-20">
        <div className="text-sm font-bold text-[var(--text-primary)]">{fmt.format(d(first.date))}</div>
        <div className="text-[11px] text-[var(--text-tertiary)]">{wd.format(d(first.date))}</div>
        {many && <div className="mt-1 text-[11px] leading-4 text-[var(--text-tertiary)]">– {fmt.format(d(last.date))}<br />{tr('events.days', card.days.length)}</div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>{card.kind}</span>
          {card.category === 'online' && <span className="rounded-md bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">{tr('events.online')}</span>}
        </div>
        <h3 className="text-sm font-semibold leading-snug text-[var(--text-primary)] [overflow-wrap:anywhere]" lang="ja">{card.title}</h3>
        {card.category === 'attend' && (
          <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--text-secondary)]">
            {card.venues.map((v) => (
              <li key={v.name ?? ''} className="flex gap-1.5">
                <MapPin size={12} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span lang={v.name ? 'ja' : undefined} className={v.name ? '' : 'text-[var(--text-tertiary)]'}>{v.name ?? tr('events.venue_unknown')}</span>
                  {v.prefecture && <span className="text-[var(--text-tertiary)]">（{v.prefecture}）</span>}
                  {card.venues.length > 1 && <span className="text-[var(--text-tertiary)]"> · {v.dates.map((x) => fmt.format(d(x))).join(', ')}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {shows.length > 0 && (
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{shows.map((s) => `${s.label ? `${s.label} ` : ''}${tr('events.start')} ${s.start}`).join(' / ')}</p>
        )}
        {(card.wholeGroup || card.members.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Users size={12} className="text-[var(--text-tertiary)]" />
            {card.wholeGroup && <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{tr('events.whole_group')}</span>}
            {card.members.slice(0, MEMBERS_SHOWN).map((m) => <span key={m.id} lang="ja" className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{m.name}</span>)}
            {card.members.length > MEMBERS_SHOWN && <span className="text-[10px] text-[var(--text-tertiary)]">+{card.members.length - MEMBERS_SHOWN}</span>}
          </div>
        )}
      </div>
      <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" title={tr('events.official')} aria-label={tr('events.official')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]">
        <ExternalLink size={14} />
      </a>
    </article>
  );
}
