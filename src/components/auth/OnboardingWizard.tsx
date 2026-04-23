import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { Star, Search, ChevronRight, Sparkles } from 'lucide-react';
import { $auth, setAuth } from '@/stores/auth';
import { addFavorite } from '@/stores/favorites';
import { updatePreferences } from '@/utils/auth-api';
import {
  getGroupColor, getOptimizedAvatarUrl, GROUP_CONFIG, sortedGenEntries,
  type MemberInfo,
} from '@/components/messages/msg-styles';

// ── Step 1: Select Oshi ──
function OshiStep({
  members,
  selected,
  onSelect,
}: {
  members: MemberInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('乃木坂46');
  const groups = ['乃木坂46', '櫻坂46', '日向坂46'];

  const filtered = members
    .filter((m) => {
      if (activeGroup === '櫻坂46') return m.group === '櫻坂46' || m.group === '樱坂46';
      return m.group === activeGroup;
    })
    .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()));

  const byGen: Record<string, MemberInfo[]> = {};
  filtered.forEach((m) => {
    const gen = m.generation || '不明';
    if (!byGen[gen]) byGen[gen] = [];
    byGen[gen].push(m);
  });

  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">推しメン</h3>
      <p className="text-xs text-[var(--text-tertiary)] mb-4">选择你最喜欢的成员（可选，仅一位）</p>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30 transition-all"
          placeholder="搜索成员..."
        />
      </div>

      {/* Group tabs */}
      <div className="flex gap-1 mb-3 border-b border-[var(--border-primary)]">
        {groups.map((g) => {
          const color = getGroupColor(g);
          const isActive = g === activeGroup;
          return (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className="px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer"
              style={{ borderColor: isActive ? color : 'transparent', color: isActive ? color : 'var(--text-tertiary)' }}
            >
              {GROUP_CONFIG[g]?.name || g}
            </button>
          );
        })}
      </div>

      {/* Member grid */}
      <div className="max-h-[40vh] overflow-y-auto pr-1">
        {sortedGenEntries(byGen).map(([gen, mems]) => (
          <div key={gen} className="mb-3">
            <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">{gen}</p>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {mems.map((m) => {
                const isSelected = selected === m.name;
                return (
                  <button
                    key={m.name}
                    onClick={() => onSelect(isSelected ? '' : m.name)}
                    className={`rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 shadow-md scale-[1.02]'
                        : 'border-transparent hover:border-[var(--border-secondary)]'
                    }`}
                  >
                    <div className="aspect-square w-full overflow-hidden relative">
                      <img
                        src={getOptimizedAvatarUrl(m.name, 400)}
                        loading="lazy"
                        alt={m.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = m.imageUrl; }
                        }}
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-amber-400/20 flex items-center justify-center">
                          <Star size={20} fill="currentColor" className="text-amber-400 drop-shadow" />
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-primary)] truncate px-1 py-1 text-center">{m.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Select Followed Members ──
function FollowStep({
  members,
  selected,
  onToggle,
}: {
  members: MemberInfo[];
  selected: Set<string>;
  onToggle: (name: string) => void;
}) {
  const [activeGroup, setActiveGroup] = useState('乃木坂46');
  const groups = ['乃木坂46', '櫻坂46', '日向坂46'];

  const filtered = members.filter((m) => {
    if (activeGroup === '櫻坂46') return m.group === '櫻坂46' || m.group === '樱坂46';
    return m.group === activeGroup;
  });

  const byGen: Record<string, MemberInfo[]> = {};
  filtered.forEach((m) => {
    const gen = m.generation || '不明';
    if (!byGen[gen]) byGen[gen] = [];
    byGen[gen].push(m);
  });

  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">気になるメンバー</h3>
      <p className="text-xs text-[var(--text-tertiary)] mb-4">选择你关注的成员（可多选，可跳过）</p>

      {/* Group tabs */}
      <div className="flex gap-1 mb-3 border-b border-[var(--border-primary)]">
        {groups.map((g) => {
          const color = getGroupColor(g);
          const isActive = g === activeGroup;
          return (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className="px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer"
              style={{ borderColor: isActive ? color : 'transparent', color: isActive ? color : 'var(--text-tertiary)' }}
            >
              {GROUP_CONFIG[g]?.name || g}
            </button>
          );
        })}
        {selected.size > 0 && (
          <span className="ml-auto text-[10px] text-[var(--text-tertiary)] self-center">
            已选 {selected.size} 人
          </span>
        )}
      </div>

      {/* Member grid */}
      <div className="max-h-[40vh] overflow-y-auto pr-1">
        {sortedGenEntries(byGen).map(([gen, mems]) => (
          <div key={gen} className="mb-3">
            <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">{gen}</p>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {mems.map((m) => {
                const isSelected = selected.has(m.name);
                const color = getGroupColor(m.group);
                return (
                  <button
                    key={m.name}
                    onClick={() => onToggle(m.name)}
                    className={`rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'shadow-md scale-[1.02]'
                        : 'border-transparent hover:border-[var(--border-secondary)]'
                    }`}
                    style={{ borderColor: isSelected ? color : undefined }}
                  >
                    <div className="aspect-square w-full overflow-hidden relative">
                      <img
                        src={getOptimizedAvatarUrl(m.name, 400)}
                        loading="lazy"
                        alt={m.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = m.imageUrl; }
                        }}
                      />
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-primary)] truncate px-1 py-1 text-center">{m.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Wizard ──
export default function OnboardingWizard() {
  const auth = useStore($auth);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0); // 0 = oshi, 1 = follow
  const [oshi, setOshi] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/data/member-images.json')
      .then((r) => r.json())
      .then((data) => {
        const images = data.images || {};
        const allNames = new Set(Object.keys(images));
        const list: MemberInfo[] = Object.entries(images)
          .filter(([name]) => {
            if (!name.includes(' ')) {
              for (const other of allNames) {
                if (other !== name && other.includes(' ') && other.replace(/\s+/g, '') === name) return false;
              }
            }
            return true;
          })
          .map(([name, info]: [string, any]) => ({
            name,
            imageUrl: info.imageUrl || info.url,
            group: info.group,
            generation: info.generation,
          }));
        setMembers(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleFollow = useCallback((name: string) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleComplete = useCallback(async () => {
    setSaving(true);

    // Save preferences to server
    await updatePreferences({
      oshiMember: oshi,
      followedMembers: Array.from(followed),
    });

    // Sync to local favorites store immediately
    const allSelected = new Set(followed);
    if (oshi) allSelected.add(oshi);
    for (const name of allSelected) {
      const m = members.find((mm) => mm.name === name);
      if (m) addFavorite({ name: m.name, group: m.group, imageUrl: m.imageUrl });
    }

    // Update auth store locally (zero-delay)
    setAuth({
      isFirstLogin: false,
      oshiMember: oshi,
    });

    setSaving(false);
    window.location.href = '/';
  }, [oshi, followed, members]);

  const handleSkip = useCallback(async () => {
    setAuth({ isFirstLogin: false });
    await updatePreferences({ oshiMember: null, followedMembers: [] });
    window.location.href = '/';
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--color-brand-nogi) transparent var(--color-brand-nogi) var(--color-brand-nogi)' }} />
        <p className="text-sm text-[var(--text-tertiary)]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 sm:p-8">
        {/* Welcome header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
            <Sparkles size={18} className="text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            欢迎来到 Sakamichi Tools!
          </h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {auth.displayName ? `${auth.displayName}，` : ''}告诉我们你喜欢谁，我们会为你个性化推荐
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[0, 1].map((s) => (
            <div
              key={s}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: step === s ? '2rem' : '0.5rem',
                backgroundColor: step >= s ? 'var(--color-brand-nogi)' : 'var(--bg-tertiary)',
              }}
            />
          ))}
        </div>

        {/* Steps */}
        {step === 0 && (
          <OshiStep
            members={members}
            selected={oshi}
            onSelect={(name) => setOshi(name || null)}
          />
        )}
        {step === 1 && (
          <FollowStep
            members={members}
            selected={followed}
            onToggle={toggleFollow}
          />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border-primary)]">
          {step === 0 ? (
            <button
              onClick={handleSkip}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            >
              跳过
            </button>
          ) : (
            <button
              onClick={() => setStep(0)}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            >
              上一步
            </button>
          )}

          {step === 0 ? (
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--color-brand-nogi)' }}
            >
              下一步 <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={saving}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-all cursor-pointer disabled:opacity-70"
              style={{ backgroundColor: 'var(--color-brand-nogi)' }}
            >
              {saving ? '保存中...' : '完成设置'}
            </button>
          )}
        </div>

        {/* Hint */}
        <p className="text-[10px] text-[var(--text-tertiary)] text-center mt-3">
          推しメン和気になるメンバー会自动加入你的收藏夹
        </p>
      </div>
    </div>
  );
}
