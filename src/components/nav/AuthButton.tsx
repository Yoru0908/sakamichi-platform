import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { User, LogIn, LogOut } from 'lucide-react';
import { $auth, initAuth, logout } from '@/stores/auth';

export default function AuthButton() {
  const auth = useStore($auth);

  useEffect(() => {
    initAuth();
  }, []);

  if (auth.loading) {
    return (
      <div className="hidden md:flex items-center ml-2">
        <div className="w-5 h-5 border-2 border-t-transparent border-[var(--color-brand-nogi)] rounded-full animate-spin" />
      </div>
    );
  }

  if (auth.isLoggedIn) {
    return (
      <div className="hidden md:flex items-center gap-2 ml-2">
        <a
          href="/user"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          {auth.avatarUrl ? (
            <img
              src={auth.avatarUrl}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <User size={16} className="text-[var(--text-secondary)]" />
          )}
          <span className="text-sm font-medium text-[var(--text-primary)] max-w-[100px] truncate">
            {auth.displayName || auth.email || 'User'}
          </span>
        </a>
        <button
          onClick={() => logout().then(() => window.location.href = '/auth/login')}
          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
          title="退出登录"
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <a
      href="/auth/login"
      className="hidden md:inline-flex items-center gap-1.5 ml-2 px-3.5 py-1.5 text-sm font-medium bg-[var(--color-brand-nogi)] text-white rounded-lg hover:bg-[var(--color-brand-nogi-dark)] transition-colors"
    >
      <LogIn size={14} />
      登录
    </a>
  );
}
