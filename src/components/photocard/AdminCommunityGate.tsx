/** Shows community for admin, "coming soon" for others */

import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { Image, Sparkles, Hammer } from 'lucide-react';
import CommunityTabs from './CommunityTabs';

export default function AdminCommunityGate() {
  const auth = useStore($auth);
  const isAdmin = true; // TODO: revert to auth.role === 'admin'

  if (isAdmin) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">生写卡片社区</h1>
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

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-8 sm:p-12 shadow-sm">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: 'color-mix(in srgb, var(--color-brand-sakura) 12%, transparent)' }}
        >
          <Image size={28} style={{ color: 'var(--color-brand-sakura)' }} />
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">生写卡片</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
          创作官方风格的成员生写真卡片，浏览社区热门作品
        </p>
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium mb-6"
          style={{ background: 'color-mix(in srgb, var(--color-brand-hinata) 10%, transparent)', color: 'var(--color-brand-hinata)' }}
        >
          <Hammer size={12} />
          赶忙制作中！敬请期待
        </div>
        <p className="text-xs text-[var(--text-tertiary)] leading-relaxed mb-8">
          社区共创 · 热门排行 · 成员卡片生成器<br />正在紧急开发，即将上线
        </p>
        <a
          href="/photocard/create"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-sakura)' }}
        >
          <Sparkles size={14} />
          先试试卡片生成器
        </a>
      </div>
    </div>
  );
}
