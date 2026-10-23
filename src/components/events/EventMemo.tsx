import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { useLanguage } from '@/i18n/use-language';
import { historyTranslator } from '@/i18n/events-history';
import { getSakamichiEventMemo, saveSakamichiEventMemo } from '@/utils/auth-api';
import { COST_KEYS, validateEventMemo, type EventMemoData } from '../../../workers/shared/event-attendance';
import './events-history.css';

export interface EventMemoProps { eventId: string; marked: boolean; onSaved?: (memo: EventMemoData) => void }
export default function EventMemo({ eventId, marked, onSaved }: EventMemoProps) {
  const tr = historyTranslator(useLanguage());
  const auth = useStore($auth);
  const [note, setNote] = useState('');
  const [cost, setCost] = useState<Record<string, string>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState<'saved' | 'saveError' | 'verifyError' | 'conflict' | 'invalid' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const apply = (memo: EventMemoData) => { setNote(memo.note); setCost(Object.fromEntries(COST_KEYS.map(k => [k, memo.cost[k] === undefined ? '' : String(memo.cost[k])]))); };
  useEffect(() => {
    const current = ++generation.current;
    setMessage(null); setState('loading'); setNote(''); setCost({}); setUpdatedAt(null);
    if (marked && auth.isLoggedIn) getSakamichiEventMemo(eventId).then(res => {
      if (current !== generation.current) return;
      if (res.success && res.data?.marked && (res.data.updatedAt === null || Number.isSafeInteger(res.data.updatedAt))) { apply(res.data.memo); setUpdatedAt(res.data.updatedAt); setState('ready'); }
      else setState('error');
    }).catch(() => { if (current === generation.current) setState('error'); });
    return () => { generation.current++; };
  }, [eventId, marked, attempt, auth.isLoggedIn, auth.userId]);
  const save = async () => {
    const parsed = validateEventMemo({ note, cost: Object.fromEntries(COST_KEYS.filter(k => cost[k]?.trim() !== '' && cost[k] !== undefined).map(k => [k, Number(cost[k])])) });
    if (!parsed) { setMessage('invalid'); return; }
    const current = generation.current;
    setState('saving'); setMessage(null);
    try {
      const saved = await saveSakamichiEventMemo(eventId, parsed, updatedAt);
      if (current !== generation.current) return;
      if (!saved.success) { setMessage(saved.error === 'memo_conflict' ? 'conflict' : 'saveError'); return; }
      const verified = await getSakamichiEventMemo(eventId);
      if (current !== generation.current) return;
      const persisted = verified.data?.memo;
      if (verified.success && verified.data?.marked && Number.isSafeInteger(saved.data?.updatedAt) && verified.data.updatedAt !== saved.data?.updatedAt) {
        setMessage('verifyError'); return;
      }
      if (!verified.success || !verified.data?.marked || !persisted || persisted.note !== parsed.note || COST_KEYS.some(k => persisted.cost[k] !== parsed.cost[k])) {
        setMessage('verifyError'); return;
      }
      if (!Number.isSafeInteger(verified.data.updatedAt)) { setMessage('verifyError'); return; }
      apply(persisted); setUpdatedAt(verified.data.updatedAt); setMessage('saved'); onSaved?.(persisted);
    } catch { if (current === generation.current) setMessage('saveError'); }
    finally { if (current === generation.current) setState('ready'); }
  };
  if (!auth.isLoggedIn) return <p>{tr('login')}</p>;
  if (!marked) return <div className="event-memo"><p>{tr('markFirst')}</p><p className="event-history-hint">{tr('retention')}</p></div>;
  if (state === 'loading') return <p role="status">{tr('loading')}</p>;
  if (state === 'error') return <div role="alert"><p>{tr('loadError')}</p><button className="event-history-button" onClick={() => setAttempt(a => a + 1)}>{tr('retry')}</button></div>;
  return <form className="event-memo space-y-3" data-event-memo={eventId} onSubmit={event => { event.preventDefault(); void save(); }}>
    <label className="event-history-label">{tr('note')}<textarea value={note} maxLength={4000} rows={4} onChange={e => { setNote(e.target.value); setMessage(null); }} disabled={state === 'saving'} /></label>
    <p className="event-history-hint">{tr('noteHint')}</p>
    <div className="event-cost-grid">{COST_KEYS.map(key => <label key={key} className="event-history-label">{tr(key)} (JPY)<input type="number" min={0} max={9999999} step={1} inputMode="numeric" value={cost[key] || ''} onChange={e => { setCost(prev => ({ ...prev, [key]: e.target.value })); setMessage(null); }} disabled={state === 'saving'} /></label>)}</div>
    <p className="event-history-hint">{tr('costHint')}</p>
    <button type="submit" disabled={state === 'saving'} className="event-history-button">{tr(state === 'saving' ? 'saving' : 'save')}</button>
    {message && <p role={message === 'saved' ? 'status' : 'alert'} className={message === 'saved' ? 'event-history-success' : 'event-history-error'}>{tr(message)}</p>}
    <p className="event-history-hint">{tr('retention')}</p>
  </form>;
}
