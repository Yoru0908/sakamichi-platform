import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  Copy,
  Download,
  Layers3,
  Link2,
  ListChecks,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  createMiguriCalendarSubscription,
  getCompleteGroupCalendarUrls,
  getMiguriCalendarSubscription,
  getMiguriLotteryCalendarUrls,
  getOfficialScheduleCalendarUrls,
  regenerateMiguriCalendarSubscription,
  type MiguriCalendarFeedGroup,
  type MiguriCalendarSubscription,
  type MiguriGroupId,
} from '@/utils/auth-api';
import { useLanguage } from '@/i18n/use-language';
import { calendarTranslator, type CalendarTranslate } from '@/i18n/miguri-calendar';

type Props = {
  show: boolean;
  onClose: () => void;
  onDownload?: () => void;
  focusGroup?: MiguriGroupId | null;
  publicOnly?: boolean;
  initialMode?: 'custom' | 'complete';
};

type LoadState = 'idle' | 'loading' | 'ready' | 'guest' | 'error';

const GROUPS: Array<{
  id: MiguriGroupId;
  label: string;
  color: string;
}> = [
  { id: 'nogizaka', label: '乃木坂46', color: '#742581' },
  { id: 'sakurazaka', label: '櫻坂46', color: '#db5f8d' },
  { id: 'hinatazaka', label: '日向坂46', color: '#0284c7' },
];

const lotteryFeeds = (ct: CalendarTranslate): Array<{
  id: MiguriCalendarFeedGroup;
  label: string;
  detail: string;
  color: string;
}> => [
  { id: 'all', label: ct('allGroups'), detail: ct('allGroupsDetail'), color: '#475569' },
  ...GROUPS.map((group) => ({
    ...group,
    detail: ct('groupLotteryOnly', { group: group.label }),
  })),
];

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

function FeedActions({
  id,
  httpsUrl,
  webcalUrl,
  copiedKey,
  onCopy,
  ct,
}: {
  id: string;
  httpsUrl: string;
  webcalUrl: string;
  copiedKey: string;
  onCopy: (key: string, value: string) => void;
  ct: CalendarTranslate;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => onCopy(id, httpsUrl)}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-primary)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        aria-label={ct('copyLink')}
      >
        {copiedKey === id ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
        <span className="hidden sm:inline">{copiedKey === id ? ct('copied') : ct('copy')}</span>
      </button>
      <a
        href={webcalUrl}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-3.5 text-xs font-bold text-white transition-opacity hover:opacity-85"
      >
        <Link2 size={15} />
        {ct('subscribe')}
      </a>
    </div>
  );
}

