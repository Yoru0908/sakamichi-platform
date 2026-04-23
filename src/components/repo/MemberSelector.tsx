import { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import type { Member, GroupId } from '@/types/repo';
import { GROUP_META } from '@/types/repo';
import { MOCK_MEMBERS } from '@/utils/repo-mock-data';

interface Props {
  selectedMemberId: string | null;
  onSelect: (member: Member) => void;
}

function MemberAvatar({ src, name, color, size = 36 }: { src: string; name: string; color: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="rounded-sm shrink-0 flex items-center justify-center text-white font-bold"
        style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.35 }}
      >
        {name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className="rounded-sm object-cover object-top bg-gray-100"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

export default function MemberSelector({ selectedMemberId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupId | 'all'>('all');

  const selected = useMemo(
    () => MOCK_MEMBERS.find(m => m.id === selectedMemberId),
    [selectedMemberId],
  );

  const filtered = useMemo(() => {
    let list = MOCK_MEMBERS;
    if (groupFilter !== 'all') list = list.filter(m => m.group === groupFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.id.includes(q));
    }
    return list;
  }, [groupFilter, search]);

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">メンバー</label>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors text-left"
      >
        {selected ? (
          <>
            <MemberAvatar src={selected.imageUrl} name={selected.name} color={GROUP_META[selected.group].color} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{selected.name}</div>
              <div className="text-[11px] text-gray-400">{selected.groupName}</div>
            </div>
          </>
        ) : (
          <span className="text-sm text-gray-400 flex-1">メンバーを選択...</span>
        )}
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="名前で検索..."
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 border-none outline-none focus:ring-1 focus:ring-gray-200"
                autoFocus
              />
            </div>
          </div>

          {/* Group tabs */}
          <div className="flex gap-1 px-2 py-1.5 border-b border-gray-100">
            {(['all', 'nogizaka', 'sakurazaka', 'hinatazaka'] as const).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupFilter(g)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                  groupFilter === g
                    ? g === 'all'
                      ? 'bg-gray-800 text-white'
                      : `text-white`
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                style={
                  groupFilter === g && g !== 'all'
                    ? { backgroundColor: GROUP_META[g].color }
                    : undefined
                }
              >
                {g === 'all' ? '全部' : GROUP_META[g].name}
              </button>
            ))}
          </div>

          {/* Member list */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">該当なし</div>
            ) : (
              filtered.map(member => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => { onSelect(member); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors ${
                    member.id === selectedMemberId ? 'bg-gray-50' : ''
                  }`}
                >
                  <MemberAvatar src={member.imageUrl} name={member.name} color={GROUP_META[member.group].color} size={32} />
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium truncate">{member.name}</div>
                  </div>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: GROUP_META[member.group].color }}
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
