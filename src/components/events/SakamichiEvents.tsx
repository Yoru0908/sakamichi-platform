import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import { t, type TranslationKey } from '@/i18n';
import { useLanguage } from '@/i18n/use-language';
import { API_CONFIG } from '@/utils/constants';
import { SCHEDULE_GROUPS } from '@/components/schedule/schedule-ics';
import {
  byMonth, dayAndShowCount, eventGroupYear, filterCards, FIRST_YEAR, isPastCard, jstToday, toCards, yearsOf,
  type CategoryFilter, type EventCard, type EventGroupId, type SakamichiEvent,
} from './events-data';
import { EventModal, EventRow, LOCALE, useDates, useEventMarks, type Marks, type Tr } from './EventParts';

// 46log /events (plan E4/E5). Page logic and layout after 坂ログ /events: group / year / 現地・オンライン・記録済み, a month jump
// strip, this year split into これから and a folded 過去のイベント, one row per title with a 行く / 参加した toggle per day,
// and a detail dialog kept in the URL (?event=<id>) so it can be shared.

const API = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.miguri}/sakamichi-events`;
const jstYear = () => Number(jstToday().slice(0, 4));
const isGroup = (s: string | null): s is EventGroupId => !!s && Object.hasOwn(FIRST_YEAR, s);
const served = (grp: EventGroupId, y: number) => Number.isInteger(y) && y >= FIRST_YEAR[grp] && y <= jstYear() + 1;

/** ?event= (its own group and year), else ?grp=&year=, else Nogizaka this year (JST). Mounted with client:only. */
function initialView(): { grp: EventGroupId; year: number; open: string | null } {
  const q = new URLSearchParams(location.search), open = q.get('event'), at = open ? eventGroupYear(open) : null;
  if (open && at && served(at.grp, at.year)) return { ...at, open };
  const g = q.get('grp'), grp = isGroup(g) ? g : 'nogizaka', y = Number(q.get('year'));
  return { grp, year: served(grp, y) ? y : jstYear(), open: null };
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; events: SakamichiEvent[] };
const loaded = new Map<string, SakamichiEvent[]>();   // grp:year → rows, for switching back without a refetch

export default function SakamichiEvents() {
  const lang = useLanguage(), dates = useDates(lang), today = jstToday();
  const tr: Tr = (k, p) => t(k, lang, p && Object.fromEntries(Object.entries(p).map(([a, b]) => [a, String(b)])));
  const [start] = useState(initialView);
  const [grp, setGrp] = useState(start.grp);
  const [year, setYear] = useState(start.year);
  const [open, setOpen] = useState(start.open);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [pastOpen, setPastOpen] = useState(false);
  const marks = useEventMarks(API, grp, year);

  // The view stays shareable: group, year and an open detail.
  useEffect(() => { history.replaceState(null, '', `?grp=${grp}&year=${year}${open ? `&event=${encodeURIComponent(open)}` : ''}`); }, [grp, year, open]);

  useEffect(() => {
    const key = `${grp}:${year}`, hit = loaded.get(key);
    setPastOpen(false);
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
  const shown = useMemo(() => filterCards(cards, category, query, marks.mine), [cards, category, query, marks.mine]);
  const group = SCHEDULE_GROUPS.find((g) => g.id === grp)!;
  const split = year === jstYear() && category !== 'mine';
  const upcoming = split ? shown.filter((c) => !isPastCard(c, today)) : shown, past = split ? shown.filter((c) => isPastCard(c, today)) : [];
  const openCard = open ? cards.find((c) => c.days.some((d) => d.id === open)) ?? null : null;
  const close = useCallback(() => setOpen(null), []);
  const pickGroup = (g: EventGroupId) => { setGrp(g); setYear((y) => Math.max(y, FIRST_YEAR[g])); setOpen(null); };
  const filters: { id: CategoryFilter; label: TranslationKey }[] = [
    { id: 'all', label: 'events.all' }, { id: 'attend', label: 'events.attend' }, { id: 'online', label: 'events.online' },
    ...(marks.signedIn ? [{ id: 'mine' as const, label: 'events.mine' as const }] : []),
  ];
  const jump = (m: string) => {
    if (past.some((c) => c.days[0].date.startsWith(m))) setPastOpen(true);
    requestAnimationFrame(() => document.getElementById(`m-${m}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  };
  const row = { marks, color: group.color, today, tr, dates, onOpen: setOpen };

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
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setOpen(null); }}
              className="min-h-10 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 text-sm font-semibold text-[var(--text-primary)]">
              {yearsOf(grp).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {filters.map((c) => (
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

      {marks.failed === 'load' && <div role="alert" className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-800">
        {tr('events.marks_load_error')} <button type="button" onClick={marks.retry} className="min-h-11 px-2 font-semibold underline">{tr('events.retry')}</button>
      </div>}
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
      {load.state === 'ready' && (shown.length === 0
        ? <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">{tr(cards.length ? 'events.no_match' : 'events.empty')}</p>
        : (
          <>
            <Summary cards={shown} label={`${group.label} · ${year}`} tr={tr} />
            <MonthJump year={year} cards={shown} today={today} tr={tr} onJump={jump} />
            {split && <h2 className="mb-3 mt-5 text-sm font-bold text-[var(--text-primary)]">{tr('events.upcoming')} <small className="font-normal text-[var(--text-tertiary)]">{upcoming.length}</small></h2>}
            {upcoming.length ? <Months cards={upcoming} {...row} /> : <p className="py-6 text-sm text-[var(--text-tertiary)]">{tr('events.upcoming_empty')}</p>}
            {past.length > 0 && (
              <details open={pastOpen} onToggle={(e) => setPastOpen((e.currentTarget as HTMLDetailsElement).open)} className="group mt-6">
                <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                  {tr('events.past')} <small className="font-normal text-[var(--text-tertiary)]">{past.length}</small>
                  <ChevronDown size={16} className="text-[var(--text-tertiary)] transition-transform group-open:rotate-180" />
                </summary>
                <Months cards={past} {...row} />
              </details>
            )}
          </>
        ))}

      <p className="mt-6 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3 text-[11px] leading-5 text-[var(--text-tertiary)]">{tr('events.note')}</p>
      {open && load.state === 'ready' && <EventModal card={openCard} groupLabel={group.label} color={group.color} marks={marks} today={today} tr={tr} dates={dates} onClose={close} />}
    </div>
  );
}

function Summary({ cards, label, tr }: { cards: EventCard[]; label: string; tr: Tr }) {
  const { days, shows } = dayAndShowCount(cards);
  return <p className="mb-2 text-xs text-[var(--text-tertiary)]">{label} · {tr('events.summary', { events: cards.length, days, shows })}</p>;
}

/** 1–12: months with events jump to their section (opening 過去のイベント if needed); the current month is marked. */
function MonthJump({ year, cards, today, tr, onJump }: { year: number; cards: EventCard[]; today: string; tr: Tr; onJump: (m: string) => void }) {
  const months = new Set(cards.map((c) => c.days[0].date.slice(0, 7)));
  return (
    <nav aria-label={tr('events.month_jump')} className="mb-2 grid grid-cols-12 gap-1">
      {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((m) => {
        const now = m === today.slice(0, 7), label = Number(m.slice(5));
        return months.has(m)
          ? <button key={m} type="button" onClick={() => onJump(m)}
            className={`min-h-9 rounded-lg text-xs font-semibold ${now ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}`}>{label}</button>
          : <span key={m} aria-hidden="true" className="flex min-h-9 items-center justify-center text-xs text-[var(--text-tertiary)] opacity-50">{label}</span>;
      })}
    </nav>
  );
}

type RowProps = { marks: Marks; color: string; today: string; tr: Tr; dates: ReturnType<typeof useDates>; onOpen: (id: string) => void };
function Months({ cards, ...row }: { cards: EventCard[] } & RowProps) {
  const lang = useLanguage();
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', month: 'long', timeZone: 'UTC' });
  return (
    <>
      {byMonth(cards).map(([month, list]) => (
        <section key={month} id={`m-${month}`} className="mb-6 scroll-mt-20">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{fmt.format(new Date(`${month}-01T00:00:00Z`))}</h2>
          <div className="space-y-2">{list.map((c) => <EventRow key={c.key} card={c} {...row} />)}</div>
        </section>
      ))}
    </>
  );
}
