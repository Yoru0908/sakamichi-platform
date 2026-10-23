import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { CalendarDays, Check, ChevronDown, ExternalLink, LoaderCircle, MapPin, Users, X } from 'lucide-react';
import type { TranslationKey } from '@/i18n';
import { $auth } from '@/stores/auth';
import { getSakamichiEventMarks, setSakamichiEventMark } from '@/utils/auth-api';
import { isPastCard, markKey, type EventCard, type EventGroupId, type SakamichiEvent } from './events-data';
import EventMemo from './EventMemo';

// Pieces of 46log /events: the viewer's marks, one day row with its toggle, a card (one day inline, a tour in <details>),
// and the detail dialog (?event=<id>). Same logic as 坂ログ's components/events.tsx and pages/EventDetail.tsx, 46log's look.

export type Tr = (k: TranslationKey, params?: Record<string, string | number>) => string;
export type Marks = ReturnType<typeof useEventMarks>;
export const LOCALE = { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' } as const;
export type Lang = keyof typeof LOCALE;

/** Marked days and public counts of one group-year. Counts are a minute behind, so a toggle adjusts its own day locally. */
export function useEventMarks(api: string, grp: EventGroupId, year: number) {
  const auth = useStore($auth);
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [delta, setDelta] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(''), [failed, setFailed] = useState('');
  const [loadedScope, setLoadedScope] = useState(''), [attempt, setAttempt] = useState(0);
  const scope = `${grp}:${year}:${auth.userId ?? ''}`;
  const currentScope = useRef(scope), pending = useRef(false);
  currentScope.current = scope;

  useEffect(() => {
    const ctl = new AbortController();
    setCounts({}); setDelta({});
    fetch(`${api}/counts?grp=${grp}&year=${year}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { data?: { counts?: Record<string, number> } } | null) => setCounts(b?.data?.counts ?? {}))
      .catch(() => {});
    return () => ctl.abort();
  }, [api, grp, year]);

  useEffect(() => {
    setMine(new Set());
    setFailed(''); setLoadedScope('');
    if (!auth.isLoggedIn) return;
    let live = true;
    getSakamichiEventMarks(grp, year).then((r) => {
      if (!live || currentScope.current !== scope) return;
      if (r.success && r.data) { setMine(new Set(r.data.mine)); setLoadedScope(scope); }
      else setFailed('load');
    }).catch(() => { if (live && currentScope.current === scope) setFailed('load'); });
    return () => { live = false; };
  }, [grp, year, auth.isLoggedIn, scope, attempt]);

  const toggle = useCallback(async (id: string) => {
    if (!auth.isLoggedIn) {
      if (!auth.loading) location.href = `/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      return;
    }
    if (pending.current || loadedScope !== scope) return;
    const on = !mine.has(id);
    pending.current = true;
    setBusy(id); setFailed('');
    try {
      const r = await setSakamichiEventMark(id, on);
      if (currentScope.current !== scope) return;
      if (!r.success || r.data?.id !== id || r.data.marked !== on) { setFailed(id); return; }
      setMine((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
      setDelta((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + (on ? 1 : -1) }));
    } catch {
      if (currentScope.current === scope) setFailed(id);
    } finally { pending.current = false; setBusy(''); }
  }, [auth.isLoggedIn, auth.loading, mine, loadedScope, scope]);

  return {
    signedIn: auth.isLoggedIn, authLoading: auth.loading, mine, toggle, busy, failed,
    loading: auth.loading || (auth.isLoggedIn && loadedScope !== scope), retry: () => setAttempt((n) => n + 1),
    count: (id: string) => Math.max(0, (counts[id] ?? 0) + (delta[id] ?? 0)),
  };
}

const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
export function useDates(lang: Lang) {
  const md = new Intl.DateTimeFormat(LOCALE[lang], { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const wd = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', timeZone: 'UTC' });
  return { md: (s: string) => md.format(asDate(s)), wd: (s: string) => wd.format(asDate(s)), day: (s: string) => `${md.format(asDate(s))}（${wd.format(asDate(s))}）` };
}
type Dates = ReturnType<typeof useDates>;

/** Explicit save action and confirmed state, with the day's 46log count. */
export function MarkButton({ d, marks, color, today, tr }: { d: SakamichiEvent; marks: Marks; color: string; today: string; tr: Tr }) {
  const marked = marks.mine.has(d.id), count = marks.count(d.id);
  return (
    <span className="inline-flex max-w-40 shrink-0 flex-col items-end gap-1">
    <button type="button" aria-pressed={marked} aria-busy={marks.busy === d.id} disabled={Boolean(marks.busy) || marks.loading} onClick={() => void marks.toggle(d.id)}
      title={marked ? tr('events.mark.remove') : undefined}
      className={`event-mark inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${marked
        ? 'border-transparent text-white' : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
      style={marked ? { backgroundColor: `color-mix(in srgb, ${color} 68%, #111827)` } : undefined}>
      {marks.busy === d.id ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" /> : marked && <Check size={13} />}
      <span>{tr(marks.busy === d.id ? 'events.mark.saving' : markKey(d.date, marked, today))}</span>
      {count > 0 && <span className="inline-flex items-center gap-0.5 font-normal opacity-80"><Users size={11} />{count}</span>}
    </button>
    {marks.failed === d.id && <span role="alert" className="text-right text-[11px] text-red-700">{tr('events.mark_error')}</span>}
    </span>
  );
}

function Venue({ d, tr }: { d: SakamichiEvent; tr: Tr }) {
  if (d.category === 'online') return <span>{tr('events.online')}</span>;
  if (!d.venue) return <span className="text-[var(--text-tertiary)]">{tr('events.venue_unknown')}</span>;
  return <span lang="ja">{d.venue.name}{d.venue.prefecture && <span className="text-[var(--text-tertiary)]">（{d.venue.prefecture}）</span>}</span>;
}

const showsText = (d: SakamichiEvent, tr: Tr) =>
  d.shows.map((s, k) => `${s.label || (d.shows.length > 1 ? `${k + 1}.` : '')} ${tr('events.start')} ${s.start}`.trim()).join(' / ');

/** One day of a tour or a run: date, venue, start times, its own toggle. */
export function DayRow({ d, marks, color, today, tr, dates }: { d: SakamichiEvent; marks: Marks; color: string; today: string; tr: Tr; dates: Dates }) {
  return (
    <li className={`event-day flex items-center gap-3 py-2 ${d.date < today ? 'event-day-past' : ''}`}>
      <span className="w-20 shrink-0 text-xs font-semibold text-[var(--text-primary)]">{dates.day(d.date)}</span>
      <span className="min-w-0 flex-1 text-xs text-[var(--text-secondary)] [overflow-wrap:anywhere]">
        <Venue d={d} tr={tr} />
        {d.shows.length > 0 && <span className="block text-[11px] text-[var(--text-tertiary)]">{showsText(d, tr)}</span>}
      </span>
      <MarkButton d={d} marks={marks} color={color} today={today} tr={tr} />
    </li>
  );
}

const MEMBERS_SHOWN = 8;
function Members({ card, tr, limit = MEMBERS_SHOWN }: { card: EventCard; tr: Tr; limit?: number }) {
  if (!card.wholeGroup && !card.members.length) return null;
  const chip = 'rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]';
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Users size={12} className="text-[var(--text-tertiary)]" />
      {card.wholeGroup && <span className={chip}>{tr('events.whole_group')}</span>}
      {card.members.slice(0, limit).map((m) => <span key={m.id} lang="ja" className={chip}>{m.name}</span>)}
      {card.members.length > limit && <span className="text-[10px] text-[var(--text-tertiary)]">+{card.members.length - limit}</span>}
    </div>
  );
}

function Chips({ card, color, tr }: { card: EventCard; color: string; tr: Tr }) {
  return (
    <div className="event-chips mb-1 flex flex-wrap items-center gap-1.5">
      <span className="event-kind rounded-md px-1.5 py-0.5 text-[10px] font-semibold">{card.kind}</span>
      {card.category === 'online' && <span className="rounded-md bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">{tr('events.online')}</span>}
    </div>
  );
}

const placeOf = (card: EventCard, tr: Tr) => {
  if (card.category === 'online') return tr('events.online');
  const named = card.venues.filter((v) => v.name);
  return named.length > 1 ? `${named[0].name} +${named.length - 1}` : named[0]?.name ?? tr('events.venue_unknown');
};

type CardProps = { card: EventCard; marks: Marks; color: string; today: string; tr: Tr; dates: Dates; onOpen: (id: string) => void };

/** A row per title (坂ログ Tour): one day carries its toggle inline; a run folds its days into <details>, one toggle each. */
export function EventRow({ card, marks, color, today, tr, dates, onOpen }: CardProps) {
  const first = card.days[0], last = card.days[card.days.length - 1], many = card.days.length > 1;
  const head = (
    <>
      <div className="event-ticket-date">
        <time dateTime={first.date}>{dates.md(first.date)}</time>
        <span>{dates.wd(first.date)}</span>
        {many && <small>– {dates.md(last.date)}<br />{tr('events.days', { n: card.days.length })}</small>}
      </div>
      <div className="min-w-0 flex-1">
        <Chips card={card} color={color} tr={tr} />
        <h3 className="event-ticket-title text-sm font-semibold leading-snug text-[var(--text-primary)] [overflow-wrap:anywhere]" lang="ja">{card.title}</h3>
        <p className="mt-1 flex gap-1.5 text-xs text-[var(--text-secondary)]">
          <MapPin size={12} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
          <span className="min-w-0 [overflow-wrap:anywhere]" lang="ja">{placeOf(card, tr)}</span>
        </p>
        {!many && first.shows.length > 0 && <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{showsText(first, tr)}</p>}
      </div>
    </>
  );
  const box = `event-ticket ${isPastCard(card, today) ? 'event-ticket-past' : ''}`;
  const links = (
    <div className="event-links flex items-center gap-1">
      <button type="button" onClick={() => onOpen(first.id)} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]">{tr('events.detail')}</button>
      <a href={first.sourceUrl} target="_blank" rel="noopener noreferrer" title={tr('events.official')} aria-label={tr('events.official')}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"><ExternalLink size={14} /></a>
    </div>
  );
  if (!many) return (
    <article className={`${box} event-ticket-single`}>
      <button type="button" onClick={() => onOpen(first.id)} className="event-ticket-header text-left">{head}</button>
      <div className="event-ticket-extra"><Members card={card} tr={tr} limit={4} /></div>
      <div className="event-ticket-stub"><MarkButton d={first} marks={marks} color={color} today={today} tr={tr} />{links}</div>
    </article>
  );
  const mine = card.days.filter((d) => marks.mine.has(d.id)).length;
  return (
    <details className={`group ${box}`}>
      <summary className="event-ticket-summary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="event-ticket-header">{head}</div>
        <span className="event-ticket-stub event-ticket-progress">
          <span><b>{mine}</b><span> / {card.days.length}</span></span>
          <small>{tr('events.marked_days')}</small>
          <ChevronDown size={16} className="event-expand mt-1" />
        </span>
      </summary>
      <div className="event-ticket-days border-t border-[var(--border-primary)] px-3 pb-3 sm:px-4">
        <ul className="divide-y divide-[var(--border-primary)]">
          {card.days.map((d) => <DayRow key={d.id} d={d} marks={marks} color={color} today={today} tr={tr} dates={dates} />)}
        </ul>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Members card={card} tr={tr} />{links}</div>
      </div>
    </details>
  );
}

/** The detail dialog (坂ログ EventDetail, as 46log's schedule dialog): dates, venues, start times, every day's toggle, the cast. */
export function EventModal({ card, eventId, groupLabel, color, marks, today, tr, dates, onClose }: {
  card: EventCard | null; eventId: string; groupLabel: string; color: string; marks: Marks; today: string; tr: Tr; dates: Dates; onClose: () => void;
}) {
  const [memoId, setMemoId] = useState(eventId);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => setMemoId(eventId), [eventId]);
  useEffect(() => {
    const before = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
    const focusFirst = () => (focusable()[0] ?? dialogRef.current)?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    focusFirst();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (!first) { e.preventDefault(); dialogRef.current?.focus(); return; }
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof Node && !dialogRef.current?.contains(e.target)) focusFirst();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const first = card?.days[0], last = card?.days[card.days.length - 1], mine = card ? card.days.filter((d) => marks.mine.has(d.id)).length : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="event-detail-title" className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--bg-primary)] shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="h-1.5" style={{ backgroundColor: color }} />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-bold" style={{ color }}>{groupLabel}{card && ` · ${card.kind}`}</span>
              <h2 id="event-detail-title" lang="ja" className="mt-2 text-lg font-bold leading-7 text-[var(--text-primary)] [overflow-wrap:anywhere]">{card?.title ?? tr('events.not_found')}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label={tr('events.close')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]"><X size={20} /></button>
          </div>
          {card && first && last && (
            <>
              <dl className="mt-5 space-y-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 text-sm">
                <div className="flex gap-3">
                  <CalendarDays size={16} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                  <div><dt className="sr-only">{tr('events.dates')}</dt>
                    <dd className="font-semibold text-[var(--text-primary)]">{dates.day(first.date)}{card.days.length > 1 && <> – {dates.day(last.date)} · {tr('events.days', { n: card.days.length })}</>}</dd>
                    {card.days.length === 1 && first.shows.length > 0 && <dd className="mt-0.5 text-xs text-[var(--text-tertiary)]">{showsText(first, tr)}</dd>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                  <div className="min-w-0"><dt className="sr-only">{tr('events.venue')}</dt>
                    {card.category === 'online' ? <dd className="text-[var(--text-primary)]">{tr('events.online')}</dd> : card.venues.map((v) => (
                      <dd key={v.name ?? ''} className="text-[var(--text-primary)] [overflow-wrap:anywhere]">
                        <span lang={v.name ? 'ja' : undefined} className={v.name ? '' : 'text-[var(--text-tertiary)]'}>{v.name ?? tr('events.venue_unknown')}</span>
                        {v.prefecture && <span className="text-[var(--text-tertiary)]">（{v.prefecture}）</span>}
                        {card.venues.length > 1 && <span className="text-xs text-[var(--text-tertiary)]"> · {v.dates.map(dates.md).join(', ')}</span>}
                      </dd>
                    ))}
                  </div>
                </div>
              </dl>
              {mine > 0 && <p className="mt-3 text-xs font-semibold" style={{ color }}>{tr('events.my_days', { n: mine })}</p>}
              {!marks.signedIn && !marks.authLoading && <p className="mt-3 text-xs text-[var(--text-tertiary)]">{tr('events.login_hint')}</p>}
              <ul className="mt-3 divide-y divide-[var(--border-primary)]">
                {card.days.map((d) => <DayRow key={d.id} d={d} marks={marks} color={color} today={today} tr={tr} dates={dates} />)}
              </ul>
              {(card.wholeGroup || card.members.length > 0) && (
                <section className="mt-4">
                  <h3 className="mb-2 text-xs font-semibold text-[var(--text-tertiary)]">{tr('events.cast')}{card.members.length > 0 && ` · ${card.members.length}`}</h3>
                  <Members card={card} tr={tr} limit={card.members.length} />
                </section>
              )}
              {marks.signedIn && <section className="mt-5 border-t border-[var(--border-primary)] pt-5">
                <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{tr('events.memo_title')}</h3>
                {card.days.length > 1 && <label className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  {tr('events.memo_day')}
                  <select value={memoId} onChange={e => setMemoId(e.target.value)} className="min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]">
                    {card.days.map(d => <option key={d.id} value={d.id}>{dates.day(d.date)}</option>)}
                  </select>
                </label>}
                <EventMemo key={memoId} eventId={memoId} marked={marks.mine.has(memoId)} />
              </section>}
              <a href={first.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-xs font-bold text-[var(--bg-primary)]">
                <ExternalLink size={14} /> {tr('events.official')}
              </a>
              <p className="mt-4 text-[11px] leading-5 text-[var(--text-tertiary)]">{tr('events.count_note')}</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
