import { useStore } from '@nanostores/react';
import { $theme, toggleTheme } from '@/stores/theme';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const theme = useStore($theme);

  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center justify-center w-9 h-9 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
      title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
      aria-label="Toggle theme"
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
