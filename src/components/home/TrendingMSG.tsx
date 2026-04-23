import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Image, Video, Mic, ArrowRight } from 'lucide-react';
import { GROUP_COLORS, relativeTime } from '@/utils/mock-data';
import { getOptimizedAvatarUrl } from '@/components/messages/msg-styles';

const ARCHIVE_API_BASE = 'https://api.46log.com/api/archive';

const SITE_TO_GROUP: Record<string, string> = {
  nogizaka: 'nogizaka',
  sakurazaka: 'sakurazaka',
  hinatazaka: 'hinatazaka',
};

interface ArchiveMessage {
  id: number;
  message_id: string;
  site: string;
  group_name: string;
  member_name: string;
  type: string;
  text: string | null;
  translated_text: string | null;
  media_url: string | null;
  published_at: string;
}

function getTypeIcon(type: string) {
  if (type === 'picture') return <Image size={10} className="inline mr-0.5" />;
  if (type === 'video') return <Video size={10} className="inline mr-0.5" />;
  if (type === 'voice') return <Mic size={10} className="inline mr-0.5" />;
  return null;
}

function getPreview(msg: ArchiveMessage): string {
  if (msg.translated_text) return msg.translated_text;
  if (msg.text) return msg.text;
  const typeLabels: Record<string, string> = { picture: '图片消息', video: '视频消息', voice: '语音消息' };
  return typeLabels[msg.type] || '消息';
}

export default function TrendingMSG() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [msgs, setMsgs] = useState<ArchiveMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch real data from archive API
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${ARCHIVE_API_BASE}/recent?limit=8`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.success && data.messages) {
          setMsgs(data.messages);
        } else {
          setError('unexpected response');
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          console.error('[TrendingMSG] Failed to fetch:', e);
          setError(e.message || 'fetch failed');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  // Slow marquee auto-scroll (desktop only)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || msgs.length === 0) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    if (prefersReduced || isMobile) return;

    let raf: number;
    let lastTime = 0;
    const speed = 0.3; // px per frame (~18px/s at 60fps)

    const step = (time: number) => {
      if (!paused && lastTime) {
        const delta = time - lastTime;
        el.scrollLeft += speed * (delta / 16);
        // Loop back when reaching end
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 1) {
          el.scrollLeft = 0;
        }
      }
      lastTime = time;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused, msgs]);

  // Show error hint if fetch failed (helps debug)
  if (!loading && msgs.length === 0) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
          <MessageCircle size={14} />
          <h2 className="text-xs font-semibold uppercase tracking-wider">最新MSG</h2>
          {error && <span className="text-[10px] text-red-400 ml-2">[{error}]</span>}
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
          <MessageCircle size={14} />
          <h2 className="text-xs font-semibold uppercase tracking-wider">最新MSG</h2>
        </div>
        <a
          href="/messages"
          className="flex items-center gap-1 text-xs font-medium text-[var(--color-brand-hinata)] hover:underline"
        >
          查看全部 <ArrowRight size={12} />
        </a>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-none w-[280px] sm:w-[300px] p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                <div className="flex-1">
                  <div className="h-3 w-20 bg-[var(--bg-tertiary)] rounded animate-pulse mb-1" />
                  <div className="h-2 w-12 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
              </div>
              <div className="h-10 bg-[var(--bg-tertiary)] rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory sm:snap-none"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          {msgs.map((msg) => {
            const groupKey = SITE_TO_GROUP[msg.site] || 'hinatazaka';
            return (
              <a
                key={msg.id}
                href={`/messages?member=${encodeURIComponent(msg.member_name)}`}
                className="flex-none w-[280px] sm:w-[300px] snap-start p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-[var(--border-secondary)] transition-colors duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={getOptimizedAvatarUrl(msg.member_name, 80)}
                    alt=""
                    className="w-8 h-8 rounded-full shrink-0 object-cover"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      if (!img.dataset.fb) {
                        img.dataset.fb = '1';
                        // Fallback to colored circle
                        const parent = img.parentElement;
                        if (parent) {
                          const div = document.createElement('div');
                          div.className = 'w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold';
                          div.style.backgroundColor = GROUP_COLORS[groupKey] || 'var(--color-brand-hinata)';
                          div.textContent = msg.member_name.charAt(0);
                          img.replaceWith(div);
                        }
                      }
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {msg.member_name}
                    </p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">
                      {relativeTime(msg.published_at)}
                    </p>
                  </div>
                </div>

                {/* MSG bubble */}
                <div className="bg-[var(--bg-secondary)] rounded-lg rounded-tl-none px-3 py-2 mb-2">
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                    {getTypeIcon(msg.type)}
                    {getPreview(msg)}
                  </p>
                </div>

                {/* MSG image thumbnail */}
                {msg.type === 'picture' && msg.media_url && (
                  <div className="w-full aspect-[4/3] rounded-lg overflow-hidden mb-2 bg-[var(--bg-tertiary)]">
                    <img
                      src={msg.media_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
                  <span className="text-[10px]">{msg.group_name}</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
