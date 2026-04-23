import React from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { Crown, LogIn, Ticket, ExternalLink } from 'lucide-react';

interface PaidContentGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function PaidContentGuard({ children, fallback }: PaidContentGuardProps) {
  const auth = useStore($auth);

  // Admin/translator always has access
  if (auth.role === 'admin' || auth.role === 'translator') return <>{children}</>;

  // Active payment = access granted
  if (auth.paymentStatus === 'active') return <>{children}</>;

  // Not logged in or no active payment → show prompt
  return <>{fallback || <DefaultPaywall isLoggedIn={auth.isLoggedIn} />}</>;
}

function DefaultPaywall({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="max-w-lg mx-auto my-8 p-6 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
        <Crown size={24} className="text-amber-500" />
      </div>

      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
        此内容需要订阅
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed">
        感谢你对坂道翻译的关注！此内容仅对赞助者开放。<br />
        你可以通过以下方式获取访问权限：
      </p>

      <div className="space-y-3 mb-6">
        <a
          href="https://ko-fi.com/yoru0908"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-[var(--border-primary)] hover:border-[var(--color-brand-nogi)] hover:bg-[var(--bg-secondary)] transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">☕</span>
            <div className="text-left">
              <div className="text-sm font-medium text-[var(--text-primary)]">Ko-fi 赞助</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">海外用户推荐</div>
            </div>
          </div>
          <ExternalLink size={14} className="text-[var(--text-tertiary)] group-hover:text-[var(--color-brand-nogi)]" />
        </a>

        <a
          href="https://afdian.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-[var(--border-primary)] hover:border-[var(--color-brand-sakura)] hover:bg-[var(--bg-secondary)] transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">💜</span>
            <div className="text-left">
              <div className="text-sm font-medium text-[var(--text-primary)]">爱发电</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">国内用户推荐（认证中）</div>
            </div>
          </div>
          <ExternalLink size={14} className="text-[var(--text-tertiary)] group-hover:text-[var(--color-brand-sakura)]" />
        </a>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 border-t border-[var(--border-primary)]" />
        <span className="text-[10px] text-[var(--text-tertiary)]">或</span>
        <div className="flex-1 border-t border-[var(--border-primary)]" />
      </div>

      {isLoggedIn ? (
        <RedeemInviteSection />
      ) : (
        <a
          href="/auth/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all"
          style={{ backgroundColor: 'var(--color-brand-nogi)' }}
        >
          <LogIn size={14} />
          登录以使用邀请码
        </a>
      )}
    </div>
  );
}

function RedeemInviteSection() {
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`https://api.46log.com/api/auth/redeem-invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `邀请码兑换成功！方案: ${data.data?.plan || 'all_groups'}` });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setMessage({ type: 'error', text: data.message || '邀请码无效' });
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Ticket size={14} className="text-[var(--text-tertiary)]" />
        <span className="text-xs text-[var(--text-secondary)]">有邀请码？</span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="输入邀请码"
          maxLength={12}
          className="flex-1 px-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30 tracking-wider font-mono"
        />
        <button
          onClick={handleRedeem}
          disabled={loading || !code.trim()}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-all disabled:opacity-50 cursor-pointer"
          style={{ backgroundColor: 'var(--color-brand-nogi)' }}
        >
          {loading ? '...' : '兑换'}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

