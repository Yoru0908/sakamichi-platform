/** Single community work card */

import { Heart } from 'lucide-react';
import type { CommunityWork } from '@/utils/community-api';

const groupColors: Record<string, string> = {
  '櫻坂46': 'var(--color-brand-sakura)',
  '日向坂46': 'var(--color-brand-hinata)',
  '乃木坂46': 'var(--color-brand-nogi)',
  '乃木坂46②': 'var(--color-brand-nogi)',
};

interface Props {
  work: CommunityWork;
  onClick: () => void;
}

export default function WorkCard({ work, onClick }: Props) {
  const color = groupColors[work.groupStyle] || '#6b7280';

  return (
    <div
      className="break-inside-avoid rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative">
        <img
          src={work.imageUrl}
          alt={`${work.memberName} - ${work.theme || ''}`}
          loading="lazy"
          className="w-full h-auto block"
          style={{ minHeight: 120, background: 'var(--bg-tertiary)' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: color }}
        />
      </div>

      {/* Info */}
      <div className="p-2.5">
        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
          {work.memberName}
        </div>
        {work.theme && (
          <div className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">
            {work.theme}
          </div>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-0.5 text-[var(--text-tertiary)]">
            <Heart
              size={10}
              className={work.liked ? 'fill-red-500 text-red-500' : ''}
            />
            <span className="text-[10px]">{work.likeCount}</span>
          </div>
          <span className="text-[9px] text-[var(--text-tertiary)] truncate max-w-[80px]">
            {work.author.displayName}
          </span>
        </div>
      </div>
    </div>
  );
}
