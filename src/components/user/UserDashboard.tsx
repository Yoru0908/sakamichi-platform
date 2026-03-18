import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
  User, Star, Heart, Trash2, Edit3, Check, X, Shield,
  Mail, Calendar, Clock, Link2, Search,
} from 'lucide-react';
import { $auth, initAuth, setAuth } from '@/stores/auth';
import { $favorites, removeFavorite, addFavorite, toggleFavorite } from '@/stores/favorites';
import {
  getProfile, updateProfile,
  type UserProfile, type OAuthLink,
} from '@/utils/auth-api';
import { getGroupColor, getR2AvatarUrl, GROUP_CONFIG, sortedGenEntries, type MemberInfo } from '@/components/messages/msg-styles';

// ── Role badge ──
const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:      { label: '管理员', color: '#dc2626' },
  translator: { label: '翻译者', color: '#7c3aed' },
  verified:   { label: '已认证', color: '#059669' },
  member:     { label: '会员',   color: '#2563eb' },
  guest:      { label: '游客',   color: '#6b7280' },
};

function RoleBadge({ role }: { role: string }) {
  const r = ROLE_LABELS[role] || ROLE_LABELS.guest;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
      style={{ backgroundColor: r.color }}
    >
      <Shield size={10} />
      {r.label}
    </span>
  );
}

// ── Provider icon ──
function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'discord') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
      </svg>
    );
  }
  if (provider === 'google') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    );
  }
  return <Link2 size={16} />;
}

