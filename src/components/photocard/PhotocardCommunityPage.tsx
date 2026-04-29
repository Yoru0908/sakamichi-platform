import { Image, Sparkles } from 'lucide-react';
import CommunityTabs from './CommunityTabs';

export default function PhotocardCommunityPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Image size={20} className="text-[var(--color-brand-sakura)]" />
            <h1 className="text-xl font-bold text-[var(--text-primary)]">生写卡片社区</h1>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">浏览社区作品，或创作你自己的生写卡片</p>
        </div>
        <a
          href="/photocard/create"
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-sakura)' }}
        >
          <Sparkles size={14} />
          去创作
        </a>
      </div>
      <CommunityTabs />
    </div>
  );
}
