import { useEffect, useState, useRef, useCallback } from 'react';
import { Pen, ArrowRight } from 'lucide-react';
import { GROUP_COLORS } from '@/utils/mock-data';

const API_BASE = 'https://api.46log.com';

// Hex colors for gradient backgrounds (CSS vars can't be used with alpha in linear-gradient)
const GROUP_HEX: Record<string, string> = {
  nogizaka: '#742581',
  sakurazaka: '#F19DB5',
  hinatazaka: '#7BC7E8',
};

interface BlogItem {
  id: string;
  member_name: string;
  title: string;
  group: 'nogizaka' | 'sakurazaka' | 'hinatazaka';
  group_name: string;
  formatted_date: string;
  preview: string;
  image: string | null;
  hero_image: string | null;
  hero_images: string[];
}

function extractFirstImage(content: string): string | null {
  if (!content) return null;
  const match = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
  return match ? match[1] : null;
}

function extractImages(content: string, max = 5): string[] {
  if (!content) return [];
  const regex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  const urls: string[] = [];
  let m;
  while ((m = regex.exec(content)) !== null && urls.length < max) {
    urls.push(m[1]);
  }
  return urls;
}

function cloudinaryUrl(url: string, width: number): string {
  return url;
}

function mapGroup(groupName: string): 'nogizaka' | 'sakurazaka' | 'hinatazaka' {
  if (groupName?.includes('乃木坂')) return 'nogizaka';
  if (groupName?.includes('樱坂') || groupName?.includes('櫻坂')) return 'sakurazaka';
  return 'hinatazaka';
}

function extractPreview(content: string): string {
  let c = content || '';
  if (c.startsWith('---')) {
    const end = c.indexOf('---', 3);
    if (end !== -1) c = c.substring(end + 3).trim();
  }
  return c
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/#+\s/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .substring(0, 100);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  // Match "2026.03.16 21:41" or "2026-03-16 21:41" or just "2026.03.16"
  const match = dateStr.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (match) {
    const [, y, m, day, hh, mm] = match;
    // Treat as JST (UTC+9) — subtract 9h to get UTC
    const isoStr = `${y}-${m}-${day}T${hh || '00'}:${mm || '00'}:00+09:00`;
    const d = new Date(isoStr);
    const diff = Date.now() - d.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return `${m}/${day}`;
  }
  return dateStr;
}

function HeroFallback() {
  return (
    <section className="relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] tracking-tight">Sakamichi Tools</h1>
        <p className="mt-3 text-base text-[var(--text-secondary)]">坂道系列综合粉丝平台</p>
        <div className="mt-3 flex justify-center gap-1.5">
          <span className="w-8 h-0.5 rounded-full bg-[var(--color-brand-nogi)]" />
          <span className="w-8 h-0.5 rounded-full bg-[var(--color-brand-sakura)]" />
          <span className="w-8 h-0.5 rounded-full bg-[var(--color-brand-hinata)]" />
        </div>
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-primary)]" />
    </section>
  );
}

