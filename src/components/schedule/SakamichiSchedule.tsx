import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Grid3X3,
  Layers3,
  Link2,
  List,
  Loader2,
  MapPin,
  Radio,
  RefreshCw,
  Tag,
  Tv,
  Users,
  Video,
  X,
} from 'lucide-react';
import CalendarSubscriptionModal from '@/components/meguri/CalendarSubscriptionModal';
import type { MiguriGroupId } from '@/utils/auth-api';
import {
  dedupeScheduleEvents,
  groupMeta,
  parseScheduleIcs,
  SCHEDULE_CATEGORIES,
  SCHEDULE_GROUPS,
  type ScheduleCategory,
  type ScheduleEvent,
} from './schedule-ics';

type ViewMode = 'today' | 'month' | 'periods';
type CachePayload = { storedAt: number; events: ScheduleEvent[] };

const FEEDS = [
  { path: '/api/schedule-feed/nogizaka', kind: 'official' as const, group: 'nogizaka' as const },
  { path: '/api/schedule-feed/sakurazaka', kind: 'official' as const, group: 'sakurazaka' as const },
  { path: '/api/schedule-feed/hinatazaka', kind: 'official' as const, group: 'hinatazaka' as const },
  { path: '/api/schedule-feed/lottery', kind: 'lottery' as const },
];
const CACHE_KEY = 'sakamichi-schedule-feed-v1';
const CACHE_MAX_AGE = 10 * 60 * 1000;

const CATEGORY_ICONS: Record<ScheduleCategory, typeof CalendarDays> = {
  tv: Tv,
  radio: Radio,
  live: Users,
  web: Video,
  release: Tag,
  birthday: CalendarDays,
  miguri: CalendarDays,
  other: CalendarDays,
};

function tokyoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function asJstDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00+09:00`);
}

function shiftDate(dateKey: string, amount: number): string {
  const date = asJstDate(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(dateKey: string, amount: number): string {
  const date = asJstDate(dateKey);
  date.setUTCMonth(date.getUTCMonth() + amount, 1);
  return date.toISOString().slice(0, 10);
}

function formatDateHeading(dateKey: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(asJstDate(dateKey));
}

function eventFallsOnDate(event: ScheduleEvent, dateKey: string): boolean {
  if (!event.allDay) return event.dateKey === dateKey;
  return dateKey >= event.dateKey && dateKey < event.endDateKey;
}

function timeMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function eventDurationMinutes(event: ScheduleEvent): number {
  return Math.max(30, (new Date(event.endIso).getTime() - new Date(event.startIso).getTime()) / 60000);
}

function monthGrid(dateKey: string): string[] {
  const first = `${dateKey.slice(0, 7)}-01`;
  const firstDate = asJstDate(first);
  const firstWeekday = firstDate.getUTCDay();
  const start = shiftDate(first, -firstWeekday);
  return Array.from({ length: 42 }, (_, index) => shiftDate(start, index));
}

function readCache(): CachePayload | null {
  try {
    const value = sessionStorage.getItem(CACHE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as CachePayload;
    return Date.now() - parsed.storedAt < CACHE_MAX_AGE ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(events: ScheduleEvent[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ storedAt: Date.now(), events }));
  } catch {
    // A full or disabled session store must not block the schedule.
  }
}

function EventCategory({ event }: { event: ScheduleEvent }) {
  const Icon = CATEGORY_ICONS[event.category];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--text-tertiary)]">
      <Icon size={12} aria-hidden="true" />
      {event.categoryLabel}
    </span>
  );
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'min-h-44' : 'min-h-64'}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
        <CalendarDays size={22} />
      </span>
      <strong className="mt-4 text-sm text-[var(--text-primary)]">这一天暂无筛选后的日程</strong>
      <span className="mt-1 max-w-sm text-xs leading-5 text-[var(--text-tertiary)]">可以切换日期、团体或分类继续查看。</span>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)]" aria-label="正在读取日程">
      <div className="flex min-h-72 flex-col items-center justify-center">
        <Loader2 className="animate-spin text-[var(--color-brand-nogi)]" size={24} />
        <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">正在整理三坂官方日程</p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">首次载入可能需要几秒，之后会从缓存快速打开。</p>
      </div>
    </section>
  );
}

function TodayView({
  dateKey,
  events,
  activeGroups,
  onOpen,
}: {
  dateKey: string;
  events: ScheduleEvent[];
  activeGroups: MiguriGroupId[];
  onOpen: (event: ScheduleEvent) => void;
}) {
  const dayEvents = events.filter((event) => eventFallsOnDate(event, dateKey));
  const allDay = dayEvents.filter((event) => event.allDay);
  const timed = dayEvents.filter((event) => !event.allDay).sort((a, b) => a.startIso.localeCompare(b.startIso));
  const timelineStart = 6 * 60;
  const timelineEnd = 30 * 60;
  const timelineDuration = timelineEnd - timelineStart;
  const hours = Array.from({ length: 25 }, (_, index) => index + 6);

  if (dayEvents.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)]">
        <EmptyState />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-sm">
      {allDay.length > 0 && (
        <div className="grid border-b border-[var(--border-primary)] md:grid-cols-[145px_1fr]">
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 md:border-b-0 md:border-r">
            <span className="text-xs font-bold text-[var(--text-secondary)]">全天事项</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">{allDay.length} 件</span>
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            {allDay.map((event) => {
              const group = groupMeta(event.group);
              return (
                <button
                  key={`${event.uid}-${event.startIso}`}
                  type="button"
                  onClick={() => onOpen(event)}
                  className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-xl border px-3 text-left text-xs font-semibold transition-colors hover:bg-[var(--bg-secondary)]"
                  style={{ borderColor: `${group.color}55`, color: 'var(--text-primary)' }}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                  <span className="truncate">{event.title}</span>
                  <span className="shrink-0 text-[10px] font-medium text-[var(--text-tertiary)]">{event.categoryLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[1080px]">
          <div className="grid h-12 grid-cols-[145px_1fr] border-b border-[var(--border-primary)]">
            <div className="flex items-center justify-center border-r border-[var(--border-primary)] text-xs font-medium text-[var(--text-tertiary)]">JST</div>
            <div className="relative">
              {hours.map((hour, index) => (
                <span
                  key={hour}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] text-[var(--text-tertiary)]"
                  style={{ left: `${(index / 24) * 100}%` }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>
          {activeGroups.map((groupId) => {
            const group = groupMeta(groupId);
            const groupEvents = timed.filter((event) => event.group === groupId);
            return (
              <div key={groupId} className="grid min-h-36 grid-cols-[145px_1fr] border-b border-[var(--border-primary)] last:border-b-0">
                <div className="flex items-center gap-3 border-r border-[var(--border-primary)] px-4">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                  <div>
                    <strong className="block text-sm text-[var(--text-primary)]">{group.label}</strong>
                    <span className="text-[10px] text-[var(--text-tertiary)]">{groupEvents.length} 件日程</span>
                  </div>
                </div>
                <div
                  className="relative"
                  style={{
                    backgroundImage: 'linear-gradient(to right, var(--border-primary) 1px, transparent 1px)',
                    backgroundSize: `${100 / 24}% 100%`,
                  }}
                >
                  {groupEvents.map((event, index) => {
                    const start = Math.max(timelineStart, timeMinutes(event.startTime));
                    const left = ((start - timelineStart) / timelineDuration) * 100;
                    const width = Math.max(7, (eventDurationMinutes(event) / timelineDuration) * 100);
                    const clampedLeft = Math.max(0, Math.min(left, 96));
                    const clampedWidth = Math.max(4, Math.min(width, 100 - clampedLeft));
                    return (
                      <button
                        key={`${event.uid}-${event.startIso}`}
                        type="button"
                        onClick={() => onOpen(event)}
                        className="absolute flex min-h-[50px] flex-col items-start overflow-hidden rounded-xl border px-2.5 py-1.5 text-left shadow-sm transition-transform hover:-translate-y-0.5"
                        style={{
                          left: `${clampedLeft}%`,
                          width: `${clampedWidth}%`,
                          top: `${10 + (index % 2) * 58}px`,
                          borderColor: `${group.color}55`,
                          backgroundColor: group.softColor,
                          color: '#202024',
                        }}
                      >
                        <span className="text-[10px] font-bold" style={{ color: group.color }}>{event.startTime}</span>
                        <span className="w-full truncate text-xs font-bold">{event.title}</span>
                        <EventCategory event={event} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="divide-y divide-[var(--border-primary)] md:hidden">
        {timed.length === 0 ? <EmptyState compact /> : timed.map((event) => {
          const group = groupMeta(event.group);
          return (
            <button
              key={`${event.uid}-${event.startIso}`}
              type="button"
              onClick={() => onOpen(event)}
              className="grid min-h-[86px] w-full grid-cols-[48px_8px_1fr_20px] items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-secondary)]"
            >
              <span className="text-xs font-bold text-[var(--text-secondary)]">{event.startTime}</span>
              <span className="h-10 w-1 rounded-full" style={{ backgroundColor: group.color }} />
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold" style={{ color: group.color }}>{group.label} · {event.categoryLabel}</span>
                <strong className="mt-0.5 block text-sm text-[var(--text-primary)]">{event.title}</strong>
                <span className="mt-1 block truncate text-[10px] text-[var(--text-tertiary)]">{event.members || event.location || '官方日程'}</span>
              </span>
              <ChevronRight size={17} className="text-[var(--text-tertiary)]" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MonthView({
  dateKey,
  events,
  onSelect,
}: {
  dateKey: string;
  events: ScheduleEvent[];
  onSelect: (dateKey: string) => void;
}) {
  const days = monthGrid(dateKey);
  const month = dateKey.slice(0, 7);
  const today = tokyoToday();

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-sm">
      <div className="grid grid-cols-7 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
        {['日', '一', '二', '三', '四', '五', '六'].map((weekday) => (
          <div key={weekday} className="py-2.5 text-center text-[11px] font-bold text-[var(--text-tertiary)]">{weekday}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = events.filter((event) => eventFallsOnDate(event, day));
          const groups = [...new Set(dayEvents.map((event) => event.group))];
          const inMonth = day.startsWith(month);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              className={`relative min-h-20 border-b border-r border-[var(--border-primary)] p-2 text-left transition-colors hover:bg-[var(--bg-secondary)] sm:min-h-28 sm:p-3 ${
                inMonth ? '' : 'bg-[var(--bg-secondary)]/50 opacity-45'
              }`}
            >
              <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                day === today ? 'bg-[var(--color-brand-nogi)] text-white' : 'text-[var(--text-secondary)]'
              }`}>
                {Number(day.slice(-2))}
              </span>
              {dayEvents.length > 0 && (
                <>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {groups.map((groupId) => (
                      <span key={groupId} className="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" style={{ backgroundColor: groupMeta(groupId).color }} />
                    ))}
                  </div>
                  <span className="mt-1 hidden text-[10px] font-medium text-[var(--text-tertiary)] sm:block">{dayEvents.length} 件日程</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PeriodView({
  events,
  onOpen,
}: {
  events: ScheduleEvent[];
  onOpen: (event: ScheduleEvent) => void;
}) {
  const today = tokyoToday();
  const periods = events
    .filter((event) => event.feedKind === 'lottery' || (event.allDay && event.endDateKey > shiftDate(event.dateKey, 1)))
    .filter((event) => event.endDateKey >= shiftDate(today, -21))
    .sort((a, b) => a.startIso.localeCompare(b.startIso))
    .slice(0, 40);

  return (
    <section className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--text-tertiary)]">PERIODS</p>
        <h2 className="mt-1 font-serif text-2xl font-bold text-[var(--text-primary)]">期间日程</h2>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">集中查看抽选受付和跨日活动。日期采用日本时间。</p>
      </div>
      {periods.length === 0 ? <EmptyState /> : (
        <div className="space-y-5">
          {SCHEDULE_GROUPS.map((group) => {
            const groupPeriods = periods.filter((event) => event.group === group.id);
            if (groupPeriods.length === 0) return null;
            return (
              <div key={group.id} className="grid gap-3 sm:grid-cols-[130px_1fr]">
                <div className="flex items-start gap-2 pt-3">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                  <div>
                    <strong className="block text-sm text-[var(--text-primary)]">{group.label}</strong>
                    <span className="text-[10px] text-[var(--text-tertiary)]">{groupPeriods.length} 件</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {groupPeriods.map((event) => (
                    <button
                      key={`${event.uid}-${event.startIso}`}
                      type="button"
                      onClick={() => onOpen(event)}
                      className="flex min-h-16 w-full flex-col justify-center rounded-xl border px-4 py-3 text-left transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      style={{ borderColor: `${group.color}55`, backgroundColor: group.softColor, color: '#202024' }}
                    >
                      <strong className="text-sm">{event.title}</strong>
                      <span className="mt-1 shrink-0 text-[11px] font-semibold sm:mt-0">
                        {event.dateKey.replaceAll('-', '/')} – {shiftDate(event.endDateKey, -1).replaceAll('-', '/')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EventDetail({
  event,
  onClose,
  onSubscribe,
}: {
  event: ScheduleEvent | null;
  onClose: () => void;
  onSubscribe: (group: MiguriGroupId) => void;
}) {
  useEffect(() => {
    if (!event) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [event, onClose]);

  if (!event) return null;
  const group = groupMeta(event.group);
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(asJstDate(event.dateKey));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="schedule-event-title" className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--bg-primary)] shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="h-1.5" style={{ backgroundColor: group.color }} />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-bold" style={{ color: group.color }}>{group.label} · {event.categoryLabel}</span>
              <h2 id="schedule-event-title" className="mt-2 text-xl font-bold leading-8 text-[var(--text-primary)]">{event.title}</h2>
            </div>
            <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]" aria-label="关闭详情">
              <X size={20} />
            </button>
          </div>

          <dl className="mt-5 space-y-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
            <div className="flex gap-3">
              <Clock3 size={17} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
              <div>
                <dt className="sr-only">时间</dt>
                <dd className="text-sm font-semibold text-[var(--text-primary)]">
                  {dateLabel} {event.allDay ? '· 全天' : `· ${event.startTime}–${event.endTime} JST`}
                </dd>
              </div>
            </div>
            {event.members && (
              <div className="flex gap-3">
                <Users size={17} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                <div><dt className="sr-only">成员</dt><dd className="text-sm text-[var(--text-secondary)]">{event.members}</dd></div>
              </div>
            )}
            {event.location && (
              <div className="flex gap-3">
                <MapPin size={17} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                <div><dt className="sr-only">地点</dt><dd className="text-sm text-[var(--text-secondary)]">{event.location}</dd></div>
              </div>
            )}
          </dl>

          {event.description && (
            <p className="mt-5 whitespace-pre-line text-sm leading-7 text-[var(--text-secondary)]">{event.description}</p>
          )}

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onSubscribe(event.group)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-nogi)] px-4 text-sm font-bold text-white hover:opacity-90"
            >
              <Link2 size={17} /> 订阅该团
            </button>
            {event.url ? (
              <a href={event.url} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]">
                <ExternalLink size={17} /> 查看官方来源
              </a>
            ) : (
              <button type="button" disabled className="min-h-12 rounded-xl border border-[var(--border-primary)] text-sm text-[var(--text-tertiary)] opacity-50">暂无来源链接</button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function SakamichiSchedule() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadWarning, setLoadWarning] = useState('');
  const [view, setView] = useState<ViewMode>('today');
  const [dateKey, setDateKey] = useState(tokyoToday);
  const [activeGroups, setActiveGroups] = useState<MiguriGroupId[]>(SCHEDULE_GROUPS.map((group) => group.id));
  const [category, setCategory] = useState<'all' | ScheduleCategory>('all');
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [subscriptionGroup, setSubscriptionGroup] = useState<MiguriGroupId | null>(null);

  async function loadFeeds(ignoreCache = false) {
    if (!ignoreCache) {
      const cached = readCache();
      if (cached) {
        setEvents(cached.events);
        setLoadState('ready');
        return;
      }
    }

    setLoadState('loading');
    setLoadWarning('');
    const results = await Promise.allSettled(FEEDS.map(async (feed) => {
      const response = await fetch(feed.path, { headers: { Accept: 'text/calendar' } });
      if (!response.ok) throw new Error(`${feed.path}: ${response.status}`);
      return parseScheduleIcs(await response.text(), feed.kind, 'group' in feed ? feed.group : undefined);
    }));
    const successful = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const failedCount = results.filter((result) => result.status === 'rejected').length;

    if (successful.length === 0) {
      setLoadState('error');
      return;
    }

    const nextEvents = dedupeScheduleEvents(successful).sort((a, b) => a.startIso.localeCompare(b.startIso));
    setEvents(nextEvents);
    setLoadState('ready');
    writeCache(nextEvents);
    if (failedCount > 0) setLoadWarning(`有 ${failedCount} 个日程源暂时未能载入，当前内容可能不完整。`);
  }

  useEffect(() => {
    void loadFeeds();
  }, []);

  const filteredEvents = useMemo(
    () => events.filter((event) => activeGroups.includes(event.group) && (category === 'all' || event.category === category)),
    [activeGroups, category, events],
  );

  function toggleGroup(groupId: MiguriGroupId) {
    setActiveGroups((current) => {
      if (current.includes(groupId)) {
        return current.length === 1 ? current : current.filter((id) => id !== groupId);
      }
      return [...current, groupId];
    });
  }

  function openSubscription(group: MiguriGroupId | null = null) {
    setSelectedEvent(null);
    setSubscriptionGroup(group);
    setSubscriptionOpen(true);
  }

  function closeSubscription() {
    setSubscriptionOpen(false);
    setSubscriptionGroup(null);
  }

  function moveDate(direction: number) {
    setDateKey((current) => view === 'month' ? shiftMonth(current, direction) : shiftDate(current, direction));
  }

  return (
    <div className="bg-[var(--bg-secondary)]/45">
      <main className="mx-auto min-h-[75vh] max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <header className="flex flex-col gap-5 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--color-brand-nogi)_10%,var(--bg-primary))] text-[var(--color-brand-nogi)]">
                <CalendarDays size={21} />
              </span>
              <div>
                <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--text-tertiary)]">SAKAMICHI SCHEDULE</p>
                <h1 className="mt-0.5 font-serif text-3xl font-bold tracking-tight text-[var(--text-primary)]">三坂日程</h1>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">三团官网日程与 Miguri 抽选节点，统一按日本时间整理。点击事项可查看详情和官方来源。</p>
          </div>
          <button type="button" onClick={() => openSubscription()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-nogi)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 sm:min-h-11">
            <Link2 size={17} /> 订阅日历
          </button>
        </header>

        <section className="mb-5 overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-sm" aria-label="日程控制">
          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-1">
              {([
                { id: 'today', label: '今日・今周', icon: List },
                { id: 'month', label: '月历', icon: Grid3X3 },
                { id: 'periods', label: '期间日程', icon: Layers3 },
              ] as const).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    aria-pressed={view === item.id}
                    className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold ${
                      view === item.id ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon size={16} /> <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-1">
              <button type="button" onClick={() => moveDate(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]" aria-label={view === 'month' ? '上个月' : '前一天'}>
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => setDateKey(tokyoToday())} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]">
                {view === 'month' ? `${dateKey.slice(0, 4)}年${Number(dateKey.slice(5, 7))}月` : formatDateHeading(dateKey)}
                {dateKey === tokyoToday() && <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-600">今天</span>}
              </button>
              <button type="button" onClick={() => moveDate(1)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]" aria-label={view === 'month' ? '下个月' : '后一天'}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="border-t border-[var(--border-primary)] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {SCHEDULE_GROUPS.map((group) => {
                  const active = activeGroups.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-pressed={active}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-opacity"
                      style={{
                        borderColor: active ? `${group.color}88` : 'var(--border-primary)',
                        backgroundColor: active ? group.softColor : 'var(--bg-primary)',
                        color: active ? '#202024' : 'var(--text-tertiary)',
                        opacity: active ? 1 : 0.7,
                      }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                      {group.label}
                      {active && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
              <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:pb-0">
                {SCHEDULE_CATEGORIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    aria-pressed={category === item.id}
                    className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-semibold ${
                      category === item.id ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {loadWarning && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-800">
            <span>{loadWarning}</span>
            <button type="button" onClick={() => void loadFeeds(true)} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 font-bold"><RefreshCw size={14} /> 重试</button>
          </div>
        )}

        {loadState === 'loading' && <LoadingState />}
        {loadState === 'error' && (
          <section className="rounded-2xl border border-red-500/20 bg-[var(--bg-primary)]">
            <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
              <CalendarDays size={24} className="text-red-500" />
              <strong className="mt-4 text-sm text-[var(--text-primary)]">日程暂时读取失败</strong>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">订阅服务不受影响，可以稍后重试。</p>
              <button type="button" onClick={() => void loadFeeds(true)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-xs font-bold text-[var(--bg-primary)]"><RefreshCw size={15} /> 重新载入</button>
            </div>
          </section>
        )}
        {loadState === 'ready' && view === 'today' && <TodayView dateKey={dateKey} events={filteredEvents} activeGroups={activeGroups} onOpen={setSelectedEvent} />}
        {loadState === 'ready' && view === 'month' && <MonthView dateKey={dateKey} events={filteredEvents} onSelect={(day) => { setDateKey(day); setView('today'); }} />}
        {loadState === 'ready' && view === 'periods' && <PeriodView events={filteredEvents} onOpen={setSelectedEvent} />}

        <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3 text-[11px] leading-5 text-[var(--text-tertiary)] sm:flex-row sm:items-center sm:justify-between">
          <span>数据来自三团官方网站与 46log Miguri 日历。页面和订阅均按 JST 更新。</span>
          <span className="shrink-0">非官方粉丝项目</span>
        </div>
      </main>

      <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} onSubscribe={openSubscription} />
      <CalendarSubscriptionModal
        show={subscriptionOpen}
        onClose={closeSubscription}
        focusGroup={subscriptionGroup}
        publicOnly
        initialMode={subscriptionGroup ? 'complete' : 'custom'}
      />
    </div>
  );
}
