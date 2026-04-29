import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  ExternalLink,
  Layers3,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  createMiguriEntries,
  deleteMiguriEntry,
  getGoogleCalendarConnectUrl,
  getMiguriEvents,
  openMiguriCalendarIcs,
  updateMiguriEntry,
  type MiguriEntry,
  type MiguriEntryStatus,
  type MiguriEvent,
  type MiguriGroupId,
  type MiguriGoogleCalendarStatus,
} from '@/utils/auth-api';
import {
  buildPendingMeguriDraft,
  countPendingDraftRecords,
  groupEntriesByDateAndSlot,
  hasEventDatePassed,
  inferEventState,
  sortEventsForDisplay,
  summarizeEntries,
  type PendingMeguriDraft,
} from './meguri-helpers';

type AddForm = {
  date: string;
  slots: number[];
  member: string;
  tickets: number;
  status: MiguriEntryStatus;
  search: string;
};

const GROUP_META: Record<MiguriGroupId, { label: string; color: string; soft: string }> = {
  nogizaka: { label: '乃木坂46', color: '#742581', soft: 'rgba(116, 37, 129, 0.12)' },
  hinatazaka: { label: '日向坂46', color: '#00bbff', soft: 'rgba(56, 189, 248, 0.14)' },
  sakurazaka: { label: '櫻坂46', color: '#f472b6', soft: 'rgba(244, 114, 182, 0.14)' },
};

function stateTone(state: 'active' | 'upcoming' | 'ended' | 'waiting') {
  if (state === 'active') return 'rgba(16, 185, 129, 0.14)';
  if (state === 'upcoming') return 'rgba(59, 130, 246, 0.14)';
  if (state === 'waiting') return 'rgba(100, 116, 139, 0.14)';
  return 'rgba(148, 163, 184, 0.14)';
}

function stateLabel(state: 'active' | 'upcoming' | 'ended' | 'waiting', eventDateHasPassed = false) {
  if (state === 'active') return '受付中';
  if (state === 'upcoming') return '即将开始';
  if (state === 'waiting') return '等待下轮续报';
  return eventDateHasPassed ? '全部结束' : '当前轮次已结';
}

function sortEntries(entries: MiguriEntry[]) {
  return [...entries].sort((left, right) => (
    left.eventSlug.localeCompare(right.eventSlug)
    || left.date.localeCompare(right.date)
    || left.slot - right.slot
    || left.member.localeCompare(right.member, 'ja')
  ));
}

function uniqueMembers(values: string[]) {
  return Array.from(new Set(values));
}

function intersectMemberLists(lists: string[][]) {
  if (lists.length === 0) return [];
  return uniqueMembers(lists[0]).filter((member) => lists.every((list) => list.includes(member)));
}

function weekdayLabel(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', { weekday: 'short' });
}

function entryStatusLabel(status: MiguriEntryStatus) {
  if (status === 'paid') return '已付款';
  if (status === 'won') return '已中签';
  return '待抽选';
}

function entryStatusTone(status: MiguriEntryStatus) {
  if (status === 'paid') return { backgroundColor: 'rgba(16, 185, 129, 0.14)', color: '#059669' };
  if (status === 'won') return { backgroundColor: 'rgba(59, 130, 246, 0.14)', color: '#2563eb' };
  return { backgroundColor: 'rgba(148, 163, 184, 0.14)', color: '#64748b' };
}

function slotTimeLabel(slot?: MiguriEvent['slots'][number]) {
  if (!slot) return '未开放';
  if (slot.startTime && slot.endTime) return `${slot.startTime} - ${slot.endTime}`;
  return '时间待定';
}

function createPendingDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function MeguriPrototype() {
  const [events, setEvents] = useState<MiguriEvent[]>([]);
  const [entries, setEntries] = useState<MiguriEntry[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<PendingMeguriDraft[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [googleCalendar, setGoogleCalendar] = useState<MiguriGoogleCalendarStatus>({
    connected: false,
    email: null,
    calendarId: null,
    syncEnabled: false,
  });
  const [selectedSlug, setSelectedSlug] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1024));
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [addForm, setAddForm] = useState<AddForm>({
    date: '',
    slots: [],
    member: '',
    tickets: 1,
    status: 'planned',
    search: '',
  });

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setError('');
      const res = await getMiguriEvents();
      if (!mounted) return;

      if (!res.success || !res.data) {
        setError(res.message || res.error || '活动数据加载失败');
        setEvents([]);
        setEntries([]);
        setFavorites([]);
        setGoogleCalendar({ connected: false, email: null, calendarId: null, syncEnabled: false });
        setIsLoading(false);
        return;
      }

      setEvents(res.data.events || []);
      setEntries(res.data.entries || []);
      setFavorites(res.data.favorites || []);
      setGoogleCalendar(res.data.googleCalendar || { connected: false, email: null, calendarId: null, syncEnabled: false });
      setSelectedSlug((current) => current || '');
      setIsLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const sortedEvents = useMemo(() => sortEventsForDisplay(events), [events]);

  const selectedEvent = useMemo(
    () => sortedEvents.find((event) => event.slug === selectedSlug) || sortedEvents[0] || null,
    [sortedEvents, selectedSlug],
  );

  useEffect(() => {
    if (!selectedEvent) return;
    setSelectedSlug((current) => current || selectedEvent.slug);
    setAddForm((current) => ({
      ...current,
      date: selectedEvent.dates.includes(current.date) ? current.date : selectedEvent.dates[0] || '',
      slots: [],
      member: '',
      search: '',
    }));
  }, [selectedEvent]);

  const selectedEntries = useMemo(
    () => (selectedEvent ? entries.filter((entry) => entry.eventSlug === selectedEvent.slug) : []),
    [entries, selectedEvent],
  );

  const summary = useMemo(() => summarizeEntries(selectedEntries), [selectedEntries]);
  const groupedEntries = useMemo(() => groupEntriesByDateAndSlot(selectedEntries), [selectedEntries]);
  const pendingDraftsForEvent = useMemo(
    () => (selectedEvent ? pendingDrafts.filter((draft) => draft.eventSlug === selectedEvent.slug) : []),
    [pendingDrafts, selectedEvent],
  );
  const pendingRecordCount = useMemo(
    () => countPendingDraftRecords(pendingDraftsForEvent),
    [pendingDraftsForEvent],
  );

  const slotMap = useMemo(() => {
    const map = new Map<string, MiguriEvent['slots'][number]>();
    for (const slot of selectedEvent?.slots || []) {
      map.set(`${slot.date}__${slot.slotNumber}`, slot);
    }
    return map;
  }, [selectedEvent]);

  const selectedGroup = selectedEvent?.group || 'hinatazaka';
  const availableDates = selectedEvent?.dates || [];
  const slotNumbers = useMemo(() => {
    const values = Array.from(new Set((selectedEvent?.slots || []).map((slot) => slot.slotNumber))).sort((a, b) => a - b);
    return values.length > 0 ? values : [1, 2, 3, 4, 5, 6];
  }, [selectedEvent]);

  const selectedDateSlotNumbers = useMemo(() => {
    return new Set(
      (selectedEvent?.slots || [])
        .filter((slot) => slot.date === addForm.date)
        .map((slot) => slot.slotNumber),
    );
  }, [addForm.date, selectedEvent]);

  const availableMemberChoices = useMemo(() => {
    const dateSlots = (selectedEvent?.slots || []).filter((slot) => slot.date === addForm.date);
    if (dateSlots.length === 0) return [];

    if (addForm.slots.length === 0) {
      return uniqueMembers(dateSlots.flatMap((slot) => slot.members)).sort((left, right) => left.localeCompare(right, 'ja'));
    }

    const selectedSlots = dateSlots.filter((slot) => addForm.slots.includes(slot.slotNumber));
    return intersectMemberLists(selectedSlots.map((slot) => slot.members)).sort((left, right) => left.localeCompare(right, 'ja'));
  }, [addForm.date, addForm.slots, selectedEvent]);

  const allMembers = useMemo(() => {
    return availableMemberChoices;
  }, [availableMemberChoices]);

  const favoriteMembers = useMemo(() => {
    const availableSet = new Set(allMembers);
    return favorites.filter((member) => availableSet.has(member));
  }, [favorites, allMembers]);

  const filteredMembers = useMemo(() => {
    const keyword = addForm.search.trim();
    return keyword ? allMembers.filter((member) => member.includes(keyword)) : allMembers;
  }, [addForm.search, allMembers]);

  useEffect(() => {
    const allowedMembers = new Set(allMembers);
    setAddForm((current) => {
      if (!current.member || allowedMembers.has(current.member)) return current;
      return {
        ...current,
        member: '',
      };
    });
  }, [allMembers]);

  const isEditing = editingEntryId !== null;
  const canSubmitForm = isEditing
    ? Boolean(addForm.member) && addForm.slots.length === 1 && Boolean(addForm.date)
    : Boolean(addForm.member) && addForm.slots.length > 0 && Boolean(addForm.date);

  const lastEventDate = availableDates[availableDates.length - 1];
  const eventState = selectedEvent ? inferEventState(selectedEvent.windows, lastEventDate) : 'ended';

  function openAddDrawer(date?: string, slotNumber?: number) {
    setEditingEntryId(null);
    setAddForm((current) => ({
      ...current,
      date: date || current.date || availableDates[0] || '',
      slots: typeof slotNumber === 'number' ? [slotNumber] : [],
      member: '',
      tickets: 1,
      search: '',
      status: 'planned',
    }));
    setIsAddOpen(true);
  }

  function openEditDrawer(entry: MiguriEntry) {
    setEditingEntryId(entry.id);
    setAddForm({
      date: entry.date,
      slots: [entry.slot],
      member: entry.member,
      tickets: entry.tickets,
      status: entry.status,
      search: '',
    });
    setIsAddOpen(true);
  }

  function closeDrawer() {
    setIsAddOpen(false);
    setEditingEntryId(null);
  }

  function toggleAddSlot(slot: number) {
    setAddForm((current) => ({
      ...current,
      slots: isEditing
        ? [slot]
        : current.slots.includes(slot)
          ? current.slots.filter((value) => value !== slot)
          : [...current.slots, slot].sort((a, b) => a - b),
    }));
  }

  function toggleAddMember(member: string) {
    setAddForm((current) => ({
      ...current,
      member: current.member === member ? '' : member,
    }));
  }

  function addPendingDraft() {
    if (!selectedEvent || !canSubmitForm || isEditing) return;

    const draft = buildPendingMeguriDraft({
      eventSlug: selectedEvent.slug,
      date: addForm.date,
      slots: addForm.slots,
      member: addForm.member,
      tickets: addForm.tickets,
      status: addForm.status,
    }, createPendingDraftId);

    if (!draft.member || draft.slots.length === 0 || !draft.date) return;

    setPendingDrafts((current) => [...current, draft]);
    setAddForm((current) => ({
      ...current,
      slots: [],
      member: '',
      tickets: 1,
      search: '',
      status: 'planned',
    }));
    setNotice(`已加入待保存：${draft.member}（${draft.slots.length} 部）`);
  }

  function removePendingDraft(draftId: string) {
    setPendingDrafts((current) => current.filter((draft) => draft.id !== draftId));
  }

  async function savePendingDrafts() {
    if (!selectedEvent || pendingDraftsForEvent.length === 0) return;

    setIsSaving(true);
    setError('');
    setNotice('');

    const createdEntries: MiguriEntry[] = [];
    const savedDraftIds: string[] = [];

    for (const draft of pendingDraftsForEvent) {
      const res = await createMiguriEntries({
        eventSlug: draft.eventSlug,
        date: draft.date,
        slots: draft.slots,
        members: [draft.member],
        tickets: draft.tickets,
        status: draft.status,
      });

      if (!res.success || !res.data?.entries) {
        if (createdEntries.length > 0) {
          setEntries((current) => sortEntries([...current, ...createdEntries]));
          setPendingDrafts((current) => current.filter((draft) => !savedDraftIds.includes(draft.id)));
        }
        setIsSaving(false);
        setError(res.message || res.error || '批量保存失败，请检查待保存记录');
        return;
      }

      createdEntries.push(...res.data.entries);
      savedDraftIds.push(draft.id);
    }

    setEntries((current) => sortEntries([...current, ...createdEntries]));
    setPendingDrafts((current) => current.filter((draft) => !savedDraftIds.includes(draft.id)));
    setIsSaving(false);
    closeDrawer();
    setNotice(`已保存 ${createdEntries.length} 条记录`);
  }

  async function saveAddForm() {
    if (!selectedEvent || !canSubmitForm) return;

    setIsSaving(true);
    setError('');
    setNotice('');

    if (isEditing && editingEntryId) {
      const res = await updateMiguriEntry(editingEntryId, {
        member: addForm.member,
        date: addForm.date,
        slot: addForm.slots[0],
        tickets: addForm.tickets,
        status: addForm.status,
      });

      setIsSaving(false);

      if (!res.success || !res.data?.entry) {
        setError(res.message || res.error || '更新失败，可能需要先登录');
        return;
      }

      setEntries((current) => sortEntries(current.map((entry) => (
        entry.id === editingEntryId ? res.data!.entry : entry
      ))));
      closeDrawer();
      setNotice('记录已更新');
      return;
    }

    const res = await createMiguriEntries({
      eventSlug: selectedEvent.slug,
      date: addForm.date,
      slots: addForm.slots,
      members: [addForm.member],
      tickets: addForm.tickets,
      status: addForm.status,
    });

    setIsSaving(false);

    if (!res.success || !res.data?.entries) {
      setError(res.message || res.error || '保存失败，可能需要先登录');
      return;
    }

    setEntries((current) => sortEntries([...current, ...res.data!.entries]));
    setAddForm((current) => ({
      ...current,
      slots: [],
      member: '',
      tickets: 1,
      search: '',
      status: 'planned',
    }));
    closeDrawer();
    setNotice(`已新增 ${res.data.entries.length} 条记录`);
  }

  async function removeEntry(entryId: string) {
    setError('');
    setNotice('');
    const res = await deleteMiguriEntry(entryId);
    if (!res.success) {
      setError(res.message || res.error || '删除失败');
      return;
    }
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    setNotice('记录已删除');
  }

  async function exportCalendar() {
    setError('');
    setNotice('');
    const ok = await openMiguriCalendarIcs();
    if (!ok) {
      setError('导出失败，请稍后重试');
      return;
    }
    setNotice('ICS 已开始下载');
  }

  function connectGoogleCalendar() {
    window.location.href = getGoogleCalendarConnectUrl('/prototypes/miguri');
  }

  if (isLoading) {
    return <div className="mx-auto max-w-[1600px] px-4 py-16 text-center text-sm text-[var(--text-tertiary)]">Miguri 数据加载中…</div>;
  }

  if (!selectedEvent) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">暂无 Miguri 同步数据</h1>
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">先让 Homeserver 跑一次同步，再回来就有东西看了。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="hidden items-center gap-2 lg:flex">
        <Sparkles size={16} className="text-[var(--text-tertiary)]" />
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">咪咕力管理</h1>
      </div>
      {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {/* Mobile FAB overlay */}
      {isSidebarOpen ? <button type="button" aria-label="关闭活动总览" className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px] lg:hidden" onClick={() => setIsSidebarOpen(false)} /> : null}

      <aside
        className={`fixed bottom-5 left-5 z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 shadow-2xl transition-all duration-200 lg:hidden ${
          isSidebarOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">活动总览</h2>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 max-h-[min(70vh,42rem)] space-y-3 overflow-y-auto pr-1">
          {sortedEvents.map((event) => {
            const groupMeta = GROUP_META[event.group];
            const isActive = event.slug === selectedEvent.slug;
            const eventLastDate = event.dates[event.dates.length - 1];
            const state = inferEventState(event.windows, eventLastDate);

            return (
              <button
                key={event.slug}
                type="button"
                onClick={() => {
                  setSelectedSlug(event.slug);
                  setIsSidebarOpen(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left transition-all ${
                  isActive
                    ? 'border-transparent shadow-lg'
                    : 'border-[var(--border-primary)] bg-[var(--bg-primary)] hover:-translate-y-0.5 hover:border-[var(--border-secondary)]'
                }`}
                style={
                  isActive
                    ? {
                        background: `linear-gradient(135deg, ${groupMeta.soft}, rgba(255,255,255,0.92))`,
                        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
                      }
                    : undefined
                }
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white"
                    style={{ backgroundColor: groupMeta.color }}
                  >
                    {groupMeta.label.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: groupMeta.color }}>{groupMeta.label}</span>
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-medium"
                        style={{ backgroundColor: stateTone(state), color: 'var(--text-secondary)' }}
                      >
                        {stateLabel(state, hasEventDatePassed(eventLastDate))}
                      </span>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">{event.title}</h3>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {!isSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] shadow-lg shadow-slate-950/10 lg:hidden"
        >
          <PanelLeft size={16} />
          活动总览
        </button>
      ) : null}

      <section className="flex flex-col items-start gap-6 lg:flex-row lg:gap-8">
        {/* Desktop collapsible sidebar */}
        <div className={`hidden w-full transition-all duration-300 lg:block ${isSidebarOpen ? 'shrink-0 lg:w-[340px] xl:w-[380px]' : 'lg:hidden'}`}>
          <div className="sticky top-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">活动总览</h2>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1 text-xs text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
              >
                <PanelLeftClose size={12} /> 收起
              </button>
            </div>

            <div className="space-y-3">
              {sortedEvents.map((event) => {
                const groupMeta = GROUP_META[event.group];
                const isActive = event.slug === selectedEvent.slug;
                const eventLastDate = event.dates[event.dates.length - 1];
                const state = inferEventState(event.windows, eventLastDate);

                return (
                  <button
                    key={event.slug}
                    type="button"
                    onClick={() => setSelectedSlug(event.slug)}
                    className={`w-full rounded-3xl border p-5 text-left transition-all ${
                      isActive
                        ? 'border-transparent shadow-lg'
                        : 'border-[var(--border-primary)] bg-[var(--bg-primary)] hover:-translate-y-0.5 hover:border-[var(--border-secondary)]'
                    }`}
                    style={
                      isActive
                        ? {
                            background: `linear-gradient(135deg, ${groupMeta.soft}, rgba(255,255,255,0.92))`,
                            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white"
                        style={{ backgroundColor: groupMeta.color }}
                      >
                        {groupMeta.label.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: groupMeta.color }}>{groupMeta.label}</span>
                          <span
                            className="rounded-full px-2.5 py-1 text-[10px] font-medium"
                            style={{ backgroundColor: stateTone(state), color: 'var(--text-secondary)' }}
                          >
                            {stateLabel(state, hasEventDatePassed(eventLastDate))}
                          </span>
                        </div>
                        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">{event.title}</h3>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-w-0 w-full flex-1 space-y-6">
          <div className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-[var(--border-secondary)] pb-8 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <button
                  onClick={() => setIsSidebarOpen((current) => !current)}
                  className="mt-1 hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] lg:flex"
                  title={isSidebarOpen ? '折叠活动列表' : '展开活动列表'}
                >
                  {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h2 className="break-words whitespace-pre-wrap text-base font-black leading-snug text-[var(--text-primary)] sm:text-2xl lg:text-3xl">{selectedEvent.title}</h2>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold sm:px-3 sm:py-1 sm:text-xs"
                      style={{ backgroundColor: GROUP_META[selectedGroup].soft, color: GROUP_META[selectedGroup].color }}
                    >
                      {GROUP_META[selectedGroup].label}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:mt-3 sm:gap-x-4 sm:gap-y-2">
                    <a
                      href={selectedEvent.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] sm:text-xs"
                    >
                      Fortune Music 原页 <ExternalLink size={12} className="sm:h-[14px] sm:w-[14px]" />
                    </a>
                    <div className="hidden h-3 w-[1px] bg-[var(--border-secondary)] sm:block" />
                    {googleCalendar.connected && googleCalendar.syncEnabled ? (
                      <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 sm:gap-1.5 sm:text-xs">
                        <CalendarDays size={12} className="sm:h-[14px] sm:w-[14px]" />
                        <span className="sm:hidden">GCal 已连接</span>
                        <span className="hidden sm:inline">已连接 Google Calendar 自动同步</span>
                        {googleCalendar.email ? <span className="hidden text-[var(--text-tertiary)] sm:inline">({googleCalendar.email})</span> : null}
                      </div>
                    ) : (
                      <button onClick={connectGoogleCalendar} className="flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-700 sm:gap-1.5 sm:text-xs">
                        <CalendarDays size={12} className="sm:h-[14px] sm:w-[14px]" /> 连接 GCal
                      </button>
                    )}
                    <span className="hidden text-[11px] text-[var(--text-tertiary)] sm:inline">
                      同步内容：持有部数 + 受付时间，均写入同一 Google Calendar 主日历
                    </span>
                    <div className="hidden h-3 w-[1px] bg-[var(--border-secondary)] sm:block" />
                    <button onClick={exportCalendar} className="hidden items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 sm:flex">
                      <CalendarDays size={14} /> 导出 .ics
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
              {[
                { label: '部数', fullLabel: '我有多少部', value: summary.totalSlots, icon: Layers3, color: '#7c3aed' },
                { label: '张数', fullLabel: '总张数', value: summary.totalTickets, icon: Ticket, color: '#f59e0b' },
                { label: '成员', fullLabel: '都有谁', value: summary.uniqueMembers, icon: Users, color: '#2563eb' },
                { label: '天数', fullLabel: '日历占几天', value: summary.uniqueDates, icon: CalendarDays, color: '#10b981' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.fullLabel} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-2 sm:p-4">
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] sm:gap-2 sm:text-[11px]">
                      <Icon size={12} className="sm:h-[13px] sm:w-[13px]" style={{ color: item.color }} />
                      <span className="sm:hidden">{item.label}</span>
                      <span className="hidden sm:inline">{item.fullLabel}</span>
                    </div>
                    <div className="mt-1 text-lg font-bold text-[var(--text-primary)] sm:mt-2 sm:text-2xl">{item.value}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-6">
              <div className="space-y-4 lg:hidden">
                {availableDates.map((date) => {
                  const slots = groupedEntries[date] || {};
                  const openSlots = slotNumbers.filter((slotNumber) => slotMap.has(`${date}__${slotNumber}`));

                  return (
                    <div key={date} className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[var(--text-primary)]">{date}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{weekdayLabel(date)}</div>
                        </div>
                        <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)]">
                          {openSlots.length} 部开放
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {slotNumbers.map((slotNumber) => {
                          const slotEntries = slots[slotNumber] || [];
                          const slotInfo = slotMap.get(`${date}__${slotNumber}`);
                          if (!slotInfo) return null;

                          return (
                            <div
                              key={`${date}-${slotNumber}-mobile`}
                              className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-xs font-bold text-[var(--text-primary)]">第{slotNumber}部</span>
                                  <span className="text-[10px] text-[var(--text-tertiary)]">{slotTimeLabel(slotInfo)}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openAddDrawer(date, slotNumber)}
                                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                                >
                                  <Plus size={10} /> 添加
                                </button>
                              </div>

                              {slotEntries.length > 0 ? (
                                <div className="mt-1.5 space-y-1">
                                  {slotEntries.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-1.5">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{entry.member}</span>
                                        <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{entry.tickets}张</span>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-0.5">
                                        <button type="button" title="编辑" onClick={() => openEditDrawer(entry)} className="rounded p-1 text-sky-500">
                                          <Pencil size={11} />
                                        </button>
                                        <button type="button" title="删除" onClick={() => void removeEntry(entry.id)} className="rounded p-1 text-rose-400">
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto -mx-4 sm:mx-0 lg:block">
                <div className="min-w-[800px] p-1">
                  <table className="w-full border-separate border-spacing-2">
                    <thead>
                      <tr>
                        <th className="w-32 py-4 pl-2 text-left text-sm font-bold text-[var(--text-tertiary)]">日期 / 部数</th>
                        {slotNumbers.map((slot) => (
                          <th key={slot} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-4 text-center text-sm font-bold text-[var(--text-secondary)]">
                            第 {slot} 部
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {availableDates.map((date) => {
                        const slots = groupedEntries[date] || {};
                        return (
                          <tr key={date}>
                            <td className="py-4 pr-4 align-top">
                              <div className="text-sm font-bold text-[var(--text-primary)]">{date}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{weekdayLabel(date)}</div>
                            </td>
                            {slotNumbers.map((slotNumber) => {
                              const slotEntries = slots[slotNumber] || [];
                              const slotInfo = slotMap.get(`${date}__${slotNumber}`);

                              return (
                                <td
                                  key={`${date}-${slotNumber}`}
                                  className={`relative h-32 rounded-3xl border p-3 align-top transition-all ${
                                    slotInfo
                                      ? slotEntries.length > 0
                                        ? 'border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-sm'
                                        : 'group border-dashed border-[var(--border-secondary)] bg-[var(--bg-secondary)] hover:border-[var(--border-primary)]'
                                      : 'border border-[var(--border-secondary)] bg-[var(--bg-secondary)] opacity-60'
                                  }`}
                                >
                                  {!slotInfo ? (
                                    <div className="flex h-full items-center justify-center text-[10px] text-[var(--text-tertiary)]">未开放</div>
                                  ) : slotEntries.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                      {slotEntries.map((entry) => {
                                        return (
                                          <div key={entry.id} className="group relative rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-2 transition-all hover:border-[var(--border-primary)]">
                                            <div className="pointer-events-none absolute -top-2 right-1 z-10 flex items-center gap-1 opacity-0 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 focus-within:opacity-100 translate-y-1">
                                              <button
                                                title="编辑记录"
                                                onClick={() => openEditDrawer(entry)}
                                                className="pointer-events-auto rounded-full border border-sky-100 bg-white p-1.5 text-sky-600 shadow-sm hover:bg-sky-50"
                                              >
                                                <Pencil size={12} />
                                              </button>
                                              <button title="删除记录" onClick={() => void removeEntry(entry.id)} className="pointer-events-auto rounded-full border border-rose-100 bg-white p-1.5 text-rose-500 shadow-sm hover:bg-rose-50">
                                                <Trash2 size={12} />
                                              </button>
                                            </div>
                                            <div className="flex min-w-0 items-start justify-between gap-2 text-[10px] text-[var(--text-tertiary)]">
                                              <div className="min-w-0 break-words text-xs font-bold leading-4 text-[var(--text-primary)]">{entry.member}</div>
                                              <span className="shrink-0 rounded-full bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">{entry.tickets} 张</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                      <button
                                        onClick={() => openAddDrawer(date, slotNumber)}
                                        className="mt-1 w-full rounded-lg border border-dashed border-[var(--border-secondary)] py-1 text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]"
                                      >
                                        + 添加
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openAddDrawer(date, slotNumber)}
                                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                                    >
                                      <div className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] p-1.5 shadow-sm">
                                        <Plus size={14} className="text-[var(--text-secondary)]" />
                                      </div>
                                      <span className="text-[10px] text-[var(--text-tertiary)]">添加录入</span>
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="sticky top-8 space-y-6">
                <div className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4.5">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">受付时间轴</h3>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {selectedEvent.windows.length > 0 ? `共 ${selectedEvent.windows.length} 轮，按时间线展示关键轮次` : '暂无已解析轮次'}
                  </p>
                  {selectedEvent.windows.length === 0 ? (
                    <div className="mt-5 py-4 text-center text-sm text-[var(--text-tertiary)]">受付日程未解析到</div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {selectedEvent.windows.map((window, index) => {
                        const state = inferEventState([window], lastEventDate);
                        const isLast = index === selectedEvent.windows.length - 1 && eventState !== 'waiting';
                        const nodeInnerColor = state === 'active' ? '#10b981' : state === 'upcoming' ? '#3b82f6' : '#94a3b8';

                        return (
                          <div key={window.label + window.start} className="relative pl-8 pb-4 last:pb-0">
                            {!isLast && <div className="absolute bottom-[-10px] left-[11px] top-7 w-px bg-[var(--border-primary)]" />}
                            <div
                              className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border"
                              style={{
                                borderColor: state === 'active' ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-primary)',
                                backgroundColor: state === 'active' ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-primary)',
                              }}
                            >
                              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: nodeInnerColor }} />
                            </div>
                            <div className={`rounded-2xl border p-3 transition-all ${state === 'active' ? 'border-emerald-500/50 bg-emerald-500/5 shadow-sm' : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'}`}>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-primary)] text-[var(--text-tertiary)]">
                                    <Clock3 size={13} />
                                  </div>
                                  <div className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] break-all">
                                    {window.label}
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px]" style={{ backgroundColor: stateTone(state), color: 'var(--text-secondary)' }}>
                                  {stateLabel(state)}
                                </span>
                              </div>
                              <div className="mt-3 space-y-2.5">
                                <div className="rounded-xl bg-[var(--bg-primary)] px-3 py-2">
                                  <div className="text-[10px] font-medium text-[var(--text-tertiary)]">开始</div>
                                  <div className="mt-1 break-words text-xs leading-5 text-[var(--text-secondary)]">{window.start}</div>
                                </div>
                                <div className="rounded-xl bg-[var(--bg-primary)] px-3 py-2">
                                  <div className="text-[10px] font-medium text-[var(--text-tertiary)]">截止</div>
                                  <div className="mt-1 break-words text-xs leading-5 text-[var(--text-secondary)]">{window.end}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {isAddOpen && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-50 flex justify-end bg-slate-950/30 backdrop-blur-sm">
          <button type="button" aria-label={isEditing ? '关闭编辑记录' : '关闭添加部数'} className="absolute inset-0 cursor-default" onClick={closeDrawer} />
          <aside className="relative h-full w-full max-w-[520px] overflow-y-auto border-l border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[var(--text-tertiary)]">当前活动</p>
                <h3 className="mt-1 text-xl font-bold text-[var(--text-primary)]">{isEditing ? '编辑记录' : '添加部数'}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{selectedEvent.title}</p>
              </div>
              <button type="button" onClick={closeDrawer} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                <X size={18} />
              </button>
            </div>

            <div className="mt-8 space-y-7">
              <div>
                <label className="text-sm font-semibold text-[var(--text-primary)]">参加日期</label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {availableDates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setAddForm((current) => ({ ...current, date, slots: [] }))}
                      className={`rounded-2xl border px-3 py-2 text-sm font-medium transition-colors ${
                        addForm.date === date
                          ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                          : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {date}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-[var(--text-primary)]">第几部</label>
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {slotNumbers.map((slot) => {
                    const disabled = !selectedDateSlotNumbers.has(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleAddSlot(slot)}
                        className={`rounded-2xl border py-3 text-sm font-bold transition-colors ${
                          addForm.slots.includes(slot)
                            ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                        } ${disabled ? 'cursor-not-allowed opacity-30' : ''}`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-end justify-between gap-3">
                  <label className="text-sm font-semibold text-[var(--text-primary)]">お気に入りメンバー</label>
                  <span className="text-xs text-[var(--text-tertiary)]">仅显示当前活动里可报名的账号真实收藏</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {favoriteMembers.length > 0 ? favoriteMembers.map((member) => {
                    const active = addForm.member === member;
                    return (
                      <button
                        key={member}
                        type="button"
                        onClick={() => toggleAddMember(member)}
                        className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                          active
                            ? 'border-transparent text-white'
                            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                        }`}
                        style={active ? { backgroundColor: GROUP_META[selectedGroup].color } : undefined}
                      >
                        {member}
                      </button>
                    );
                  }) : <div className="text-sm text-[var(--text-tertiary)]">当前筛选条件下没有可用的收藏成员。</div>}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-[var(--text-primary)]">全成员搜索</label>
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3">
                  <Search size={16} className="text-[var(--text-tertiary)]" />
                  <input
                    value={addForm.search}
                    onChange={(event) => setAddForm((current) => ({ ...current, search: event.target.value }))}
                    placeholder="输入成员名"
                    className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">每次先为 1 位成员配置部数和张数，点“添加到待保存”后再继续添加其他成员。</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(addForm.search.trim() ? filteredMembers : allMembers.slice(0, 10)).map((member) => {
                    const active = addForm.member === member;
                    return (
                      <button
                        key={member}
                        type="button"
                        onClick={() => toggleAddMember(member)}
                        className={`rounded-2xl border px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white'
                            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {member}
                      </button>
                    );
                  })}
                  {(addForm.search.trim() ? filteredMembers : allMembers.slice(0, 10)).length === 0 && (
                    <div className="col-span-2 rounded-2xl border border-dashed border-[var(--border-primary)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                      当前日期 / 部数组合下没有可选成员。
                    </div>
                  )}
                </div>
              </div>

              {!isEditing && (
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <label className="text-sm font-semibold text-[var(--text-primary)]">待保存列表</label>
                    <span className="text-xs text-[var(--text-tertiary)]">共 {pendingRecordCount} 条记录</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {pendingDraftsForEvent.length > 0 ? pendingDraftsForEvent.map((draft) => (
                      <div key={draft.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[var(--text-primary)]">{draft.member}</div>
                          <div className="mt-1 text-xs text-[var(--text-tertiary)]">{draft.date} · 第 {draft.slots.join(', ')} 部 · 每部 {draft.tickets} 张</div>
                        </div>
                        <button type="button" onClick={() => removePendingDraft(draft.id)} className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--bg-primary)] hover:text-rose-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-[var(--border-primary)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                        先把每位成员分别添加到待保存列表，再统一保存。
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-[var(--text-primary)]">张数</label>
                <div className="mt-3 flex items-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-1">
                  <button type="button" onClick={() => setAddForm((current) => ({ ...current, tickets: Math.max(1, current.tickets - 1) }))} className="h-10 flex-1 rounded-xl text-lg font-bold text-[var(--text-secondary)]">-</button>
                  <div className="w-12 text-center text-lg font-bold text-[var(--text-primary)]">{addForm.tickets}</div>
                  <button type="button" onClick={() => setAddForm((current) => ({ ...current, tickets: current.tickets + 1 }))} className="h-10 flex-1 rounded-xl text-lg font-bold text-[var(--text-secondary)]">+</button>
                </div>
              </div>

              {Boolean(addForm.member) && (
                <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                  <p className="text-xs font-medium text-[var(--text-tertiary)]">{isEditing ? '将更新为' : '将添加'}</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {isEditing
                      ? `${addForm.date} · ${addForm.slots[0] ? `第 ${addForm.slots[0]} 部` : '未选择部数'} · ${addForm.member || '未选择成员'} · ${addForm.tickets} 张`
                      : `${addForm.date} · ${addForm.slots.length > 0 ? `第 ${addForm.slots.join(', ')} 部` : '未选择部数'} · ${addForm.member || '未选择成员'} · 每部 ${addForm.tickets} 张`}
                  </p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 -mx-6 mt-8 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] p-6">
              {isEditing ? (
                <button
                  type="button"
                  onClick={() => void saveAddForm()}
                  disabled={isSaving || !canSubmitForm}
                  className="w-full rounded-2xl bg-[var(--text-primary)] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSaving ? '保存中…' : '保存修改'}
                </button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={addPendingDraft}
                    disabled={isSaving || !canSubmitForm}
                    className="w-full rounded-2xl border border-[var(--text-primary)] bg-[var(--bg-primary)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    添加到待保存
                  </button>
                  <button
                    type="button"
                    onClick={() => void savePendingDrafts()}
                    disabled={isSaving || pendingDraftsForEvent.length === 0}
                    className="w-full rounded-2xl bg-[var(--text-primary)] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSaving ? '保存中…' : `保存${pendingRecordCount > 0 ? ` (${pendingRecordCount} 条记录)` : ''}`}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
