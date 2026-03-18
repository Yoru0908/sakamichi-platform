import { useState } from 'react';
import { LogIn, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { login } from '@/stores/auth';
import OAuthButtons from './OAuthButtons';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login({ email, password });
    setLoading(false);

    if (result.success) {
      if (result.isFirstLogin) {
        window.location.href = '/auth/onboarding';
      } else {
        window.location.href = '/';
      }
    } else {
      setError(result.error || '登录失败');
    }
  };

  return (
    <div className="max-w-sm w-full">
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-brand-nogi)]/10 mb-3">
            <LogIn size={18} className="text-[var(--color-brand-nogi)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">欢迎回来</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">登录以访问受限内容</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              邮箱地址
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="email"
                id="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30 focus:border-[var(--color-brand-nogi)] transition-all disabled:opacity-50"
                placeholder="your@email.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              密码
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="password"
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-primary)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-nogi)]/30 focus:border-[var(--color-brand-nogi)] transition-all disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-[var(--border-secondary)]" />
              <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">记住我</span>
            </label>
            <a href="#" className="text-xs text-[var(--color-brand-nogi)] hover:underline">忘记密码？</a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 text-sm font-medium text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
            style={{ backgroundColor: 'var(--color-brand-nogi)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            {loading ? '登录中...' : '登录'}
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

        {/* Register link */}
        <p className="mt-5 text-center text-xs text-[var(--text-tertiary)]">
          还没有账号？{' '}
          <a href="/auth/register" className="font-medium text-[var(--color-brand-nogi)] hover:underline">立即注册</a>
        </p>
      </div>
    </div>
  );
}
