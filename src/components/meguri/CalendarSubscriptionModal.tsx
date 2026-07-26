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

type Props = {
  show: boolean;
  onClose: () => void;
  onDownload: () => void;
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

const LOTTERY_FEEDS: Array<{
  id: MiguriCalendarFeedGroup;
  label: string;
  detail: string;
  color: string;
}> = [
  { id: 'all', label: '全部三团', detail: '一个日历接收全部受付', color: '#475569' },
  ...GROUPS.map((group) => ({
    ...group,
    detail: `仅${group.label} 抽选受付`,
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
}: {
  id: string;
  httpsUrl: string;
  webcalUrl: string;
  copiedKey: string;
  onCopy: (key: string, value: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => onCopy(id, httpsUrl)}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-primary)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        aria-label="复制日历订阅链接"
      >
        {copiedKey === id ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
        <span className="hidden sm:inline">{copiedKey === id ? '已复制' : '复制'}</span>
      </button>
      <a
        href={webcalUrl}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-3.5 text-xs font-bold text-white transition-opacity hover:opacity-85"
      >
        <Link2 size={15} />
        订阅
      </a>
    </div>
  );
}

export default function CalendarSubscriptionModal({ show, onClose, onDownload }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [subscription, setSubscription] = useState<MiguriCalendarSubscription | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [message, setMessage] = useState('');
  const [subscriptionMode, setSubscriptionMode] = useState<'custom' | 'complete'>('custom');

  useEffect(() => {
    if (!show) return;
    let mounted = true;
    setLoadState('loading');
    setMessage('');
    setConfirmRegenerate(false);

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
        setMessage(res.message || res.error || '私人订阅状态读取失败');
      }
    });

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
  }, [onClose, show]);

  useEffect(() => () => {
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
  }, []);

  if (!show) return null;

  async function handleCopy(key: string, value: string) {
    const copied = await copyText(value);
    setCopiedKey(copied ? key : '');
    setMessage(copied ? 'HTTPS 订阅链接已复制' : '复制失败，请长按链接复制');
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopiedKey(''), 2000);
  }

  async function handleCreate() {
    setActionLoading(true);
    setMessage('');
    const res = await createMiguriCalendarSubscription();
    setActionLoading(false);
    if (!res.success || !res.data) {
      setMessage(res.message || res.error || '私人订阅生成失败');
      return;
    }
    setSubscription(res.data);
    setLoadState('ready');
    setMessage('私人订阅已生成');
  }

  async function handleRegenerate() {
    setActionLoading(true);
    setMessage('');
    const res = await regenerateMiguriCalendarSubscription();
    setActionLoading(false);
    setConfirmRegenerate(false);
    if (!res.success || !res.data) {
      setMessage(res.message || res.error || '私人订阅重置失败');
      return;
    }
    setSubscription(res.data);
    setMessage('链接已重置，旧订阅地址已经失效');
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
              <h2 id="calendar-subscription-title" className="text-base font-bold text-[var(--text-primary)] sm:text-lg">日历订阅</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">不经过 Google，系统日历会定期从 46log 自动更新。</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
            aria-label="关闭日历订阅"
          >
            <X size={20} />
          </button>
        </header>

        <div className="space-y-7 px-5 py-6 sm:px-6">
          <div
            role="group"
            aria-label="选择日历订阅方式"
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
              <ListChecks size={16} /> 按需订阅
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
              <Layers3 size={16} /> 整团订阅
            </button>
          </div>

          {subscriptionMode === 'custom' && (
            <>
          <section aria-labelledby="official-calendar-title">
            <div className="flex items-center gap-2">
              <CalendarDays size={17} className="text-sky-600" />
              <h3 id="official-calendar-title" className="text-sm font-bold text-[var(--text-primary)]">完整官方日程</h3>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700">公开</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">电视、广播、演出、发行、生日等官网全部日程；和 Meet &amp; Greet 受付分开订阅。</p>

            <div className="mt-3 divide-y divide-[var(--border-secondary)] overflow-hidden rounded-2xl border border-[var(--border-primary)]">
              {GROUPS.map((group) => {
                const urls = getOfficialScheduleCalendarUrls(group.id);
                return (
                  <div key={group.id} className="flex items-center gap-3 bg-[var(--bg-primary)] px-3 py-3 sm:px-4">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{group.label}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">仅官网完整日程</p>
                    </div>
                    <FeedActions
                      id={`official-${group.id}`}
                      httpsUrl={urls.httpsUrl}
                      webcalUrl={urls.webcalUrl}
                      copiedKey={copiedKey}
                      onCopy={(key, value) => void handleCopy(key, value)}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="personal-calendar-title">
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-emerald-600" />
              <h3 id="personal-calendar-title" className="text-sm font-bold text-[var(--text-primary)]">我的 Miguri</h3>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">私人</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">自动同步你保存的成员、日期、部数和张数。</p>

            <div className="mt-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
              {loadState === 'loading' && (
                <div className="flex min-h-20 items-center justify-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <Loader2 size={16} className="animate-spin" /> 读取订阅状态…
                </div>
              )}
              {loadState === 'guest' && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">登录后生成私人订阅</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">公开的完整日程、抽选受付和整团订阅仍可直接使用。</p>
                  </div>
                  <a href="/auth/login" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-xs font-bold text-white">
                    <LogIn size={15} /> 登录 / 注册
                  </a>
                </div>
              )}
              {loadState === 'error' && (
                <p className="py-4 text-center text-xs text-red-600">私人订阅暂时不可用，请稍后再试。</p>
              )}
              {loadState === 'ready' && !subscription?.active && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">还没有私人订阅链接</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">生成后可添加到 Apple 日历、Outlook 等应用。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={actionLoading}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                    生成私人订阅
                  </button>
                </div>
              )}
              {loadState === 'ready' && subscription?.active && subscription.httpsUrl && subscription.webcalUrl && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">私人订阅已启用</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-tertiary)]">{subscription.httpsUrl}</p>
                    </div>
                    <FeedActions
                      id="personal"
                      httpsUrl={subscription.httpsUrl}
                      webcalUrl={subscription.webcalUrl}
                      copiedKey={copiedKey}
                      onCopy={(key, value) => void handleCopy(key, value)}
                    />
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                    此链接可以读取你的个人 Miguri 行程，请勿公开分享。
                  </div>
                  {confirmRegenerate ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[11px] leading-5 text-red-700">重置后，已添加到日历中的旧订阅会停止更新。</p>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => setConfirmRegenerate(false)} className="min-h-11 rounded-xl border border-[var(--border-primary)] px-3 text-xs font-semibold text-[var(--text-secondary)]">取消</button>
                        <button type="button" onClick={() => void handleRegenerate()} disabled={actionLoading} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-50">
                          {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 确认重置
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmRegenerate(true)} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-red-600">
                      <RefreshCw size={14} /> 链接泄露？重置订阅地址
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="lottery-calendar-title">
            <div className="flex items-center gap-2">
              <CalendarDays size={17} className="text-violet-600" />
              <h3 id="lottery-calendar-title" className="text-sm font-bold text-[var(--text-primary)]">抽选受付</h3>
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-700">公开</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">每轮受付开始与截止会自动更新，三团可以分开订阅。</p>

            <div className="mt-3 divide-y divide-[var(--border-secondary)] overflow-hidden rounded-2xl border border-[var(--border-primary)]">
              {LOTTERY_FEEDS.map((feed) => {
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
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">只导入一次？</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">下载当前私人行程的 .ics 文件；之后不会自动更新。</p>
            </div>
            <button
              type="button"
              onClick={onDownload}
              disabled={loadState !== 'ready'}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download size={15} /> {loadState === 'guest' ? '登录后下载' : '下载 .ics'}
            </button>
          </section>
            </>
          )}

          {subscriptionMode === 'complete' && (
            <section aria-labelledby="complete-calendar-title">
              <div className="flex items-center gap-2">
                <Layers3 size={17} className="text-emerald-600" />
                <h3 id="complete-calendar-title" className="text-sm font-bold text-[var(--text-primary)]">整团全部日程</h3>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">聚合</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">一个订阅同时接收该团官网完整日程和 Meet &amp; Greet 抽选受付，适合不想逐项选择的人。</p>

              <div className="mt-3 space-y-3">
                {GROUPS.map((group) => {
                  const urls = getCompleteGroupCalendarUrls(group.id);
                  return (
                    <article
                      key={group.id}
                      className="overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)]"
                    >
                      <div className="h-1" style={{ backgroundColor: group.color }} />
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">{group.label} 全部日程</h4>
                          <p className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">官网完整日程 + Miguri 抽选开始／截止</p>
                        </div>
                        <FeedActions
                          id={`complete-${group.id}`}
                          httpsUrl={urls.httpsUrl}
                          webcalUrl={urls.webcalUrl}
                          copiedKey={copiedKey}
                          onCopy={(key, value) => void handleCopy(key, value)}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[11px] leading-5 text-amber-800">
                <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                <p>
                  同一团建议在“整团订阅”和“按需订阅”之间二选一，否则系统日历可能显示重复事件。私人 Miguri 的成员、部数和张数不会进入公开整团订阅。
                </p>
              </div>
            </section>
          )}

          <p aria-live="polite" className={`min-h-5 text-center text-xs ${message.includes('失败') || message.includes('不可用') ? 'text-red-600' : 'text-emerald-600'}`}>
            {message}
          </p>
        </div>
      </section>
    </div>
  );
}