function HeroSkeleton() {
  return (
    <section className="relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
            <Pen size={14} />
            <h2 className="text-xs font-semibold uppercase tracking-wider">最新博客翻译</h2>
          </div>
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--text-tertiary)]">
            查看全部 <ArrowRight size={12} />
          </span>
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-[var(--border-primary)] animate-pulse">
          <div className="flex flex-col sm:flex-row">
            <div className="sm:w-[40%] w-full aspect-[4/3] sm:aspect-auto sm:min-h-[320px] bg-[var(--bg-tertiary)] shrink-0" />
            <div className="flex-1 flex flex-col justify-center p-6 sm:p-8 bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-5 w-16 rounded-full bg-[var(--border-secondary)]" />
                <div className="h-3 w-12 rounded bg-[var(--border-secondary)]" />
              </div>
              <div className="space-y-3 mb-4">
                <div className="h-7 w-3/4 rounded bg-[var(--border-secondary)]" />
                <div className="h-7 w-1/2 rounded bg-[var(--border-secondary)]" />
              </div>
              <div className="space-y-2 mb-6 max-w-lg">
                <div className="h-4 w-full rounded bg-[var(--border-secondary)]" />
                <div className="h-4 w-11/12 rounded bg-[var(--border-secondary)]" />
              </div>
              <div className="h-4 w-24 rounded bg-[var(--border-secondary)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomeBlogSection() {
  const [blogs, setBlogs] = useState<BlogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [contentVisible, setContentVisible] = useState(false);
  const [hasStaticHero, setHasStaticHero] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/blogs?limit=6`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.blogs) {
          const mapped = data.blogs.map((b: any) => {
            const group = mapGroup(b.group_name);
            const rawContent = b.translated_content || b.bilingual_content || '';
            const firstImg = extractFirstImage(rawContent);
            return {
              id: b.id,
              member_name: b.member || '',
              title: b.title || '',
              group,
              group_name: b.group_name || '',
              formatted_date: formatDate(b.publish_date || ''),
              preview: extractPreview(b.translated_content || ''),
              image: firstImg ? cloudinaryUrl(firstImg, 400) : null,
              hero_image: firstImg ? cloudinaryUrl(firstImg, 600) : null,
              hero_images: extractImages(rawContent, 5).map(u => cloudinaryUrl(u, 600)),
            };
          });
          setBlogs(mapped);
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('[HomeBlogSection] fetch failed:', e);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  // Auto-advance carousel
  useEffect(() => {
    if (blogs.length <= 1) return;
    const timer = setInterval(() => setCurrent(c => (c + 1) % blogs.length), 3000);
    return () => clearInterval(timer);
  }, [blogs.length]);

  // Touch swipe support (hooks must be before any early returns)
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current || blogs.length <= 1) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
    if (Math.abs(dx) > 40 && Math.abs(dx) > dy) {
      setCurrent(c => dx > 0 ? (c - 1 + blogs.length) % blogs.length : (c + 1) % blogs.length);
    }
    touchStart.current = null;
  }, [blogs.length]);

  useEffect(() => {
    setHasStaticHero(Boolean(document.getElementById('hero-static')));
  }, []);

  // Keep build-time static hero as fallback when client fetch has no displayable content
  useEffect(() => {
    const staticHero = document.getElementById('hero-static');
    if (!staticHero) return;

    if (loading || blogs.length > 0) {
      staticHero.style.display = 'none';
      return;
    }

    staticHero.style.removeProperty('display');
  }, [loading, blogs.length]);

  useEffect(() => {
    if (loading || blogs.length === 0) {
      setContentVisible(false);
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setContentVisible(true);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [loading, blogs.length]);

  // Don't render skeleton while loading — SSG static hero provides the visual content
  if (loading) return <HeroSkeleton />;

  if (blogs.length === 0) return hasStaticHero ? null : <HeroFallback />;

  return (
    <section
      className="relative overflow-hidden transition-opacity duration-500 ease-out"
      style={{ opacity: contentVisible ? 1 : 0 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
            <Pen size={14} />
            <h2 className="text-xs font-semibold uppercase tracking-wider">最新博客翻译</h2>
          </div>
          <a href="/blog" data-astro-reload className="flex items-center gap-1 text-xs font-medium text-[var(--color-brand-nogi)] hover:underline">
            查看全部 <ArrowRight size={12} />
          </a>
        </div>

        {/* Carousel card */}
        <div
          className="relative rounded-2xl overflow-hidden border border-[var(--border-primary)]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {blogs.map((blog, idx) => {
            const hex = GROUP_HEX[blog.group] || '#742581';
            const isActive = idx === current;
            return (
              <a
                key={blog.id}
                href={`/blog#blog/${blog.id}`}
                data-astro-reload
                className={`group flex flex-col sm:flex-row transition-opacity duration-700 ${isActive ? 'relative' : 'absolute inset-0'}`}
                style={{ opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none' }}
              >
                {/* Left: image */}
                <div className="sm:w-[40%] w-full aspect-[4/3] sm:aspect-auto sm:min-h-[320px] bg-[var(--bg-tertiary)] overflow-hidden shrink-0 relative">
                  {blog.hero_image ? (
                    <img
                      src={blog.hero_image}
                      alt={blog.title}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                      loading={idx < 2 ? 'eager' : 'lazy'}
                      fetchPriority={idx === 0 ? 'high' : 'auto'}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-5xl font-bold" style={{ backgroundColor: hex }}>
                      {blog.member_name.charAt(0)}
                    </div>
                  )}
                </div>
                {/* Right: text */}
                <div className="flex-1 flex flex-col justify-center p-6 sm:p-8 text-white" style={{ background: `linear-gradient(135deg, ${hex} 0%, ${hex}dd 100%)` }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/15 backdrop-blur-sm">
                      {blog.group_name}
                    </span>
                    <span className="text-xs text-white/60">{blog.formatted_date}</span>
                  </div>
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug mb-2">
                    {blog.member_name}「{blog.title}」
                  </h2>
                  <p className="text-sm text-white/70 leading-relaxed line-clamp-2 max-w-lg mb-4">
                    {blog.preview}
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-white/90 group-hover:text-white transition-colors">
                    阅读全文 <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </a>
            );
          })}
        </div>

        {/* Dot navigation */}
        {blogs.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {blogs.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: idx === current
                    ? (GROUP_HEX[blogs[idx].group] || '#666')
                    : 'var(--border-secondary)',
                  transform: idx === current ? 'scale(1.4)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
