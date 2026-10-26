import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { useLanguage } from '@/i18n/use-language';
import { historyTranslator } from '@/i18n/events-history';
import { getSakamichiRanking, getSakamichiEventProfile } from '@/utils/auth-api';
import type { AttendanceGroup, EventRankingEntry } from '../../../workers/shared/event-attendance';
import './events-history.css';

// 2026-10-26: the ranking is a view inside 我的活动履历 (/events/history?view=ranking), no longer its own nav entry.
// 全部 + one tab per group (?grp= in the URL). The opt-in form lives in /user; a signed-in user who has not opted in
// sees one line pointing there.
type Scope = 'all' | AttendanceGroup;
const SCOPES: Scope[] = ['all', 'nogizaka', 'sakurazaka', 'hinatazaka'];
const DOT: Partial<Record<Scope, string>> = { nogizaka: 'var(--color-brand-nogi)', sakurazaka: 'var(--color-brand-sakura)', hinatazaka: 'var(--color-brand-hinata)' };
const scopeFromUrl = (): Scope => {
  const grp = new URLSearchParams(window.location.search).get('grp');
  return SCOPES.includes(grp as Scope) ? grp as Scope : 'all';
};

export default function EventRanking() {
  const auth = useStore($auth), tr = historyTranslator(useLanguage());
  const [scope, setScope] = useState<Scope>(scopeFromUrl);
  const [ranking, setRanking] = useState<EventRankingEntry[] | null>(null), [rankingError, setRankingError] = useState(false);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const rankingRequest = useRef(0);
  const loadRanking = async (current = ++rankingRequest.current) => {
    setRanking(null); setRankingError(false);
    try {
      const res = await getSakamichiRanking(scope === 'all' ? undefined : scope); if (current !== rankingRequest.current) return;
      if (res.success && res.data) setRanking(res.data.ranking); else setRankingError(true);
    } catch { if (current === rankingRequest.current) setRankingError(true); }
  };
  useEffect(() => { void loadRanking(); return () => { rankingRequest.current++; }; }, [scope]);
  useEffect(() => {
    setIsPublic(null);
    if (!auth.isLoggedIn) return;
    let alive = true;
    getSakamichiEventProfile().then(res => { if (alive && res.success && res.data) setIsPublic(res.data.public); }).catch(() => {});
    return () => { alive = false; };
  }, [auth.isLoggedIn, auth.userId]);
  const pick = (next: Scope) => {
    setScope(next);
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('grp'); else url.searchParams.set('grp', next);
    window.history.replaceState(null, '', url);
  };
  return <section aria-label={tr('ranking')}>
    <p className="event-history-hint">{tr('rankingRule')}</p>
    {isPublic === false && <p className="event-history-hint mt-2">{tr('joinCta')} <a href="/user#event-ranking" className="font-semibold underline">{tr('joinLink')}</a></p>}
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={tr('groupFilter')}>
      {SCOPES.map(value => <button key={value} type="button" aria-pressed={scope === value} onClick={() => pick(value)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${scope === value
          ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'border-[var(--border-primary)] text-[var(--text-secondary)]'}`}>
        {DOT[value] && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: DOT[value] }} />}{tr(value === 'all' ? 'allGroups' : value)}
      </button>)}
    </div>
    {rankingError ? <div role="alert" className="my-6"><p className="event-history-error">{tr('loadError')}</p><button className="event-history-button mt-2" onClick={() => void loadRanking()}>{tr('retry')}</button></div> : ranking === null ? <p role="status" className="my-6">{tr('loading')}</p> : ranking.length === 0 ? <p className="my-8">{tr('rankingEmpty')}</p> : <table className="event-history-table mt-4">
      <thead><tr><th>{tr('rank')}</th><th>{tr('name')}</th><th>{tr('days')}</th><th>{tr('count')}</th></tr></thead>
      <tbody>{ranking.map((entry, i) => <tr key={`${entry.name}:${i}`}><td>{entry.rank}</td><td>{entry.name}</td><td>{entry.days}</td><td>{entry.events}</td></tr>)}</tbody>
    </table>}
  </section>;
}
