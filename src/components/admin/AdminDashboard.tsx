import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  BarChart3, Users, CreditCard, Ticket, AlertTriangle, Shield,
  Check, X, Copy, Plus, Loader2, RefreshCw, ChevronDown,
  Mail, Clock, ExternalLink,
} from 'lucide-react';
import { $auth, initAuth } from '@/stores/auth';
import {
  getAdminStats, getAdminVerifications, resolveVerification,
  getAdminSubscriptions, getAdminInviteCodes, createInviteCode,
  getAdminUnmatchedPayments, resolveUnmatchedPayment,
  type AdminStats, type AdminUser, type AdminSubscription,
  type AdminInviteCode, type AdminUnmatchedPayment,
} from '@/utils/auth-api';

// ── Helpers ──
const fmt = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
};

const fmtFull = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const PLAN_LABELS: Record<string, string> = {
  all_groups: '全坂道',
  single_nogizaka: '乃木坂46',
  single_sakurazaka: '櫻坂46',
  single_hinatazaka: '日向坂46',
  lifetime: '终身会员',
};

// ── Stats Cards ──
function StatsOverview({ stats, loading }: { stats: AdminStats | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] animate-pulse" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: '总用户', value: stats.total_users, icon: Users, color: '#2563eb' },
    { label: '付费用户', value: stats.paid_users, icon: CreditCard, color: '#059669' },
    { label: '待审核', value: stats.unmatched_pending, icon: AlertTriangle, color: '#d97706', highlight: stats.unmatched_pending > 0 },
    { label: '有效邀请码', value: stats.active_codes, icon: Ticket, color: '#7c3aed' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className={`relative p-4 rounded-xl border bg-[var(--bg-secondary)] ${
              c.highlight ? 'border-amber-400 ring-1 ring-amber-400/30' : 'border-[var(--border-primary)]'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} style={{ color: c.color }} />
              <span className="text-[10px] text-[var(--text-tertiary)]">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{c.value}</p>
            {c.highlight && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Verifications Tab ──
function VerificationsTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await getAdminVerifications(filter);
    if (res.success && res.data) setUsers(res.data.users);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleAction = async (userId: string, action: 'approve' | 'reject') => {
    setActing(userId);
    const res = await resolveVerification(userId, action);
    if (res.success) {
      setUsers(users.filter(u => u.id !== userId));
    }
    setActing(null);
  };

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'pending', label: '待审核' },
    { key: 'approved', label: '已批准' },
    { key: 'rejected', label: '已拒绝' },
    { key: 'all', label: '全部' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                filter === f.key
                  ? 'bg-[var(--color-brand-nogi)] text-white'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center"><Loader2 size={20} className="animate-spin mx-auto text-[var(--text-tertiary)]" /></div>
      ) : users.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
          {filter === 'pending' ? '没有待审核的验证请求' : '无数据'}
        </p>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--bg-tertiary)] flex-shrink-0">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users size={14} className="text-[var(--text-tertiary)]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {u.display_name || u.email.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)] truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {u.verification_status === 'pending' ? (
                    <>
                      <span className="text-[10px] text-amber-500 mr-1">待审核</span>
                      <button
                        onClick={() => handleAction(u.id, 'approve')}
                        disabled={acting === u.id}
                        className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer disabled:opacity-50"
                        title="批准"
                      >
                        {acting === u.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button
                        onClick={() => handleAction(u.id, 'reject')}
                        disabled={acting === u.id}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer disabled:opacity-50"
                        title="拒绝"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      u.verification_status === 'approved'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {u.verification_status === 'approved' ? '已批准' : '已拒绝'}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0 hidden sm:block">{fmt(u.created_at)}</span>
              </div>
              {u.verification_reason && (
                <div className="ml-11 p-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-primary)]">
                  <p className="text-[10px] text-[var(--text-tertiary)] mb-0.5">申请说明：</p>
                  <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{u.verification_reason}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invite Codes Tab ──
function InviteCodesTab() {
  const [codes, setCodes] = useState<AdminInviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPlan, setNewPlan] = useState('all_groups');
  const [newMaxUses, setNewMaxUses] = useState(1);
  const [newDurationDays, setNewDurationDays] = useState<string>('');
  const [newExpiresInDays, setNewExpiresInDays] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await getAdminInviteCodes();
    if (res.success && res.data) setCodes(res.data.codes);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    const res = await createInviteCode({
      plan: newPlan,
      maxUses: newMaxUses,
      durationDays: newDurationDays ? parseInt(newDurationDays) : null,
      expiresInDays: newExpiresInDays ? parseInt(newExpiresInDays) : null,
    });
    if (res.success) {
      await load();
      setShowCreate(false);
      setNewDurationDays('');
      setNewExpiresInDays('');
    }
    setCreating(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">邀请码管理</h4>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg cursor-pointer"
          style={{ backgroundColor: 'var(--color-brand-nogi)' }}
        >
          <Plus size={12} />生成
        </button>
      </div>

      {showCreate && (
        <div className="p-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-[var(--text-tertiary)] mb-1">套餐</label>
              <select
                value={newPlan}
                onChange={e => setNewPlan(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)]"
              >
                {Object.entries(PLAN_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-tertiary)] mb-1">最大使用次数</label>
              <input
                type="number" min={1} max={100} value={newMaxUses}
                onChange={e => setNewMaxUses(parseInt(e.target.value) || 1)}
                className="w-full px-2 py-1.5 text-xs border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-tertiary)] mb-1">订阅天数（空=永久）</label>
              <input
                type="number" min={1} value={newDurationDays}
                onChange={e => setNewDurationDays(e.target.value)}
                placeholder="永久"
                className="w-full px-2 py-1.5 text-xs border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-tertiary)] mb-1">码有效期天数（空=不过期）</label>
              <input
                type="number" min={1} value={newExpiresInDays}
                onChange={e => setNewExpiresInDays(e.target.value)}
                placeholder="不过期"
                className="w-full px-2 py-1.5 text-xs border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate} disabled={creating}
              className="px-3 py-1.5 text-xs font-medium text-white rounded-lg cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand-nogi)' }}
            >
              {creating ? '生成中...' : '确认生成'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] rounded-lg hover:bg-[var(--bg-tertiary)] cursor-pointer">
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center"><Loader2 size={20} className="animate-spin mx-auto text-[var(--text-tertiary)]" /></div>
      ) : codes.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">暂无邀请码</p>
      ) : (
        <div className="space-y-2">
          {codes.map(c => {
            const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
            const isFullyUsed = c.used_count >= c.max_uses;
            const isActive = !isExpired && !isFullyUsed;
            return (
              <div
                key={c.code}
                className={`p-3 rounded-lg border bg-[var(--bg-secondary)] ${
                  isActive ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono font-bold text-[var(--text-primary)] tracking-wider">{c.code}</code>
                    <button
                      onClick={() => copyCode(c.code)}
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                      title="复制"
                    >
                      {copied === c.code ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }`}>
                    {isExpired ? '已过期' : isFullyUsed ? '已用完' : '有效'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                  <span>{PLAN_LABELS[c.plan] || c.plan}</span>
                  <span>·</span>
                  <span>{c.used_count}/{c.max_uses} 次</span>
                  <span>·</span>
                  <span>{c.duration_days ? `${c.duration_days}天` : '永久'}</span>
                  {c.expires_at && <><span>·</span><span>到期 {fmt(c.expires_at)}</span></>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Subscriptions Tab ──
function SubscriptionsTab() {
  const [subs, setSubs] = useState<AdminSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');

  const load = async () => {
    setLoading(true);
    const res = await getAdminSubscriptions(filter);
    if (res.success && res.data) setSubs(res.data.subscriptions);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {['active', 'expired', 'cancelled'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                filter === f
                  ? 'bg-[var(--color-brand-nogi)] text-white'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {f === 'active' ? '活跃' : f === 'expired' ? '过期' : '取消'}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center"><Loader2 size={20} className="animate-spin mx-auto text-[var(--text-tertiary)]" /></div>
      ) : subs.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">暂无订阅</p>
      ) : (
        <div className="space-y-2">
          {subs.map(s => (
            <div key={s.id} className="p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {s.display_name || s.email.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)] truncate">{s.email}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  s.status === 'active'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {s.status === 'active' ? '活跃' : s.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                <span>{PLAN_LABELS[s.plan] || s.plan}</span>
                <span>·</span>
                <span>{s.payment_method || '—'}</span>
                {s.expires_at && <><span>·</span><span>到期 {fmt(s.expires_at)}</span></>}
                {!s.expires_at && <><span>·</span><span>永久</span></>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Unmatched Payments Tab ──
function UnmatchedPaymentsTab() {
  const [payments, setPayments] = useState<AdminUnmatchedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveInput, setResolveInput] = useState<{ paymentId: string; userId: string; plan: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await getAdminUnmatchedPayments();
    if (res.success && res.data) setPayments(res.data.payments);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async () => {
    if (!resolveInput) return;
    setResolving(resolveInput.paymentId);
    const res = await resolveUnmatchedPayment(resolveInput.paymentId, resolveInput.userId, resolveInput.plan);
    if (res.success) {
      setPayments(payments.filter(p => p.id !== resolveInput.paymentId));
      setResolveInput(null);
    }
    setResolving(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">未匹配付款</h4>
        <button onClick={load} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center"><Loader2 size={20} className="animate-spin mx-auto text-[var(--text-tertiary)]" /></div>
      ) : payments.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">暂无未匹配的付款</p>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--text-primary)] capitalize">{p.platform}</span>
                  {p.amount && <span className="text-xs text-[var(--text-tertiary)]">${p.amount}</span>}
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">{fmtFull(p.created_at)}</span>
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)] space-y-0.5">
                {p.platform_user_id && <p><Mail size={10} className="inline mr-1" />{p.platform_user_id}</p>}
                {p.order_id && <p>Order: {p.order_id}</p>}
                {p.remark && <p className="truncate">备注: {p.remark}</p>}
              </div>

              {resolveInput?.paymentId === p.id ? (
                <div className="mt-2 p-2 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] space-y-2">
                  <input
                    type="text"
                    value={resolveInput.userId}
                    onChange={e => setResolveInput({ ...resolveInput, userId: e.target.value })}
                    placeholder="用户 ID"
                    className="w-full px-2 py-1 text-xs border border-[var(--border-primary)] rounded bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                  />
                  <select
                    value={resolveInput.plan}
                    onChange={e => setResolveInput({ ...resolveInput, plan: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-[var(--border-primary)] rounded bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                  >
                    {Object.entries(PLAN_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={handleResolve}
                      disabled={!resolveInput.userId || resolving === p.id}
                      className="px-2 py-1 text-[10px] font-medium text-white rounded cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-brand-nogi)' }}
                    >
                      {resolving === p.id ? '处理中...' : '确认关联'}
                    </button>
                    <button
                      onClick={() => setResolveInput(null)}
                      className="px-2 py-1 text-[10px] text-[var(--text-tertiary)] rounded hover:bg-[var(--bg-tertiary)] cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setResolveInput({ paymentId: p.id, userId: '', plan: 'all_groups' })}
                  className="mt-2 text-[10px] font-medium text-[var(--color-brand-nogi)] hover:underline cursor-pointer"
                >
                  关联到用户
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Admin Dashboard ──
type AdminTab = 'overview' | 'verifications' | 'invites' | 'subscriptions' | 'payments';

export default function AdminDashboard() {
  const auth = useStore($auth);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => { initAuth(); }, []);

  useEffect(() => {
    if (auth.isLoggedIn && auth.role === 'admin') {
      setStatsLoading(true);
      getAdminStats().then(res => {
        if (res.success && res.data) setStats(res.data.stats);
        setStatsLoading(false);
      });
    }
  }, [auth.isLoggedIn, auth.role]);

  // Loading
  if (auth.loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center">
        <Loader2 size={24} className="animate-spin mx-auto text-[var(--text-tertiary)] mb-3" />
        <p className="text-sm text-[var(--text-tertiary)]">加载中...</p>
      </div>
    );
  }

  // Not logged in or not admin
  if (!auth.isLoggedIn || auth.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Shield size={32} className="mx-auto text-red-400 mb-3" />
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">权限不足</h2>
        <p className="text-xs text-[var(--text-tertiary)]">此页面仅限管理员访问</p>
        <a href="/auth/login" className="inline-block mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: 'var(--color-brand-nogi)' }}>
          前往登录
        </a>
      </div>
    );
  }

  const tabs: { key: AdminTab; label: string; icon: typeof BarChart3; badge?: number }[] = [
    { key: 'overview', label: '概览', icon: BarChart3 },
    { key: 'verifications', label: 'GeoPass 审核', icon: Shield, badge: stats?.unmatched_pending },
    { key: 'invites', label: '邀请码', icon: Ticket },
    { key: 'subscriptions', label: '订阅', icon: CreditCard },
    { key: 'payments', label: '未匹配付款', icon: AlertTriangle, badge: stats?.unmatched_pending },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Shield size={20} className="text-[var(--color-brand-nogi)]" />
        <h1 className="text-xl font-bold text-[var(--text-primary)]">管理后台</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-[var(--border-primary)] pb-0">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-[var(--color-brand-nogi)] text-[var(--color-brand-nogi)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={13} />
              {t.label}
              {t.badge && t.badge > 0 ? (
                <span className="ml-0.5 px-1.5 py-0.5 text-[9px] font-bold text-white bg-amber-500 rounded-full">{t.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <StatsOverview stats={stats} loading={statsLoading} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setTab('verifications')}
              className="p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--color-brand-nogi)]/50 transition-colors cursor-pointer text-left"
            >
              <Shield size={16} className="text-[var(--color-brand-nogi)] mb-2" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">GeoPass 审核</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">审批日本地区用户的访问验证请求</p>
            </button>
            <button
              onClick={() => setTab('invites')}
              className="p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--color-brand-nogi)]/50 transition-colors cursor-pointer text-left"
            >
              <Ticket size={16} className="text-[#7c3aed] mb-2" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">邀请码管理</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">生成和管理免费订阅邀请码</p>
            </button>
            <button
              onClick={() => setTab('payments')}
              className="p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--color-brand-nogi)]/50 transition-colors cursor-pointer text-left"
            >
              <AlertTriangle size={16} className="text-amber-500 mb-2" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">未匹配付款</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">处理 Ko-fi 等平台无法自动匹配的付款</p>
            </button>
            <button
              onClick={() => setTab('subscriptions')}
              className="p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--color-brand-nogi)]/50 transition-colors cursor-pointer text-left"
            >
              <CreditCard size={16} className="text-emerald-500 mb-2" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">订阅管理</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">查看所有用户的订阅状态</p>
            </button>
          </div>
        </div>
      )}

      {tab === 'verifications' && <VerificationsTab />}
      {tab === 'invites' && <InviteCodesTab />}
      {tab === 'subscriptions' && <SubscriptionsTab />}
      {tab === 'payments' && <UnmatchedPaymentsTab />}
    </div>
  );
}
