import { useEffect, useMemo, useState } from 'react';
import { Archive, ExternalLink, Search } from 'lucide-react';
import { getMiguriSoldOutHistory, type MiguriSoldOutHistoryEvent } from '@/utils/auth-api';
import SoldOutMatrix from './SoldOutMatrix';
import { filterSoldOutHistory, formatSoldOutCapture, SOLDOUT_GROUP_LABELS, type SoldOutHistoryFilters } from './soldout-history-helpers';
import { useLanguage } from '@/i18n/use-language';
import { soldOutTranslator } from '@/i18n/miguri-soldout';

export default function SoldOutHistory() {
  const st = soldOutTranslator(useLanguage());
  const [events, setEvents] = useState<MiguriSoldOutHistoryEvent[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [filters, setFilters] = useState<SoldOutHistoryFilters>({ group: 'all', scope: 'recorded', query: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    getMiguriSoldOutHistory().then((result) => {
      if (!mounted) return;
      if (!result.success || !result.data) {
        setError(result.message || result.error || st('catalogFailed'));
      } else {
        setEvents(result.data.events);
        const slug = new URLSearchParams(window.location.search).get('event') || '';
        setSelectedSlug(slug);
        if (slug && result.data.events.find((event) => event.slug === slug)?.roundCount === 0) {
          setFilters((current) => ({ ...current, scope: 'all' }));
        }
      }
      setLoading(false);
    });
    const onPopState = () => setSelectedSlug(new URLSearchParams(window.location.search).get('event') || '');
    window.addEventListener('popstate', onPopState);
    return () => { mounted = false; window.removeEventListener('popstate', onPopState); };
  }, [reload]);

  const visible = useMemo(() => filterSoldOutHistory(events, filters), [events, filters]);
  const selected = events.find((event) => event.slug === selectedSlug);
  const recordedCount = events.filter((event) => event.roundCount > 0).length;
  const archivedCount = events.filter((event) => event.archived && event.roundCount > 0).length;

  function selectEvent(event: MiguriSoldOutHistoryEvent) {
    setSelectedSlug(event.slug);
    const url = new URL(window.location.href);
    url.searchParams.set('event', event.slug);
    window.history.pushState(window.history.state, '', url);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => document.getElementById('soldout-history-detail')?.scrollIntoView({ block: 'start' }));
    }
  }

  if (loading) return <p className="py-12 text-center text-sm text-[var(--text-tertiary)]" role="status">{st('catalogLoading')}</p>;
  if (error) return (
    <div className="rounded-2xl border border-rose-200 p-6 text-sm text-rose-600" role="alert">
      <p>{error}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="mt-3 underline">{st('reloadCatalog')}</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        {st('catalogSummary', { recorded: recordedCount, archived: archivedCount })}
        <span className="block text-xs text-[var(--text-tertiary)]">{st('catalogNote')}</span>
      </p>
      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside aria-label={st('catalog')} className="min-w-0 space-y-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border-primary)] px-3 py-2">
            <Search size={14} className="shrink-0 text-[var(--text-tertiary)]" />
            <input type="search" aria-label={st('searchEvents')} placeholder={st('searchEventsPlaceholder')} value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              className="min-w-0 w-full bg-transparent text-xs text-[var(--text-primary)]" />
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="space-y-1 text-[var(--text-tertiary)]">{st('group')}
              <select aria-label={st('filterGroup')} value={filters.group} onChange={(event) => setFilters((current) => ({ ...current, group: event.target.value as SoldOutHistoryFilters['group'] }))}
                className="block min-h-11 w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 text-[var(--text-primary)]">
                <option value="all">{st('allGroups')}</option>
                {Object.entries(SOLDOUT_GROUP_LABELS).map(([group, label]) => <option key={group} value={group}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[var(--text-tertiary)]">{st('scope')}
              <select aria-label={st('filterScope')} value={filters.scope} onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value as SoldOutHistoryFilters['scope'] }))}
                className="block min-h-11 w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 text-[var(--text-primary)]">
                <option value="recorded">{st('scopeRecorded')}</option><option value="archived">{st('scopeArchived')}</option><option value="all">{st('scopeAll')}</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
            <span role="status">{st('matchedEvents', { n: visible.length })}</span>
            <button type="button" onClick={() => setFilters({ group: 'all', scope: 'recorded', query: '' })} className="min-h-9 underline">{st('resetFilters')}</button>
          </div>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto lg:max-h-[65vh]">
            {visible.map((event) => (
              <button key={event.slug} type="button" data-history-event={event.slug} aria-pressed={selectedSlug === event.slug} onClick={() => selectEvent(event)}
                className={`w-full rounded-xl border p-3 text-left ${selectedSlug === event.slug ? 'border-[var(--color-brand-nogi)] bg-[var(--bg-secondary)]' : 'border-[var(--border-secondary)] bg-[var(--bg-primary)]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-[var(--text-tertiary)]">
                  <span>{SOLDOUT_GROUP_LABELS[event.group]}</span><span>{event.archived ? st('archived') : st('current')} · {event.roundCount > 0 ? st('roundsRecorded', { n: event.roundCount }) : st('noRecord')}</span>
                </div>
                <h2 className="mt-2 break-words text-xs font-semibold leading-5 text-[var(--text-primary)]">{event.title}</h2>
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{event.firstDate || st('dateUnknown')}{event.lastDate && event.lastDate !== event.firstDate ? st('dateRangeTail', { date: event.lastDate }) : ''}</p>
              </button>
            ))}
            {!visible.length && <p className="py-6 text-center text-xs text-[var(--text-tertiary)]">{st('noMatch')}</p>}
          </div>
        </aside>
        <section id="soldout-history-detail" aria-label={st('detail')} className="min-w-0 scroll-mt-20 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
          {selected ? (
            <>
              <div className="mb-5 space-y-2 border-b border-[var(--border-secondary)] pb-4">
                <p className="text-xs text-[var(--text-tertiary)]">{SOLDOUT_GROUP_LABELS[selected.group]} · {selected.archived ? st('historyArchive') : st('stillRecording')} · {st('bookmarkable')}</p>
                <h2 className="break-words text-base font-semibold leading-7 text-[var(--text-primary)]">{selected.title}</h2>
                <p className="text-xs leading-5 text-[var(--text-tertiary)]">{st('savedRounds', { n: selected.roundCount })}{selected.latestRound != null ? st('latestRound', { n: selected.latestRound }) : ''} · {st('lastCaptured', { when: formatSoldOutCapture(selected.lastCapturedAt, st) })}</p>
                {selected.archived && <p className="text-xs text-[var(--text-tertiary)]">{st('upstreamGone')}</p>}
                <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs text-[var(--color-brand-nogi)]">{st('sourcePage')} <ExternalLink size={12} /></a>
              </div>
              {selected.roundCount > 0 ? <SoldOutMatrix key={selected.slug} eventSlug={selected.slug} /> : (
                <p className="py-8 text-sm leading-6 text-[var(--text-tertiary)]">{st('noSavedRounds')}</p>
              )}
            </>
          ) : (
            <div className="py-14 text-center text-[var(--text-tertiary)]">
              <Archive size={28} className="mx-auto mb-3" />
              <p className="text-sm">{selectedSlug ? st('linkNotFound') : st('pickEvent')}</p>
              <p className="mt-2 text-xs">{st('pickEventNote')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
