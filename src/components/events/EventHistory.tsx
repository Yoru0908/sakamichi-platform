import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { useLanguage } from '@/i18n/use-language';
import { historyTranslator } from '@/i18n/events-history';
import { getSakamichiHistory, setSakamichiEventMark } from '@/utils/auth-api';
import { attendanceStatus, attendanceToday, eventCostTotal, type EventHistoryPayload, type EventMemoData } from '../../../workers/shared/event-attendance';
import EventMemo from './EventMemo';
import './events-history.css';

export default function EventHistory() {
  const auth = useStore($auth), lang = useLanguage(), tr = historyTranslator(lang);
  const [payload, setPayload] = useState<EventHistoryPayload | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const generation = useRef(0);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const load = async (offset = 0) => {
    const current = generation.current;
    setBusy(true); setError(false);
    try {
      const res = await getSakamichiHistory(offset);
      if (current !== generation.current) return;
      if (!res.success || !res.data) { setError(true); return; }
      const data = res.data;
      setPayload(prev => offset && prev ? { ...data, records: [...new Map([...prev.records, ...data.records].map(r => [r.id, r])).values()] } : data);
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) setBusy(false); }
  };
  useEffect(() => {
    generation.current++; setPayload(null); setOpened(new Set()); setError(false); setBusy(false);
    if (auth.isLoggedIn) void load();
    return () => { generation.current++; };
  }, [auth.isLoggedIn, auth.userId]);
  const saved = (id: string, memo: EventMemoData) => setPayload(prev => {
    if (!prev) return prev;
    const old = prev.records.find(r => r.id === id);
    if (!old) return prev;
    return { ...prev, records: prev.records.map(r => r.id === id ? { ...r, ...memo } : r), summary: { ...prev.summary,
      totalYen: prev.summary.totalYen + eventCostTotal(memo.cost) - eventCostTotal(old.cost),
      costRecorded: prev.summary.costRecorded + Number(Object.keys(memo.cost).length > 0) - Number(Object.keys(old.cost).length > 0) } };
  });
  const remove = async (id: string) => {
    if (!window.confirm(tr('removeConfirm'))) return;
    const current = generation.current;
    setBusy(true); setError(false);
    try {
      const res = await setSakamichiEventMark(id, false);
      if (current !== generation.current) return;
      if (!res.success) { setError(true); return; }
      await load();
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) setBusy(false); }
  };
  return <section className="event-history events-view" aria-label={tr('history')}>
    <nav className="event-history-nav"><a href="/events">{tr('events')}</a><a href="/events/ranking">{tr('ranking')}</a></nav>
    <h1 className="text-2xl font-bold">{tr('history')}</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">{tr('description')}</p>
    {auth.loading ? <p role="status" className="my-6">{tr('loading')}</p> : !auth.isLoggedIn ? <p className="my-6">{tr('login')} <a className="underline" href="/auth/login?next=%2Fevents%2Fhistory">{tr('signIn')}</a></p> : <>
      {payload && <>
        <div className="event-history-stats">
          <div><span className="event-history-hint">{tr('attendedDays')}</span><strong>{payload.summary.attendedDays}</strong></div>
          <div><span className="event-history-hint">{tr('plannedDays')}</span><strong>{payload.summary.plannedDays}</strong></div>
          <div><span className="event-history-hint">{tr('recordedCosts')}</span><strong>{payload.summary.costRecorded ? `¥${payload.summary.totalYen.toLocaleString()}` : '—'}</strong></div>
        </div>
        <p className="event-history-hint">{tr('dayDefinition')}</p><p className="event-history-hint">{tr('costCoverage', { n: payload.summary.costRecorded })}</p>
        <p className="event-history-hint mt-2">{tr('snapshot')}</p>
        {!payload.records.length && <p className="my-8">{tr('empty')}</p>}
        {payload.records.map(record => <article key={record.id} className="event-history-ticket" data-history-record={record.id}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]"><time dateTime={record.date}>{record.date}</time><span>{record.grp === 'nogizaka' ? '乃木坂46' : record.grp === 'sakurazaka' ? '櫻坂46' : '日向坂46'} · {tr(attendanceStatus(record.date, attendanceToday()))}</span></div>
          <h2 className="mt-2 font-bold">{record.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs"><a className="underline" href={`/events?event=${encodeURIComponent(record.id)}`}>{tr('detail')}</a><button type="button" className="event-history-button" onClick={() => void remove(record.id)} disabled={busy}>{tr('remove')}</button></div>
          <details onToggle={event => { if (event.currentTarget.open) setOpened(prev => new Set([...prev, record.id])); }}><summary>{tr('memo')}{Object.keys(record.cost).length ? ` · ¥${eventCostTotal(record.cost).toLocaleString()}` : ''}</summary>{opened.has(record.id) && <EventMemo eventId={record.id} marked onSaved={memo => saved(record.id, memo)} />}</details>
        </article>)}
        {payload.nextOffset !== null && <button type="button" className="event-history-button" disabled={busy} onClick={() => void load(payload.nextOffset!)}>{tr('more')}</button>}
      </>}
      {busy && <p role="status" className="my-4">{tr('loading')}</p>}
      {error && <div role="alert" className="my-4"><p className="event-history-error">{tr('loadError')}</p><button className="event-history-button mt-2" onClick={() => void load()}>{tr('retry')}</button></div>}
    </>}
  </section>;
}