// ── Profile Tab ──
function ProfileTab({ profile }: { profile: UserProfile }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.user.displayName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    const res = await updateProfile({ displayName: name });
    if (res.success) {
      setAuth({ displayName: name });
      setMessage('已保存');
      setEditing(false);
      setTimeout(() => setMessage(''), 2000);
    } else {
      setMessage(res.message || res.error || '保存失败');
    }
    setSaving(false);
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Avatar + basic info */}
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-[var(--bg-tertiary)] flex-shrink-0">
          {profile.user.avatarUrl ? (
            <img src={profile.user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User size={24} className="text-[var(--text-tertiary)]" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-2 py-1 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30"
                  maxLength={30}
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => { setEditing(false); setName(profile.user.displayName || ''); }}
                  className="p-1 rounded text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">
                  {profile.user.displayName || profile.user.email.split('@')[0]}
                </h3>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                  title="编辑昵称"
                >
                  <Edit3 size={14} />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <RoleBadge role={profile.user.role} />
            {message && (
              <span className="text-xs text-green-600">{message}</span>
            )}
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          <Mail size={16} className="text-[var(--text-tertiary)] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--text-tertiary)]">邮箱</p>
            <p className="text-sm text-[var(--text-primary)] truncate">{profile.user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          <Star size={16} className="text-amber-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--text-tertiary)]">推しメン</p>
            <p className="text-sm text-[var(--text-primary)] truncate">
              {profile.user.oshiMember || '未设置'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          <Calendar size={16} className="text-[var(--text-tertiary)] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--text-tertiary)]">注册时间</p>
            <p className="text-sm text-[var(--text-primary)]">{fmt(profile.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          <Clock size={16} className="text-[var(--text-tertiary)] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--text-tertiary)]">上次登录</p>
            <p className="text-sm text-[var(--text-primary)]">{fmt(profile.lastLoginAt)}</p>
          </div>
        </div>
      </div>

      {/* OAuth links */}
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">关联账号</h4>
        {profile.oauthLinks.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">暂无关联的第三方账号</p>
        ) : (
          <div className="space-y-2">
            {profile.oauthLinks.map((link) => (
              <div
                key={link.provider}
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
              >
                <ProviderIcon provider={link.provider} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] capitalize">{link.provider}</p>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">{link.email}</p>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {fmt(link.linkedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Favorites Tab ──
function FavoritesTab() {
  const favorites = useStore($favorites);
  const auth = useStore($auth);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('乃木坂46');
  const groups = ['乃木坂46', '櫻坂46', '日向坂46'];

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
      .catch(console.error);
  }, []);

  const filtered = members
    .filter((m) => {
      if (activeGroup === '櫻坂46') return m.group === '櫻坂46' || m.group === '樱坂46';
      return m.group === activeGroup;
    })
    .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()))
    .filter((m) => !favorites.some((f) => f.name === m.name));

  const byGen: Record<string, MemberInfo[]> = {};
  filtered.forEach((m) => {
    const gen = m.generation || '不明';
    if (!byGen[gen]) byGen[gen] = [];
    byGen[gen].push(m);
  });

  // Computed: oshi member from favorites
  const oshiFav = auth.oshiMember
    ? favorites.find((f) => f.name === auth.oshiMember) || null
    : null;

  // Computed: group favorites (excluding oshi) by group
  const favByGroup: Record<string, typeof favorites> = {};
  favorites.forEach((f) => {
    if (oshiFav && f.name === oshiFav.name) return; // skip oshi, shown separately
    const g = f.group || '其他';
    if (!favByGroup[g]) favByGroup[g] = [];
    favByGroup[g].push(f);
  });
  const favGroups = Object.entries(favByGroup);

  return (
    <div className="space-y-4">
      {/* Current favorites */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          我的收藏 ({favorites.length})
        </h4>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer"
          style={{
            backgroundColor: showAdd ? 'var(--bg-tertiary)' : 'var(--color-brand-nogi)',
            color: showAdd ? 'var(--text-primary)' : 'white',
          }}
        >
          {showAdd ? '完成' : '+ 添加成员'}
        </button>
      </div>

      {favorites.length === 0 && !showAdd ? (
        <div className="text-center py-8">
          <Heart size={32} className="mx-auto text-[var(--text-tertiary)] mb-2" />
          <p className="text-sm text-[var(--text-tertiary)]">还没有收藏的成员</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-3 text-xs px-3 py-1.5 rounded-lg font-medium text-white cursor-pointer"
            style={{ backgroundColor: 'var(--color-brand-nogi)' }}
          >
            添加收藏
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Oshi hero card */}
          {oshiFav && (
            <div className="relative group rounded-xl overflow-hidden border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/10">
              <div className="flex items-center gap-4 p-4">
                <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-amber-400 ring-offset-2 ring-offset-[var(--bg-primary)]">
                  <img
                    src={getR2AvatarUrl(oshiFav.name)}
                    alt={oshiFav.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = oshiFav.imageUrl; }
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Star size={14} fill="#f59e0b" className="text-amber-500" />
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">推しメン</span>
                  </div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{oshiFav.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)]" style={{ color: getGroupColor(oshiFav.group) }}>
                    {oshiFav.group}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFavorite(oshiFav.name)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="移除收藏"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {/* Group by group */}
          {favGroups.map(([group, groupFavs]) => {
            const color = getGroupColor(group);
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
                  <h5 className="text-xs font-semibold" style={{ color }}>
                    {GROUP_CONFIG[group]?.name || group} ({groupFavs.length})
                  </h5>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {groupFavs.map((fav) => (
                    <div
                      key={fav.name}
                      className="relative group/card rounded-lg overflow-hidden border transition-all"
                      style={{ borderColor: color + '40' }}
                    >
                      <div className="aspect-square w-full overflow-hidden">
                        <img
                          src={getR2AvatarUrl(fav.name)}
                          alt={fav.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = fav.imageUrl; }
                          }}
                          loading="lazy"
                        />
                      </div>
                      <p className="text-[10px] text-[var(--text-primary)] truncate px-1 py-1 text-center">{fav.name}</p>
                      <button
                        onClick={() => removeFavorite(fav.name)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover/card:opacity-100 transition-opacity cursor-pointer"
                        title="移除收藏"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add member panel */}
      {showAdd && (
        <div className="border border-[var(--border-primary)] rounded-lg p-4 bg-[var(--bg-secondary)]">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30"
              placeholder="搜索成员..."
            />
          </div>

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

          <div className="max-h-[35vh] overflow-y-auto pr-1">
            {sortedGenEntries(byGen).map(([gen, mems]) => (
              <div key={gen} className="mb-3">
                <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">{gen}</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {mems.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => addFavorite({ name: m.name, group: m.group, imageUrl: m.imageUrl })}
                      className="rounded-lg overflow-hidden border-2 border-transparent hover:border-[var(--border-secondary)] transition-all cursor-pointer"
                    >
                      <div className="aspect-square w-full overflow-hidden">
                        <img
                          src={getR2AvatarUrl(m.name)}
                          alt={m.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = m.imageUrl; }
                          }}
                          loading="lazy"
                        />
                      </div>
                      <p className="text-[10px] text-[var(--text-primary)] truncate px-1 py-1 text-center">{m.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(byGen).length === 0 && (
              <p className="text-xs text-[var(--text-tertiary)] text-center py-4">没有更多可添加的成员</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ──
type Tab = 'profile' | 'favorites';

export default function UserDashboard() {
  const auth = useStore($auth);
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (!auth.isLoggedIn && !auth.loading) {
      window.location.href = '/auth/login';
      return;
    }
    if (auth.isLoggedIn) {
      getProfile().then((res) => {
        if (res.success && res.data) {
          setProfile(res.data);
        }
        setLoading(false);
      });
    }
  }, [auth.isLoggedIn, auth.loading]);

  if (auth.loading || loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--color-brand-nogi) transparent var(--color-brand-nogi) var(--color-brand-nogi)' }} />
        <p className="text-sm text-[var(--text-tertiary)]">加载中...</p>
      </div>
    );
  }

  if (!auth.isLoggedIn) return null;

  const tabs: { key: Tab; label: string; icon: typeof User }[] = [
    { key: 'profile', label: '个人资料', icon: User },
    { key: 'favorites', label: '收藏管理', icon: Heart },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-primary)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                isActive
                  ? 'border-[var(--color-brand-nogi)] text-[var(--color-brand-nogi)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'profile' && profile && <ProfileTab profile={profile} />}
      {tab === 'favorites' && <FavoritesTab />}
    </div>
  );
}
