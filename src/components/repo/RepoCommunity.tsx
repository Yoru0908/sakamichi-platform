import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { GroupId, AtmosphereTag } from '@/types/repo';
import { GROUP_META, ATMOSPHERE_TAGS } from '@/types/repo';
import { MOCK_REPOS, MOCK_MEMBERS } from '@/utils/repo-mock-data';
import RepoCard from './RepoCard';

type SortMode = 'latest' | 'popular';

export default function RepoCommunity() {
  const [groupFilter, setGroupFilter] = useState<GroupId | 'all'>('all');
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<AtmosphereTag | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filteredMembers = useMemo(() => {
    if (groupFilter === 'all') return MOCK_MEMBERS;
    return MOCK_MEMBERS.filter(m => m.group === groupFilter);
  }, [groupFilter]);

  const filteredRepos = useMemo(() => {
    let repos = [...MOCK_REPOS];

    if (groupFilter !== 'all') repos = repos.filter(r => r.groupId === groupFilter);
    if (memberFilter) repos = repos.filter(r => r.memberId === memberFilter);
    if (tagFilter) repos = repos.filter(r => r.tags.includes(tagFilter));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      repos = repos.filter(r =>
        r.memberName.toLowerCase().includes(q) ||
        r.nickname.toLowerCase().includes(q) ||
        r.messages.some(m => m.text.toLowerCase().includes(q))
      );
    }

    if (sortMode === 'latest') {
      repos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      repos.sort((a, b) => {
        const totalA = a.reactions.lemon + a.reactions.sweet + a.reactions.funny + a.reactions.pray;
        const totalB = b.reactions.lemon + b.reactions.sweet + b.reactions.funny + b.reactions.pray;
        return totalB - totalA;
      });
    }

    return repos;
  }, [groupFilter, memberFilter, tagFilter, sortMode, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Search + Filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="メンバー名、キーワードで検索..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-gray-200 transition-shadow"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`shrink-0 p-2.5 rounded-xl border transition-colors ${
            showFilters ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          {/* Group tabs */}
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">グループ</div>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'nogizaka', 'sakurazaka', 'hinatazaka'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setGroupFilter(g); setMemberFilter(null); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    groupFilter === g
                      ? g === 'all' ? 'bg-gray-800 text-white' : 'text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  style={groupFilter === g && g !== 'all' ? { backgroundColor: GROUP_META[g].color } : undefined}
                >
                  {g === 'all' ? '全部' : GROUP_META[g].name}
                </button>
              ))}
            </div>
          </div>

          {/* Member filter */}
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">メンバー</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setMemberFilter(null)}
                className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                  !memberFilter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                全員
              </button>
              {filteredMembers.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMemberFilter(m.id)}
                  className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                    memberFilter === m.id ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  style={memberFilter === m.id ? { backgroundColor: GROUP_META[m.group].color } : undefined}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tag filter */}
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">タグ</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                  !tagFilter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                全部
              </button>
              {ATMOSPHERE_TAGS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
                  className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                    tagFilter === t.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div>
            <div className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">並び替え</div>
            <div className="flex gap-1.5">
              {([['latest', '最新'], ['popular', '人気']] as [SortMode, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSortMode(id)}
                  className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                    sortMode === id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results count */}
      <div className="text-xs text-gray-400">
        {filteredRepos.length} 件のレポ
      </div>

      {/* Repo grid */}
      {filteredRepos.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📝</div>
          <div className="text-sm text-gray-500">レポが見つかりません</div>
          <div className="text-xs text-gray-400 mt-1">フィルターを変更してみてください</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRepos.map(repo => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}
    </div>
  );
}
