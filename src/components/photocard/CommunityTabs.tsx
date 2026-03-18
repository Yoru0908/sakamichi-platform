import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import {
  TrendingUp, User, Heart, Image, LogIn, Bookmark, Share2,
} from 'lucide-react';

// Mock data
const popularCards = [
  { id: 1, member: '山下美月', group: 'nogizaka', likes: 342, h: 220 },
  { id: 2, member: '藤吉夏鈴', group: 'sakurazaka', likes: 298, h: 260 },
  { id: 3, member: '金村美玖', group: 'hinatazaka', likes: 276, h: 200 },
  { id: 4, member: '久保史緒里', group: 'nogizaka', likes: 251, h: 240 },
  { id: 5, member: '山﨑天', group: 'sakurazaka', likes: 237, h: 180 },
  { id: 6, member: '丹生明里', group: 'hinatazaka', likes: 219, h: 250 },
  { id: 7, member: '田村真佑', group: 'nogizaka', likes: 208, h: 210 },
  { id: 8, member: '守屋麗奈', group: 'sakurazaka', likes: 195, h: 230 },
];

const groupColors: Record<string, string> = {
  nogizaka: 'var(--color-brand-nogi)',
  sakurazaka: 'var(--color-brand-sakura)',
  hinatazaka: 'var(--color-brand-hinata)',
};

const GROUP_FILTERS = ['全部', '乃木坂', '櫻坂', '日向坂'] as const;

type Tab = 'popular' | 'my';

function CardGrid({ cards }: { cards: typeof popularCards }) {
  return (
    <div className="columns-2 sm:columns-3 md:columns-4 gap-3 space-y-3">
      {cards.map((card) => (
        <div
          key={card.id}
          className="break-inside-avoid rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="bg-[var(--bg-tertiary)] relative" style={{ height: `${card.h}px` }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <Image size={24} className="text-[var(--text-tertiary)] opacity-20" />
            </div>
            <div
              className="absolute bottom-0 left-0 right-0 h-0.5"
              style={{ backgroundColor: groupColors[card.group] }}
            />
          </div>
          <div className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-primary)]">{card.member}</span>
              <div className="flex items-center gap-0.5 text-[var(--text-tertiary)]">
                <Heart size={10} />
                <span className="text-[10px]">{card.likes}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CommunityTabs() {
  const [tab, setTab] = useState<Tab>('popular');
  const [groupFilter, setGroupFilter] = useState(0);
  const auth = useStore($auth);

  const filteredCards = groupFilter === 0
    ? popularCards
    : popularCards.filter((c) => {
        const map: Record<number, string> = { 1: 'nogizaka', 2: 'sakurazaka', 3: 'hinatazaka' };
        return c.group === map[groupFilter];
      });

  return (
    <div>
      {/* Tab headers */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('popular')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === 'popular'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <TrendingUp size={12} />
            热门作品
          </button>
          <button
            onClick={() => setTab('my')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === 'my'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <User size={12} />
            我的作品
          </button>
        </div>

        {/* Group filter (only for popular tab) */}
        {tab === 'popular' && (
          <div className="flex items-center gap-1">
            {GROUP_FILTERS.map((label, i) => (
              <button
                key={label}
                onClick={() => setGroupFilter(i)}
                className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                  groupFilter === i
                    ? 'border-[var(--color-brand-sakura)] text-[var(--color-brand-sakura)]'
                    : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:border-[var(--border-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab content */}
      {tab === 'popular' && <CardGrid cards={filteredCards} />}

      {tab === 'my' && (
        <div>
          {auth.isLoggedIn ? (
            <div>
              {/* Logged in but no works yet (placeholder) */}
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
                  <Image size={24} className="text-[var(--text-tertiary)] opacity-40" />
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-1">还没有作品</p>
                <p className="text-xs text-[var(--text-tertiary)] mb-4">
                  去创作你的第一张生写卡片吧
                </p>
                <a
                  href="/photocard/create"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-brand-sakura)' }}
                >
                  <Share2 size={12} />
                  开始创作
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
                <LogIn size={24} className="text-[var(--text-tertiary)] opacity-40" />
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">登录查看你的作品</p>
              <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-xs">
                登录后可以保存、管理和发布你的生写卡片作品到社区
              </p>
              <div className="flex items-center gap-2">
                <a
                  href="/auth/login"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-brand-sakura)' }}
                >
                  <LogIn size={12} />
                  登录 / 注册
                </a>
                <a
                  href="/photocard/create"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-[var(--border-primary)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  先体验生成器
                </a>
              </div>

              {/* Features preview */}
              <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm">
                {[
                  { icon: <Image size={14} />, label: '作品管理', desc: '保存所有创作' },
                  { icon: <Bookmark size={14} />, label: '收藏夹', desc: '收藏喜欢的作品' },
                  { icon: <Share2 size={14} />, label: '社区发布', desc: '分享到社区' },
                ].map((f) => (
                  <div key={f.label} className="text-center">
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-1.5 text-[var(--text-tertiary)]">
                      {f.icon}
                    </div>
                    <p className="text-[10px] font-medium text-[var(--text-primary)]">{f.label}</p>
                    <p className="text-[8px] text-[var(--text-tertiary)]">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
