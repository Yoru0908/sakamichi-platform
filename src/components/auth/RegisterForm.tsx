import { useState } from 'react';
import { UserPlus, Mail, Lock, User, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { register } from '@/stores/auth';
import OAuthButtons from './OAuthButtons';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 8) {
      setError('密码至少需要 8 个字符');
      return;
    }

    setLoading(true);
    const result = await register({
      email,
      password,
      displayName: displayName || undefined,
    });
    setLoading(false);

    if (result.success) {
      setSuccess(result.message || '验证邮件已发送，请查收邮箱');
    } else {
      setError(result.error || '注册失败');
    }
  };

  return (
    <div className="max-w-sm w-full">
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-brand-hinata)]/10 mb-3">
            <UserPlus size={18} className="text-[var(--color-brand-hinata)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">创建账号</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">注册后可访问更多内容</p>
        </div>

        {/* Success */}
        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-start gap-2">
            <CheckCircle size={14} className="text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">{success}</p>
              <a href="/auth/login" className="text-xs text-green-600 dark:text-green-400 underline mt-1 inline-block">前往登录</a>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Form */}
        {!success && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  邮箱地址 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="email"
                    id="reg-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-hinata)]/30 focus:border-[var(--color-brand-hinata)] transition-all disabled:opacity-50"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-name" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  昵称 <span className="text-[var(--text-tertiary)]">(可选)</span>
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    id="reg-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={loading}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-hinata)]/30 focus:border-[var(--color-brand-hinata)] transition-all disabled:opacity-50"
                    placeholder="默认使用邮箱前缀"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-password" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  密码 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="password"
                    id="reg-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={loading}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-hinata)]/30 focus:border-[var(--color-brand-hinata)] transition-all disabled:opacity-50"
                    placeholder="至少 8 个字符"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-confirm" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  确认密码 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="password"
                    id="reg-confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-hinata)]/30 focus:border-[var(--color-brand-hinata)] transition-all disabled:opacity-50"
                    placeholder="再次输入密码"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-medium text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                style={{ backgroundColor: 'var(--color-brand-hinata)' }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                {loading ? '注册中...' : '注册'}
              </button>
            </form>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 border-t border-[var(--border-primary)]" />
              <span className="text-[10px] text-[var(--text-tertiary)]">或使用</span>
              <div className="flex-1 border-t border-[var(--border-primary)]" />
            </div>

            {/* OAuth */}
            <OAuthButtons disabled={loading} />
          </>
        )}

        {/* Login link */}
        <p className="mt-5 text-center text-xs text-[var(--text-tertiary)]">
          已有账号？{' '}
          <a href="/auth/login" className="font-medium text-[var(--color-brand-hinata)] hover:underline">立即登录</a>
        </p>
      </div>
    </div>
  );
}
