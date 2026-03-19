/** Blog detail page — content + sidebar */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchBlogById, fetchMemberBlogs, fetchMemberImages, type BlogItem } from './blog-api';
import {
  getGroupDisplayName, getGroupColor, getCloudinaryUrl,
  extractDateParts, mapGroupName,
} from './blog-config';

interface Props {
  blogId: string;
  onNavigate: (hash: string) => void;
}

// ===== Content rendering =====

function removeFrontmatter(md: string): string {
  if (md.startsWith('---')) {
    const end = md.indexOf('---', 3);
    if (end !== -1) return md.substring(end + 3).trim();
  }
  return md;
}

function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  const regex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let m;
  while ((m = regex.exec(content)) !== null) urls.push(m[1]);
  return urls;
}

function renderContent(content: string): string {
  let clean = removeFrontmatter(content);
  const images = extractImageUrls(clean);

  // Handle [NEWLINE:n] and [IMAGE:n] structured tags
  if (clean.includes('[NEWLINE:') || clean.includes('[IMAGE:')) {
    // Replace [NEWLINE:n] with <br> tags
    clean = clean.replace(/\[NEWLINE:(\d+)\]/g, (_, count) => {
      return '<br>'.repeat(Math.min(parseInt(count), 3));
    });
    // Replace [IMAGE:n] with actual image tags
    clean = clean.replace(/\[IMAGE:(\d+)\]/g, (_, idx) => {
      const i = parseInt(idx);
      if (i < images.length) {
        const url = getCloudinaryUrl(images[i], 800);
        return `<div class="blog-image-wrapper"><img src="${url}" alt="" loading="lazy" onload="this.classList.add('loaded')"></div>`;
      }
      return '';
    });
    // Remove remaining markdown image syntax
    clean = clean.replace(/!\[.*?\]\(https?:\/\/[^)]+\)/g, '');
    // Bold text
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Remaining newlines
    clean = clean.replace(/\n/g, '<br>');
    return clean;
  }

  // Fallback: basic markdown rendering
  // Images
  clean = clean.replace(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, (_, alt, url) => {
    const optimized = getCloudinaryUrl(url, 800);
    return `<div class="blog-image-wrapper"><img src="${optimized}" alt="${alt}" loading="lazy" onload="this.classList.add('loaded')"></div>`;
  });
  // Bold
  clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Links
  clean = clean.replace(/\[(.*?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Headings
  clean = clean.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  clean = clean.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  // Newlines
  clean = clean.replace(/\n/g, '<br>');

  return clean;
}

// ===== Component =====

type BilingualMode = 'bilingual' | 'chinese' | 'japanese';
const MODE_LABELS: Record<BilingualMode, string> = { bilingual: '中日对照', chinese: '仅中文', japanese: '仅日文' };
const MODES: BilingualMode[] = ['bilingual', 'chinese', 'japanese'];

export default function BlogDetail({ blogId, onNavigate }: Props) {
  const [blog, setBlog] = useState<BlogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberBlogs, setMemberBlogs] = useState<BlogItem[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [bilingualMode, setBilingualMode] = useState<BilingualMode>(() => {
    try { return (localStorage.getItem('bilingualMode') as BilingualMode) || 'bilingual'; } catch { return 'bilingual'; }
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  // Persist bilingual mode
  useEffect(() => {
    try { localStorage.setItem('bilingualMode', bilingualMode); } catch {}
  }, [bilingualMode]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Load blog
  useEffect(() => {
    setLoading(true);
    setBlog(null);
    fetchBlogById(blogId)
      .then(data => {
        if (data) setBlog(data);
        else onNavigate('#all');
      })
      .catch(() => onNavigate('#all'))
      .finally(() => setLoading(false));
  }, [blogId, onNavigate]);

  // Load member blogs + avatar when blog is loaded
  useEffect(() => {
    if (!blog?.member) return;
    const groupKey = mapGroupName(blog.group_name || '');

    fetchMemberBlogs(blog.member, groupKey).then(setMemberBlogs);
    fetchMemberImages().then(images => {
      if (images[blog.member]) setAvatarUrl(images[blog.member].imageUrl);
    });
  }, [blog?.member, blog?.group_name]);

  // Scroll to top on blog change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [blogId]);

  // Left-swipe back gesture (mobile)
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = Math.abs(e.changedTouches[0].clientY - startY);
      if (dx > 80 && startX < 30 && dy < 100) window.history.back();
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto" style={{ borderColor: 'var(--color-brand-nogi)' }} />
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (!blog) return null;

  const groupKey = mapGroupName(blog.group_name || '');
  const groupName = getGroupDisplayName(blog.group_name || '');
  const groupColor = getGroupColor(groupKey);
  const formattedDate = blog.formatted_date || blog.publish_date || '未知日期';

  // Content
  const rawContent = blog.bilingual_content || blog.translated_content || '';
  const contentHtml = blog.bilingual_content
    ? rawContent
    : renderContent(typeof rawContent === 'string' ? rawContent : '');

  // Calendar
  const now = new Date();
  const calYear = now.getFullYear();
  const calMonth = now.getMonth();
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  const blogDates = new Set<number>();
  memberBlogs.forEach(b => {
    const parts = extractDateParts(b.publish_date);
    if (parts && parts.year === calYear && parts.month === calMonth + 1) {
      blogDates.add(parts.day);
    }
  });

  // Image count for download button
  const imageCount = extractImageUrls(blog.translated_content || '').length;

  // Check if content has bilingual markup (p[lang] tags)
  const hasBilingualContent = !!blog.bilingual_content;

  return (
    <div>
      {/* Back button bar + bilingual desktop selector */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <div className="flex items-center gap-4">
          {/* Desktop bilingual selector */}
          {hasBilingualContent && (
            <div ref={selectorRef} className={`language-selector${dropdownOpen ? ' open' : ''}`}>
              <button className={`selector-button${dropdownOpen ? ' open' : ''}`} onClick={(e) => { e.stopPropagation(); setDropdownOpen(d => !d); }}>
                <span>{MODE_LABELS[bilingualMode]}</span>
                <svg className="selector-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <div className="dropdown-menu">
                {MODES.map(mode => (
                  <div key={mode} className={`dropdown-item${mode === bilingualMode ? ' selected' : ''}`} onClick={() => { setBilingualMode(mode); setDropdownOpen(false); }}>
                    <span>{MODE_LABELS[mode]}</span>
                    {mode === bilingualMode && <svg className="check-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <a href={`#${groupKey}`} onClick={e => { e.preventDefault(); onNavigate(`#${groupKey}`); }} style={{ color: 'inherit' }}>{groupName}</a>
            <span> / </span>
            <a href={`#${groupKey}/member/${encodeURIComponent(blog.member)}`} onClick={e => { e.preventDefault(); onNavigate(`#${groupKey}/member/${encodeURIComponent(blog.member)}`); }} style={{ color: 'inherit' }}>{blog.member}</a>
          </div>
        </div>
      </div>

      {/* Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }} className="blog-detail-layout">
        {/* Article */}
        <article style={{ background: 'var(--bg-primary)', padding: 32, borderRadius: 8 }}>
          <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{blog.title}</h1>
            <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-medium">{blog.member}</span>
              <span>·</span>
              <span>{formattedDate}</span>
              <span>·</span>
              <span>{groupName}</span>
            </div>
          </header>

          <div
            ref={contentRef}
            className={`blog-content-official blog-detail-body${bilingualMode === 'chinese' ? ' mode-chinese' : bilingualMode === 'japanese' ? ' mode-japanese' : ''}`}
            style={{ fontSize: 16, lineHeight: 1.8, color: 'var(--text-primary)' }}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          <footer className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border-primary)' }}>
            {blog.original_url && (
              <a href={blog.original_url} target="_blank" rel="noopener noreferrer" className="more-btn">查看原文</a>
            )}
          </footer>
        </article>

        {/* Mobile FAB for bilingual mode */}
        <div className={`fab-overlay${fabOpen ? ' show' : ''}`} onClick={() => setFabOpen(false)} />
        <div className={`fab-container${fabOpen ? ' open' : ''}`}>
          {[...MODES].reverse().map(mode => (
            <div key={mode} className="fab-action" data-mode={mode}>
              <span className="fab-label">{MODE_LABELS[mode]}</span>
              <button
                className={`fab-button fab-lang${mode === bilingualMode ? ' active' : ''}`}
                onClick={() => { setBilingualMode(mode); setFabOpen(false); }}
                style={mode === bilingualMode ? { borderColor: '#3b82f6', background: 'rgba(59,130,246,0.1)' } : {}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  {mode === bilingualMode
                    ? <polyline points="20 6 9 17 4 12" />
                    : <circle cx="12" cy="12" r="10" />
                  }
                </svg>
              </button>
            </div>
          ))}
          <button className={`fab-main${fabOpen ? ' open' : ''}`} onClick={() => setFabOpen(f => !f)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
              <path d="M10 8h4M8 12h8M10 16h4" />
            </svg>
          </button>
        </div>

        {/* Sidebar */}
        <aside className="blog-detail-sidebar" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
          {/* Member card */}
          <div className="sidebar-card" style={{ padding: 24, marginBottom: 20, textAlign: 'center' }}>
            <div style={{
              width: 240, height: 300, overflow: 'hidden', background: 'var(--bg-tertiary)',
              margin: '0 auto 16px',
              clipPath: 'polygon(0 0, 100% 0, 100% 80%, 75% 100%, 0 100%)',
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={blog.member} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: 'var(--text-tertiary)' }}>
                  {blog.member.charAt(0)}
                </div>
              )}
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4, color: 'var(--text-primary)' }}>{blog.member}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{groupName}</p>
          </div>

          {/* Calendar */}
          <div className="sidebar-card" style={{ padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 16, color: 'var(--text-primary)' }}>カレンダー</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 12 }}>
              {weekdays.map(d => (
                <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{d}</div>
              ))}
              {Array.from({ length: startWeekday }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isToday = day === now.getDate();
                const hasBlog = blogDates.has(day);
                return (
                  <div
                    key={day}
                    onClick={() => {
                      if (!hasBlog) return;
                      const target = memberBlogs.find(b => {
                        const parts = extractDateParts(b.publish_date);
                        return parts && parts.year === calYear && parts.month === calMonth + 1 && parts.day === day;
                      });
                      if (target) onNavigate(`#blog/${target.id}`);
                    }}
                    style={{
                      aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, cursor: hasBlog ? 'pointer' : 'default',
                      background: isToday ? groupColor : hasBlog ? 'var(--bg-tertiary)' : 'transparent',
                      color: isToday ? '#fff' : hasBlog ? groupColor : 'var(--text-primary)',
                      fontWeight: hasBlog || isToday ? 'bold' : 'normal',
                    }}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent entries */}
          <div className="sidebar-card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 16, color: 'var(--text-primary)' }}>NEW ENTRY</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {memberBlogs.slice(0, 10).map(b => (
                <li
                  key={b.id}
                  style={{
                    padding: '12px 0', borderBottom: '1px solid var(--border-primary)', cursor: 'pointer',
                    ...(b.id === blogId ? { background: 'var(--bg-tertiary)', marginInline: -8, paddingInline: 8, borderRadius: 4 } : {}),
                  }}
                  onClick={() => onNavigate(`#blog/${b.id}`)}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    {b.formatted_date || b.publish_date}
                  </div>
                  <div style={{
                    fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {b.title}
                  </div>
                </li>
              ))}
            </ul>
            {memberBlogs.length > 10 && (
              <div style={{ marginTop: 16 }}>
                <a
                  href={`#${groupKey}/member/${encodeURIComponent(blog.member)}`}
                  onClick={e => { e.preventDefault(); onNavigate(`#${groupKey}/member/${encodeURIComponent(blog.member)}`); }}
                  style={{
                    display: 'block', color: '#fff', background: '#9dccb5',
                    fontSize: 14, height: 45, lineHeight: '45px', textAlign: 'center',
                    borderRadius: 5, textDecoration: 'none',
                  }}
                >
                  もっと見る
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .blog-detail-layout { grid-template-columns: 1fr !important; }
          .blog-detail-sidebar { position: static !important; order: -1; }
        }
        .blog-detail-body img { max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0; }
        .blog-detail-body .blog-image-wrapper { background: #f5f5f5; border-radius: 8px; min-height: 200px; overflow: hidden; position: relative; }
        .blog-detail-body .blog-image-wrapper img { width: 100%; height: auto; display: block; opacity: 0; transition: opacity 0.3s ease-in; }
        .blog-detail-body .blog-image-wrapper img.loaded { opacity: 1; }
      `}</style>
    </div>
  );
}
