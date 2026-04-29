import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
  User, Star, Heart, Trash2, Edit3, Check, X, Shield,
  Mail, Calendar, Clock, Link2, Search, PenLine, FileImage, Image,
  CreditCard, BadgeCheck, ExternalLink, Plus, AlertCircle, CheckCircle, Loader2,
} from 'lucide-react';
import { $auth, initAuth, setAuth } from '@/stores/auth';
import {
  $favorites, addFavorite, removeFavorite, replaceFavorites, toggleFavorite,
} from '@/stores/favorites';
import {
  getProfile, updateProfile, updatePreferences, changePassword,
  addPaymentLink, removePaymentLink, requestVerification, deleteRepoWork, getMyRepoWorks,
  type UserProfile, type OAuthLink, type SubscriptionInfo, type PaymentLinkInfo, type RepoWorkItem,
} from '@/utils/auth-api';
import { getGroupColor, getR2AvatarUrl, getOptimizedAvatarUrl, GROUP_CONFIG, sortedGenEntries, type MemberInfo } from '@/components/messages/msg-styles';

// ── Role badge ──
const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:      { label: '管理员', color: '#dc2626' },
  translator: { label: '翻译者', color: '#7c3aed' },
  verified:   { label: '已认证', color: '#059669' },
  member:     { label: 'Free',   color: '#2563eb' },
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
  const auth = useStore($auth);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.user.displayName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingOshi, setEditingOshi] = useState(false);
  const [oshiSearch, setOshiSearch] = useState('');
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [oshiSaving, setOshiSaving] = useState(false);

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
        <button
          type="button"
          onClick={() => {
            setEditingOshi(!editingOshi);
            if (!editingOshi && members.length === 0) {
              fetch('/data/member-images.json')
                .then(r => r.json())
                .then(data => {
                  const images = data.images || {};
                  const allNames = new Set(Object.keys(images));
                  const list: MemberInfo[] = Object.entries(images)
                    .filter(([n]) => {
                      if (!n.includes(' ')) {
                        for (const other of allNames) {
                          if (other !== n && other.includes(' ') && other.replace(/\s+/g, '') === n) return false;
                        }
                      }
                      return true;
                    })
                    .map(([n, info]: [string, any]) => ({ name: n, imageUrl: info.imageUrl || info.url, group: info.group, generation: info.generation }));
                  setMembers(list);
                })
                .catch(console.error);
            }
          }}
          className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-amber-400 transition-colors cursor-pointer w-full text-left"
        >
          <Star size={16} className="text-amber-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-[var(--text-tertiary)]">推しメン</p>
            <p className="text-sm text-[var(--text-primary)] truncate">
              {auth.oshiMember || '未设置'}
            </p>
          </div>
          <Edit3 size={12} className="text-[var(--text-tertiary)] flex-shrink-0" />
        </button>
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

      {/* Oshi change panel */}
      {editingOshi && (
        <div className="border border-amber-300 rounded-lg p-4 bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">推しメン変更</h4>
            <button onClick={() => setEditingOshi(false)} className="p-1 rounded text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] cursor-pointer">
              <X size={14} />
            </button>
          </div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={oshiSearch}
              onChange={(e) => setOshiSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              placeholder="搜索成员..."
            />
          </div>
          <div className="max-h-[30vh] overflow-y-auto">
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {members
                .filter(m => !oshiSearch || m.name.toLowerCase().includes(oshiSearch.toLowerCase()))
                .slice(0, 30)
                .map(m => {
                  const isCurrentOshi = auth.oshiMember === m.name;
                  return (
                    <button
                      key={m.name}
                      disabled={oshiSaving}
                      onClick={async () => {
                        setOshiSaving(true);
                        await updatePreferences({ oshiMember: m.name });
                        const currentFavorites = $favorites.get();
                        setAuth({ oshiMember: m.name });
                        replaceFavorites([
                          { name: m.name, group: m.group, imageUrl: m.imageUrl },
                          ...currentFavorites
                            .filter((favorite) => favorite.name !== m.name)
                            .map((favorite) => ({
                              name: favorite.name,
                              group: favorite.group,
                              imageUrl: favorite.imageUrl,
                            })),
                        ]);
                        setOshiSaving(false);
                        setEditingOshi(false);
                      }}
                      className={`rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                        isCurrentOshi ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-transparent hover:border-[var(--border-secondary)]'
                      }`}
                    >
                      <div className="aspect-square w-full overflow-hidden">
                        <img
                          src={getOptimizedAvatarUrl(m.name, 400)}
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
                  );
                })}
            </div>
            {members.length === 0 && (
              <p className="text-xs text-[var(--text-tertiary)] text-center py-4">加载中...</p>
            )}
          </div>
        </div>
      )}

      {/* Subscription & Verification status */}
      <SubscriptionCard
        subscription={profile.subscription}
        paymentStatus={profile.user.paymentStatus}
        verificationStatus={profile.user.verificationStatus}
      />

      {/* Payment links management */}
      <PaymentLinksSection initialLinks={profile.paymentLinks} />

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

      {/* Password change */}
      <PasswordChangeSection />
    </div>
  );
}

