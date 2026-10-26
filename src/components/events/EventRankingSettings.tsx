import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/i18n/use-language';
import { historyTranslator } from '@/i18n/events-history';
import { getSakamichiEventProfile, setSakamichiEventProfile } from '@/utils/auth-api';
import { validateEventProfile, type EventPublicProfile } from '../../../workers/shared/event-attendance';

// 参加ランキングの公開設定 (2026-10-26): moved from /events/ranking to the /user profile tab. The ranking view in /events/history
// links here as /user#event-ranking; this island renders after the page loads, so it scrolls itself into view.
export default function EventRankingSettings() {
  const tr = historyTranslator(useLanguage());
  const [profile, setProfile] = useState<EventPublicProfile | null>(null), [name, setName] = useState(''), [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false), [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<'saved' | 'saveError' | 'verifyError' | 'nameInvalid' | null>(null);
  const alive = useRef(true), section = useRef<HTMLDivElement>(null);
  const load = async () => {
    setLoadError(false);
    try {
      const res = await getSakamichiEventProfile(); if (!alive.current) return;
      if (!res.success || !res.data) { setLoadError(true); return; }
      setProfile(res.data); setName(res.data.name); setOn(res.data.public);
    } catch { if (alive.current) setLoadError(true); }
  };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (profile && window.location.hash === '#event-ranking') section.current?.scrollIntoView({ block: 'start' });
  }, [profile !== null]);
  const save = async () => {
    const input = validateEventProfile({ public: on, name });
    if (!input) { setMessage('nameInvalid'); return; }
    setBusy(true); setMessage(null);
    try {
      const res = await setSakamichiEventProfile(input); if (!alive.current) return;
      if (!res.success) { setMessage('saveError'); return; }
      const verified = await getSakamichiEventProfile(); if (!alive.current) return;
      if (!verified.success || !verified.data || verified.data.public !== input.public || verified.data.name !== input.name) { setMessage('verifyError'); return; }
      setProfile(verified.data); setName(verified.data.name); setMessage('saved');
    } catch { if (alive.current) setMessage('saveError'); }
    finally { if (alive.current) setBusy(false); }
  };
  const field = 'w-full min-w-0 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';
  return <div id="event-ranking" ref={section} className="scroll-mt-24">
    <div className="mb-3 flex items-center justify-between">
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{tr('settingsTitle')}</h4>
      <a href="/events/history?view=ranking" className="text-xs text-[var(--color-brand-nogi)] underline">{tr('viewRanking')}</a>
    </div>
    <div className="space-y-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
      {profile ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
        <p className="text-xs font-semibold text-[var(--text-secondary)]">{tr(profile.public ? 'public' : 'private')}</p>
        <label className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">{tr('publicName')}
          <input value={name} maxLength={40} onChange={e => { setName(e.target.value); setMessage(null); }} disabled={busy} autoComplete="off" className={field} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); setMessage(null); }} disabled={busy} className="h-4 w-4" />{tr('publicLabel')}
        </label>
        <p className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">{tr('publicHint')}</p>
        <button disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50">
          {busy && <Loader2 size={13} className="animate-spin" />}{tr(busy ? 'saving' : 'profileSave')}
        </button>
        {message && <p role={message === 'saved' ? 'status' : 'alert'} className={`text-xs ${message === 'saved' ? 'text-emerald-600' : 'text-red-600'}`}>{tr(message)}</p>}
      </form> : loadError ? <div role="alert" className="space-y-2 text-xs text-red-600"><p>{tr('loadError')}</p>
        <button type="button" onClick={() => void load()} className="min-h-10 rounded-lg border border-[var(--border-primary)] px-3 text-[var(--text-primary)]">{tr('retry')}</button></div>
        : <p role="status" className="text-xs text-[var(--text-tertiary)]">{tr('loading')}</p>}
    </div>
  </div>;
}