export default function CalendarSubscriptionModal({
  show,
  onClose,
  onDownload,
  focusGroup = null,
  publicOnly = false,
  initialMode = 'custom',
}: Props) {
  const ct = calendarTranslator(useLanguage());
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [subscription, setSubscription] = useState<MiguriCalendarSubscription | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  // The tone is kept with the text: a translated message can no longer be told apart by looking for 失败.
  const [message, setMessageState] = useState<{ text: string; error: boolean }>({ text: '', error: false });
  const setMessage = (text: string, error = false) => setMessageState({ text, error });
  const [subscriptionMode, setSubscriptionMode] = useState<'custom' | 'complete'>(initialMode);
  const visibleGroups = focusGroup ? GROUPS.filter((group) => group.id === focusGroup) : GROUPS;
  const visibleLotteryFeeds = focusGroup
    ? lotteryFeeds(ct).filter((feed) => feed.id === focusGroup)
    : lotteryFeeds(ct);

  useEffect(() => {
    if (!show) return;
    let mounted = true;
    setSubscriptionMode(initialMode);
    setMessage('');
    setConfirmRegenerate(false);

    if (publicOnly) {
      setLoadState('idle');
      setSubscription(null);
    } else {
      setLoadState('loading');
      void getMiguriCalendarSubscription().then((res) => {
        if (!mounted) return;
        if (res.success && res.data) {
          setSubscription(res.data);
          setLoadState('ready');
        } else if ((res.error || res.message || '').includes('登录')) {
          setSubscription(null);
          setLoadState('guest');
        } else {
          setLoadState('error');
          setMessage(res.message || res.error || ct('statusFailed'), true);
        }
      });
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      mounted = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [initialMode, onClose, publicOnly, show]);

  useEffect(() => () => {
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
  }, []);

  if (!show) return null;

  async function handleCopy(key: string, value: string) {
    const copied = await copyText(value);
    setCopiedKey(copied ? key : '');
    setMessage(copied ? ct('linkCopied') : ct('copyFailed'), !copied);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopiedKey(''), 2000);
  }

  async function handleCreate() {
    setActionLoading(true);
    setMessage('');
    const res = await createMiguriCalendarSubscription();
    setActionLoading(false);
    if (!res.success || !res.data) {
      setMessage(res.message || res.error || ct('createFailed'), true);
      return;
    }
    setSubscription(res.data);
    setLoadState('ready');
    setMessage(ct('created'));
  }

  async function handleRegenerate() {
    setActionLoading(true);
    setMessage('');
    const res = await regenerateMiguriCalendarSubscription();
    setActionLoading(false);
    setConfirmRegenerate(false);
    if (!res.success || !res.data) {
      setMessage(res.message || res.error || ct('resetFailed'), true);
      return;
    }
    setSubscription(res.data);
    setMessage(ct('reset'));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:px-4 sm:py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-subscription-title"
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-2xl sm:max-w-2xl sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border-secondary)] bg-[var(--bg-primary)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <CalendarDays size={20} />
            </span>
            <div>
              <h2 id="calendar-subscription-title" className="text-base font-bold text-[var(--text-primary)] sm:text-lg">
                {focusGroup ? ct('groupTitle', { group: GROUPS.find((group) => group.id === focusGroup)?.label || '' }) : ct('title')}
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{ct('intro')}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
            aria-label={ct('close')}
          >
            <X size={20} />
          </button>
        </header>

        <div className="space-y-7 px-5 py-6 sm:px-6">
          <div
            role="group"
            aria-label={ct('mode')}
            className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-1"
          >
            <button
              type="button"
              aria-pressed={subscriptionMode === 'custom'}
              onClick={() => setSubscriptionMode('custom')}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition-colors ${
                subscriptionMode === 'custom'
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ListChecks size={16} /> {ct('custom')}
            </button>
            <button
              type="button"
              aria-pressed={subscriptionMode === 'complete'}
              onClick={() => setSubscriptionMode('complete')}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition-colors ${
                subscriptionMode === 'complete'
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers3 size={16} /> {ct('complete')}
            </button>
          </div>

          {subscriptionMode === 'custom' && (
            <>
          <section aria-labelledby="official-calendar-title">
            <div className="flex items-center gap-2">
              <CalendarDays size={17} className="text-sky-600" />
              <h3 id="official-calendar-title" className="text-sm font-bold text-[var(--text-primary)]">{ct('official')}</h3>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700">{ct('public')}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">{ct('officialBody')}</p>

            <div className="mt-3 divide-y divide-[var(--border-secondary)] overflow-hidden rounded-2xl border border-[var(--border-primary)]">
              {visibleGroups.map((group) => {
                const urls = getOfficialScheduleCalendarUrls(group.id);
                return (
                  <div key={group.id} className="flex items-center gap-3 bg-[var(--bg-primary)] px-3 py-3 sm:px-4">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{group.label}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{ct('officialOnly')}</p>
                    </div>
                    <FeedActions
                      id={`official-${group.id}`}
                      httpsUrl={urls.httpsUrl}
                      webcalUrl={urls.webcalUrl}
                      copiedKey={copiedKey}
                      onCopy={(key, value) => void handleCopy(key, value)}
                      ct={ct}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {!publicOnly && <section aria-labelledby="personal-calendar-title">
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-emerald-600" />
              <h3 id="personal-calendar-title" className="text-sm font-bold text-[var(--text-primary)]">{ct('mine')}</h3>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{ct('private')}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">{ct('mineBody')}</p>

            <div className="mt-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
              {loadState === 'loading' && (
                <div className="flex min-h-20 items-center justify-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <Loader2 size={16} className="animate-spin" /> {ct('loadingStatus')}
                </div>
              )}
              {loadState === 'guest' && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{ct('guestTitle')}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{ct('guestBody')}</p>
                  </div>
                  <a href="/auth/login" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-xs font-bold text-white">
                    <LogIn size={15} /> {ct('signIn')}
                  </a>
                </div>
              )}
              {loadState === 'error' && (
                <p className="py-4 text-center text-xs text-red-600">{ct('unavailable')}</p>
              )}
              {loadState === 'ready' && !subscription?.active && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{ct('noLink')}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{ct('noLinkBody')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={actionLoading}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                    {ct('create')}
                  </button>
                </div>
              )}
              {loadState === 'ready' && subscription?.active && subscription.httpsUrl && subscription.webcalUrl && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{ct('active')}</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-tertiary)]">{subscription.httpsUrl}</p>
                    </div>
                    <FeedActions
                      id="personal"
                      httpsUrl={subscription.httpsUrl}
                      webcalUrl={subscription.webcalUrl}
                      copiedKey={copiedKey}
                      onCopy={(key, value) => void handleCopy(key, value)}
                      ct={ct}
                    />
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                    {ct('keepPrivate')}
                  </div>
                  {confirmRegenerate ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[11px] leading-5 text-red-700">{ct('resetWarning')}</p>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => setConfirmRegenerate(false)} className="min-h-11 rounded-xl border border-[var(--border-primary)] px-3 text-xs font-semibold text-[var(--text-secondary)]">{ct('cancel')}</button>
                        <button type="button" onClick={() => void handleRegenerate()} disabled={actionLoading} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-50">
                          {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {ct('confirmReset')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmRegenerate(true)} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-red-600">
                      <RefreshCw size={14} /> {ct('leaked')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>}

          <section aria-labelledby="lottery-calendar-title">
            <div className="flex items-center gap-2">
              <CalendarDays size={17} className="text-violet-600" />
              <h3 id="lottery-calendar-title" className="text-sm font-bold text-[var(--text-primary)]">{ct('lottery')}</h3>
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-700">{ct('public')}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">{ct('lotteryBody')}</p>

            <div className="mt-3 divide-y divide-[var(--border-secondary)] overflow-hidden rounded-2xl border border-[var(--border-primary)]">
              {visibleLotteryFeeds.map((feed) => {
                const urls = getMiguriLotteryCalendarUrls(feed.id);
                return (
                  <div key={feed.id} className="flex items-center gap-3 bg-[var(--bg-primary)] px-3 py-3 sm:px-4">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: feed.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{feed.label}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{feed.detail}</p>
                    </div>
                    <FeedActions
                      id={`lottery-${feed.id}`}
                      httpsUrl={urls.httpsUrl}
                      webcalUrl={urls.webcalUrl}
                      copiedKey={copiedKey}
                      onCopy={(key, value) => void handleCopy(key, value)}
                      ct={ct}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {!publicOnly && <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{ct('once')}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{ct('onceBody')}</p>
            </div>
            <button
              type="button"
              onClick={onDownload}
              disabled={loadState !== 'ready'}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download size={15} /> {loadState === 'guest' ? ct('signInToDownload') : ct('download')}
            </button>
          </section>}
            </>
          )}

          {subscriptionMode === 'complete' && (
            <section aria-labelledby="complete-calendar-title">
              <div className="flex items-center gap-2">
                <Layers3 size={17} className="text-emerald-600" />
                <h3 id="complete-calendar-title" className="text-sm font-bold text-[var(--text-primary)]">{ct('completeTitle')}</h3>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{ct('aggregate')}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">{ct('completeBody')}</p>

              <div className="mt-3 space-y-3">
                {visibleGroups.map((group) => {
                  const urls = getCompleteGroupCalendarUrls(group.id);
                  return (
                    <article
                      key={group.id}
                      className="overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)]"
                    >
                      <div className="h-1" style={{ backgroundColor: group.color }} />
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">{ct('groupAll', { group: group.label })}</h4>
                          <p className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">{ct('groupAllBody')}</p>
                        </div>
                        <FeedActions
                          id={`complete-${group.id}`}
                          httpsUrl={urls.httpsUrl}
                          webcalUrl={urls.webcalUrl}
                          copiedKey={copiedKey}
                          onCopy={(key, value) => void handleCopy(key, value)}
                      ct={ct}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[11px] leading-5 text-amber-800">
                <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                <p>
                  {ct('duplicateWarning')}
                </p>
              </div>
            </section>
          )}

          <p aria-live="polite" className={`min-h-5 text-center text-xs ${message.error ? 'text-red-600' : 'text-emerald-600'}`}>
            {message.text}
          </p>
        </div>
      </section>
    </div>
  );
}