// ── Subscription & Verification Card ──
const PLAN_LABELS: Record<string, string> = {
  all_groups: '全坂道',
  single_nogizaka: '乃木坂46',
  single_sakurazaka: '櫻坂46',
  single_hinatazaka: '日向坂46',
  lifetime: '终身会员',
};

const VERIFICATION_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  none: { label: '未认证', color: '#6b7280', icon: AlertCircle },
  pending: { label: '认证审核中', color: '#d97706', icon: Loader2 },
  approved: { label: '已认证', color: '#059669', icon: CheckCircle },
  rejected: { label: '认证未通过', color: '#dc2626', icon: AlertCircle },
};

function SubscriptionCard({ subscription, paymentStatus, verificationStatus }: {
  subscription: SubscriptionInfo | null;
  paymentStatus: string | null;
  verificationStatus: string;
}) {
  const isActive = paymentStatus === 'active';
  const isExpired = paymentStatus === 'expired';
  const vInfo = VERIFICATION_LABELS[verificationStatus] || VERIFICATION_LABELS.none;
  const VIcon = vInfo.icon;

  const fmtDate = (iso: string | null) => {
    if (!iso) return '永久';
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">订阅与认证</h4>

      {/* Subscription status */}
      <div className={`p-4 rounded-xl border-2 ${
        isActive ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/10' :
        isExpired ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/10' :
        'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className={isActive ? 'text-emerald-600' : 'text-[var(--text-tertiary)]'} />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {isActive ? '订阅生效中' : isExpired ? '订阅已过期' : '未订阅'}
              </p>
              {subscription && (
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {PLAN_LABELS[subscription.plan] || subscription.plan}
                  {subscription.expires_at ? ` · 到期 ${fmtDate(subscription.expires_at)}` : ' · 永久有效'}
                </p>
              )}
            </div>
          </div>
          {isActive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <CheckCircle size={10} />
              Active
            </span>
          )}
        </div>

        {!isActive && (
          <div className="mt-3 space-y-2">
            <div className="text-[11px] text-[var(--text-tertiary)] space-y-1">
              <p className="font-medium text-[var(--text-secondary)]">订阅权益：</p>
              <p>· 根据投喂金额解锁对应组合的 MSG 消息存档</p>
              <p>· 支持网站持续运营与开发</p>
            </div>
            <a
              href="https://ko-fi.com/srzwyuu"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--color-brand-nogi)' }}
            >
              <ExternalLink size={12} />
              前往 Ko-fi 订阅
            </a>
          </div>
        )}
      </div>

      {/* Verification status */}
      <VerificationStatusCard verificationStatus={verificationStatus} />
    </div>
  );
}

function VerificationStatusCard({ verificationStatus }: { verificationStatus: string }) {
  const [requesting, setRequesting] = useState(false);
  const [localStatus, setLocalStatus] = useState(verificationStatus);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);

  const handleRequest = async () => {
    if (reason.trim().length < 20) {
      setMsg('请至少填写 20 字');
      return;
    }
    setRequesting(true);
    setMsg('');
    const res = await requestVerification(reason.trim());
    setRequesting(false);
    if (res.success) {
      setLocalStatus('pending');
      setMsg('认证申请已提交，等待管理员审核');
      setShowForm(false);
    } else {
      setMsg(res.message || '申请失败');
    }
  };

  const currentInfo = VERIFICATION_LABELS[localStatus] || VERIFICATION_LABELS.none;
  const CurrentIcon = currentInfo.icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
        <CurrentIcon size={16} style={{ color: currentInfo.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-[var(--text-tertiary)]">认证状态（GeoPass）</p>
          <p className="text-sm font-medium" style={{ color: currentInfo.color }}>{currentInfo.label}</p>
        </div>
        {(localStatus === 'none' || localStatus === 'rejected') && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-[10px] font-medium text-white rounded-lg cursor-pointer"
            style={{ backgroundColor: 'var(--color-brand-nogi)' }}
          >
            {localStatus === 'rejected' ? '重新申请' : '申请认证'}
          </button>
        )}
      </div>

      {showForm && (localStatus === 'none' || localStatus === 'rejected') && (
        <div className="p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] space-y-2">
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            请简单介绍一下你自己，并说明你平时关注的坂道内容或使用本站的目的。
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)]">
            这段说明仅用于辅助审核，不会公开展示。如果仅凭说明无法判断，管理员会引导你进群完成人工验证。
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：我平时主要关注櫻坂/日向坂，会看博客翻译、MSG归档和广播内容…"
            className="w-full px-3 py-2 text-xs border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none"
            rows={3}
          />
          <div className="flex items-center justify-between">
            <span className={`text-[10px] ${reason.trim().length >= 20 ? 'text-green-500' : 'text-[var(--text-tertiary)]'}`}>
              {reason.trim().length}/20 字
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setMsg(''); }} className="px-3 py-1.5 text-[10px] text-[var(--text-tertiary)] rounded-lg hover:bg-[var(--bg-tertiary)] cursor-pointer">
                取消
              </button>
              <button
                onClick={handleRequest}
                disabled={requesting || reason.trim().length < 20}
                className="px-3 py-1.5 text-[10px] font-medium text-white rounded-lg cursor-pointer disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-brand-nogi)' }}
              >
                {requesting ? '提交中...' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-[10px] px-1 ${msg.includes('失败') || msg.includes('至少') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>{msg}</p>
      )}

      {localStatus === 'rejected' && !showForm && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 space-y-2">
          <p className="text-[11px] text-red-700 dark:text-red-400 font-medium">
            认证未通过，请加入以下群组联系管理员完成人工验证：
          </p>
          <div className="flex flex-wrap gap-2">
            <span onClick={() => navigator.clipboard.writeText('915448805')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg bg-[#12B7F5]/10 text-[#12B7F5] hover:bg-[#12B7F5]/20 transition-colors cursor-pointer">
              QQ 群: 915448805（点击复制）
            </span>
            <a href="https://discord.gg/n8F7Eq4vyD" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20 transition-colors">
              Discord
            </a>
          </div>
        </div>
      )}

      {localStatus === 'none' && !showForm && (
        <p className="text-[10px] text-[var(--text-tertiary)] px-1">
          日本地区访问部分内容需要通过认证（免费）。
        </p>
      )}

      {localStatus === 'pending' && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 px-1">
          申请审核中，通常 24 小时内完成。如需加急可加群联系管理员。
        </p>
      )}
    </div>
  );
}

// ── Payment Links Section ──
const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  kofi: { label: 'Ko-fi', color: '#FF5E5B' },
  afdian: { label: '爱发电', color: '#946CE6' },
  stripe: { label: 'Stripe', color: '#635BFF' },
};

function PaymentLinksSection({ initialLinks }: { initialLinks: PaymentLinkInfo[] }) {
  const [links, setLinks] = useState(initialLinks);
  const [showAdd, setShowAdd] = useState(false);
  const [addPlatform, setAddPlatform] = useState('kofi');
  const [addEmail, setAddEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const availablePlatforms = Object.keys(PLATFORM_CONFIG).filter(
    (p) => !links.some((l) => l.platform === p)
  );

  const handleAdd = async () => {
    if (!addEmail.trim()) { setMsg({ type: 'err', text: '请输入邮箱' }); return; }
    setSaving(true);
    setMsg(null);
    const res = await addPaymentLink({ platform: addPlatform, platformEmail: addEmail.trim() });
    setSaving(false);
    if (res.success) {
      setLinks([...links, { platform: addPlatform, email: addEmail.trim(), linkedAt: new Date().toISOString() }]);
      setShowAdd(false);
      setAddEmail('');
      setMsg({ type: 'ok', text: '已关联' });
      setTimeout(() => setMsg(null), 2000);
    } else {
      setMsg({ type: 'err', text: res.message || res.error || '关联失败' });
    }
  };

  const handleRemove = async (platform: string) => {
    setRemoving(platform);
    const res = await removePaymentLink(platform);
    setRemoving(null);
    if (res.success) {
      setLinks(links.filter((l) => l.platform !== platform));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">付款账号关联</h4>
        {availablePlatforms.length > 0 && !showAdd && (
          <button
            onClick={() => { setShowAdd(true); setAddPlatform(availablePlatforms[0]); }}
            className="text-xs px-2 py-1 rounded-lg font-medium text-white cursor-pointer"
            style={{ backgroundColor: 'var(--color-brand-nogi)' }}
          >
            <Plus size={12} className="inline -mt-0.5 mr-0.5" />关联
          </button>
        )}
      </div>

      <p className="text-[10px] text-[var(--text-tertiary)] mb-2">
        关联后，Ko-fi/爱发电付款会自动匹配到你的账号，激活订阅。
      </p>

      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg mb-2 ${msg.type === 'ok' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {links.length === 0 && !showAdd ? (
        <p className="text-xs text-[var(--text-tertiary)] py-2">暂无关联的付款账号</p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => {
            const cfg = PLATFORM_CONFIG[link.platform] || { label: link.platform, color: '#6b7280' };
            return (
              <div
                key={link.platform}
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: cfg.color }}>
                  {cfg.label.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{cfg.label}</p>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">{link.email || '—'}</p>
                </div>
                <button
                  onClick={() => handleRemove(link.platform)}
                  disabled={removing === link.platform}
                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer disabled:opacity-50"
                  title="移除"
                >
                  {removing === link.platform ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="mt-2 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] space-y-2">
          <select
            value={addPlatform}
            onChange={(e) => setAddPlatform(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30"
          >
            {availablePlatforms.map((p) => (
              <option key={p} value={p}>{PLATFORM_CONFIG[p]?.label || p}</option>
            ))}
          </select>
          <input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="付款时使用的邮箱"
            className="w-full px-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-white rounded-lg cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand-nogi)' }}
            >
              {saving ? '保存中...' : '确认关联'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setMsg(null); }}
              className="px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] rounded-lg hover:bg-[var(--bg-tertiary)] cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Password Change Section ──
function PasswordChangeSection() {
  const [open, setOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (newPw.length < 8) { setMsg({ type: 'err', text: '新密码至少 8 个字符' }); return; }
    if (newPw !== confirmPw) { setMsg({ type: 'err', text: '两次输入的密码不一致' }); return; }
    setSaving(true);
    const res = await changePassword({ currentPassword: currentPw, newPassword: newPw });
    setSaving(false);
    if (res.success) {
      setMsg({ type: 'ok', text: '密码已修改' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
    } else {
      setMsg({ type: 'err', text: res.message || '修改失败' });
    }
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--color-brand-nogi)] transition-colors cursor-pointer"
      >
        <Shield size={14} />
        修改密码
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3 p-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          {msg && (
            <div className={`text-xs px-3 py-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
              {msg.text}
            </div>
          )}
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">当前密码</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">新密码</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30" placeholder="至少 8 个字符" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">确认新密码</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30" />
          </div>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-xs font-medium text-white rounded-lg cursor-pointer disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-brand-nogi)' }}>
            {saving ? '保存中...' : '确认修改'}
          </button>
        </form>
      )}
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
                    src={getOptimizedAvatarUrl(oshiFav.name, 160)}
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
                          src={getOptimizedAvatarUrl(fav.name, 400)}
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
                          src={getOptimizedAvatarUrl(m.name, 400)}
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

