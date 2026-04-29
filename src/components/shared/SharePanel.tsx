/** Reusable custom share dropdown panel */

import { useState, useEffect, useRef } from 'react';
import { Share2, Check, Copy, X } from 'lucide-react';

interface ShareConfig {
  url: string;
  title?: string;
  imageUrl?: string;
}

interface Props {
  config: ShareConfig;
  /** Button label, defaults to "分享" */
  label?: string;
  className?: string;
  buttonClassName?: string;
}

interface Platform {
  id: string;
  name: string;
  color: string;
  icon: string;
  getUrl: (cfg: ShareConfig) => string;
}

const PLATFORMS: Platform[] = [
  {
    id: 'qq',
    name: 'QQ',
    color: '#12B7F5',
    icon: 'Q',
    getUrl: ({ url, title, imageUrl }) =>
      `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || '')}&pics=${encodeURIComponent(imageUrl || '')}`,
  },
  {
    id: 'weibo',
    name: '微博',
    color: '#E6162D',
    icon: '微',
    getUrl: ({ url, title, imageUrl }) =>
      `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || '')}&pic=${encodeURIComponent(imageUrl || '')}`,
  },
  {
    id: 'line',
    name: 'Line',
    color: '#00C300',
    icon: 'L',
    getUrl: ({ url, title }) =>
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title || '')}`,
  },
  {
    id: 'x',
    name: 'X',
    color: '#000000',
    icon: '𝕏',
    getUrl: ({ url, title }) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(title || '')}&url=${encodeURIComponent(url)}`,
  },
];

export default function SharePanel({ config, label = '分享', className = '', buttonClassName = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(config.url);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
    } catch {}
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors ${buttonClassName}`}
      >
        <Share2 size={14} />
        {label}
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl shadow-xl p-3 z-10"
          style={{ minWidth: 200 }}
        >
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border-primary)]">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">分享到</span>
            <button onClick={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X size={13} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            {PLATFORMS.map(p => (
              <a
                key={p.id}
                href={p.getUrl(config)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors no-underline"
                title={p.name}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: p.color }}
                >
                  {p.icon}
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">{p.name}</span>
              </a>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            {copied ? '已复制链接' : '复制链接'}
          </button>
        </div>
      )}
    </div>
  );
}
