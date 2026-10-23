import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { useLanguage } from '@/i18n/use-language';
import { historyTranslator } from '@/i18n/events-history';
import { getSakamichiRanking, getSakamichiEventProfile, setSakamichiEventProfile } from '@/utils/auth-api';
import { validateEventProfile, type EventPublicProfile, type EventRankingEntry } from '../../../workers/shared/event-attendance';
import './events-history.css';

export default function EventRanking() {
  const auth = useStore($auth), tr = historyTranslator(useLanguage());
  const [ranking, setRanking] = useState<EventRankingEntry[] | null>(null), [rankingError, setRankingError] = useState(false);
  const [profile, setProfile] = useState<EventPublicProfile | null>(null), [name, setName] = useState(''), [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false), [profileError, setProfileError] = useState(false);
  const [message, setMessage] = useState<'saved' | 'saveError' | 'verifyError' | 'nameInvalid' | null>(null);
  const generation = useRef(0);
  const rankingRequest = useRef(0);
  const loadRanking = async () => {
    const current = ++rankingRequest.current;
    setRankingError(false);
    try { const res = await getSakamichiRanking(); if (current !== rankingRequest.current) return; if (res.success && res.data) setRanking(res.data.ranking); else setRankingError(true); }
    catch { if (current === rankingRequest.current) setRankingError(true); }
  };
  const loadProfile = async () => {
    const current = generation.current; setProfileError(false);
    try {
      const res = await getSakamichiEventProfile(); if (current !== generation.current) return;
      if (!res.success || !res.data) { setProfileError(true); return; }
      setProfile(res.data); setName(res.data.name); setOn(res.data.public);
    } catch { if (current === generation.current) setProfileError(true); }
  };
  useEffect(() => { void loadRanking(); return () => { rankingRequest.current++; }; }, []);
  useEffect(() => {
    generation.current++; setProfile(null); setMessage(null); setProfileError(false); setBusy(false); setName(''); setOn(false);
    if (auth.isLoggedIn) void loadProfile();
    return () => { generation.current++; };
  }, [auth.isLoggedIn, auth.userId]);
  const save = async () => {
    const input = validateEventProfile({ public: on, name });
    if (!input) { setMessage('nameInvalid'); return; }
    const current = generation.current; setBusy(true); setMessage(null);
    try {
      const res = await setSakamichiEventProfile(input); if (current !== generation.current) return;
      if (!res.success) { setMessage('saveError'); return; }
      const verified = await getSakamichiEventProfile(); if (current !== generation.current) return;
      if (!verified.success || !verified.data || verified.data.public !== input.public || verified.data.name !== input.name) { setMessage('verifyError'); return; }
      setProfile(verified.data); setName(verified.data.name); setMessage('saved'); await loadRanking();
    } catch { if (current === generation.current) setMessage('saveError'); }
    finally { if (current === generation.current) setBusy(false); }
  };
  return <section className="event-history events-view" aria-label={tr('ranking')}>
    <nav className="event-history-nav"><a href="/events">{tr('events')}</a><a href="/events/history">{tr('history')}</a></nav>
    <h1 className="text-2xl font-bold">{tr('ranking')}</h1><p className="event-history-hint mt-2">{tr('rankingRule')}</p>
    {auth.isLoggedIn && <section className="event-history-ticket">
      {profile ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
        <p className="text-sm font-semibold">{tr(profile.public ? 'public' : 'private')}</p>
        <label className="event-history-label">{tr('publicName')}<input value={name} maxLength={40} onChange={e => { setName(e.target.value); setMessage(null); }} disabled={busy} autoComplete="off" /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); setMessage(null); }} disabled={busy} />{tr('publicLabel')}</label>
        <p className="event-history-hint">{tr('publicHint')}</p>
        <button className="event-history-button" disabled={busy}>{tr(busy ? 'saving' : 'profileSave')}</button>
        {message && <p role={message === 'saved' ? 'status' : 'alert'} className={message === 'saved' ? 'event-history-success' : 'event-history-error'}>{tr(message)}</p>}
      </form> : profileError ? <div role="alert"><p>{tr('loadError')}</p><button className="event-history-button" onClick={() => void loadProfile()}>{tr('retry')}</button></div> : <p role="status">{tr('loading')}</p>}
    </section>}
    {rankingError ? <div role="alert" className="my-6"><p className="event-history-error">{tr('loadError')}</p><button className="event-history-button mt-2" onClick={() => void loadRanking()}>{tr('retry')}</button></div> : ranking === null ? <p role="status" className="my-6">{tr('loading')}</p> : ranking.length === 0 ? <p className="my-8">{tr('rankingEmpty')}</p> : <table className="event-history-table mt-6">
      <thead><tr><th>{tr('rank')}</th><th>{tr('name')}</th><th>{tr('days')}</th><th>{tr('count')}</th></tr></thead>
      <tbody>{ranking.map((entry, i) => <tr key={`${entry.name}:${i}`}><td>{entry.rank}</td><td>{entry.name}</td><td>{entry.days}</td><td>{entry.events}</td></tr>)}</tbody>
    </table>}
  </section>;
}