// ── Saved Repo type (mirrors RepoPage) ──
interface SavedRepo {
  id: string;
  label: string;
  memberId: string;
  memberName: string;
  groupId: string;
  memberImageUrl: string;
  templateId: string;
  updatedAt: number;
  status: 'draft' | 'published';
  href: string;
}

function toSavedRepo(work: RepoWorkItem): SavedRepo {
  const updatedAt = new Date(work.updatedAt || work.createdAt).getTime();
  const status = work.status === 'draft' ? 'draft' : 'published';
  return {
    id: work.id,
    label: `${work.eventDate} 第${work.slotNumber}部`,
    memberId: work.memberId,
    memberName: work.memberName,
    groupId: work.groupId,
    memberImageUrl: work.customMemberAvatar || getR2AvatarUrl(work.memberName),
    templateId: work.template,
    updatedAt,
    status,
    href: status === 'draft' ? `/repo/create?id=${encodeURIComponent(work.id)}` : `/repo?id=${encodeURIComponent(work.id)}`,
  };
}

// ── Publications Tab ──
function PublicationsTab() {
  const [repos, setRepos] = useState<SavedRepo[]>([]);
  const [subTab, setSubTab] = useState<'repo' | 'photocard'>('repo');
  const [repoLoading, setRepoLoading] = useState(true);
  const [repoError, setRepoError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRepos = useCallback(async () => {
    setRepoLoading(true);
    setRepoError('');
    try {
      const res = await getMyRepoWorks({ status: 'all', limit: 100 });
      if (res.success && res.data) {
        setRepos(
          res.data.repos
            .map(toSavedRepo)
            .sort((left, right) => right.updatedAt - left.updatedAt),
        );
      } else {
        setRepos([]);
        setRepoError(res.message || '加载 Repo 失败');
      }
    } catch {
      setRepos([]);
      setRepoError('加载 Repo 失败');
    } finally {
      setRepoLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  const deleteRepo = async (id: string) => {
    setDeletingId(id);
    setRepoError('');
    try {
      const res = await deleteRepoWork(id);
      if (res.success) {
        setRepos((prev) => prev.filter((repo) => repo.id !== id));
      } else {
        setRepoError(res.message || '删除 Repo 失败');
      }
    } catch {
      setRepoError('删除 Repo 失败');
    } finally {
      setDeletingId(null);
    }
  };

  const draftRepos = repos.filter((repo) => repo.status === 'draft');
  const publishedRepos = repos.filter((repo) => repo.status === 'published');

  const renderRepoGroups = (items: SavedRepo[]) => {
    const byMember: Record<string, SavedRepo[]> = {};
    items.forEach((repo) => {
      if (!byMember[repo.memberName]) byMember[repo.memberName] = [];
      byMember[repo.memberName].push(repo);
    });

    return Object.entries(byMember).map(([memberName, memberRepos]) => (
      <div key={memberName} className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)]">
          <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-[var(--bg-tertiary)]">
            <img
              src={getOptimizedAvatarUrl(memberName, 80)}
              alt={memberName}
              className="w-full h-full object-cover"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (!img.dataset.fb && memberRepos[0]) { img.dataset.fb = '1'; img.src = memberRepos[0].memberImageUrl; }
              }}
            />
          </div>
          <span className="text-xs font-medium text-[var(--text-primary)]">{memberName}</span>
          <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">{memberRepos.length} 个</span>
        </div>
        <div className="divide-y divide-[var(--border-primary)]">
          {memberRepos.map((repo) => (
            <div key={repo.id} className="flex items-center gap-3 px-3 py-2 group hover:bg-[var(--bg-secondary)] transition-colors">
              <PenLine size={12} className="text-[var(--text-tertiary)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <a href={repo.href} className="text-xs font-medium text-[var(--text-primary)] hover:text-[var(--color-brand-nogi)] truncate block">
                  {repo.label}
                </a>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${repo.status === 'draft' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                    {repo.status === 'draft' ? '草稿' : '已发布'}
                  </span>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {new Date(repo.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void deleteRepo(repo.id)}
                disabled={deletingId === repo.id}
                className="p-1 rounded opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-500 transition-all cursor-pointer disabled:opacity-100 disabled:cursor-not-allowed"
                title="删除"
              >
                {deletingId === repo.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    ));
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="flex gap-1 bg-[var(--bg-tertiary)] rounded-lg p-0.5">
        <button
          onClick={() => setSubTab('repo')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
            subTab === 'repo'
              ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <PenLine size={12} />
          握手Repo ({repos.length})
        </button>
        <button
          onClick={() => setSubTab('photocard')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
            subTab === 'photocard'
              ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Image size={12} />
          生写卡片 (0)
        </button>
      </div>

      {/* Repo sub-tab */}
      {subTab === 'repo' && (
        repoLoading ? (
          <div className="text-center py-10">
            <Loader2 size={32} className="mx-auto text-[var(--text-tertiary)] mb-2 animate-spin" />
            <p className="text-sm text-[var(--text-tertiary)]">加载 Repo 中...</p>
          </div>
        ) : repoError ? (
          <div className="text-center py-10">
            <AlertCircle size={32} className="mx-auto text-red-500 mb-2" />
            <p className="text-sm text-red-500 mb-3">{repoError}</p>
            <button onClick={() => void loadRepos()} className="inline-block text-xs px-4 py-2 rounded-lg font-medium text-white cursor-pointer" style={{ backgroundColor: 'var(--color-brand-nogi)' }}>
              重试
            </button>
          </div>
        ) : repos.length === 0 ? (
          <div className="text-center py-10">
            <PenLine size={32} className="mx-auto text-[var(--text-tertiary)] mb-2" />
            <p className="text-sm text-[var(--text-tertiary)] mb-1">还没有创建过 Repo</p>
            <a href="/repo" className="inline-block mt-3 text-xs px-4 py-2 rounded-lg font-medium text-white" style={{ backgroundColor: 'var(--color-brand-nogi)' }}>
              去创建
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2">
                <p className="text-[10px] text-[var(--text-tertiary)] mb-1">草稿</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{draftRepos.length}</p>
              </div>
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2">
                <p className="text-[10px] text-[var(--text-tertiary)] mb-1">已发布</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{publishedRepos.length}</p>
              </div>
            </div>
            {draftRepos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">草稿箱</h4>
                  <a href="/repo/create" className="text-[10px] text-[var(--color-brand-nogi)] hover:underline">去继续编辑</a>
                </div>
                {renderRepoGroups(draftRepos)}
              </div>
            )}
            {publishedRepos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">已发布作品</h4>
                  <a href="/repo" className="text-[10px] text-[var(--color-brand-nogi)] hover:underline">查看社区</a>
                </div>
                {renderRepoGroups(publishedRepos)}
              </div>
            )}
          </div>
        )
      )}

      {/* Photocard sub-tab (placeholder) */}
      {subTab === 'photocard' && (
        <div className="text-center py-10">
          <Image size={32} className="mx-auto text-[var(--text-tertiary)] mb-2" />
          <p className="text-sm text-[var(--text-tertiary)] mb-1">生写卡片保存功能即将上线</p>
          <a href="/photocard" className="inline-block mt-3 text-xs px-4 py-2 rounded-lg font-medium text-white" style={{ backgroundColor: 'var(--color-brand-nogi)' }}>
            去创建
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ──
type Tab = 'profile' | 'favorites' | 'publications';

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
    { key: 'favorites', label: '推しメン設定', icon: Heart },
    { key: 'publications', label: '我的发布', icon: PenLine },
  ];

  return (
    <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-6">
      {/* Left sidebar tabs */}
      <div className="md:w-48 flex-shrink-0">
        <nav className="flex md:flex-col gap-1 md:sticky md:top-20 overflow-x-auto md:overflow-visible border-b md:border-b-0 border-[var(--border-primary)] md:border-r md:border-[var(--border-primary)] pb-2 md:pb-0 md:pr-4">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[var(--color-brand-nogi)]/10 text-[var(--color-brand-nogi)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0">
        {tab === 'profile' && profile && <ProfileTab profile={profile} />}
        {tab === 'favorites' && <FavoritesTab />}
        {tab === 'publications' && <PublicationsTab />}
      </div>
    </div>
  );
}
