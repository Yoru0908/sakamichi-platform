/** Member page — avatar, calendar, blog list */

import { useState, useEffect, useCallback } from 'react';
import BlogCard from './BlogCard';
import { fetchMemberBlogs, fetchMemberImages, fetchGroupMembers, type BlogItem, type GroupMembersData } from './blog-api';
import { getGroupDisplayName, getGroupColor, extractDateParts } from './blog-config';

interface Props {
  member: string;
  group: string;
  onNavigate: (hash: string) => void;
}

export default function MemberPage({ member, group, onNavigate }: Props) {
  const [blogs, setBlogs] = useState<BlogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const groupName = getGroupDisplayName(group);
  const groupColor = getGroupColor(group);

  // Load member blogs
  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchMemberBlogs(member, group)
      .then(data => setBlogs(data))
      .catch(err => console.error('[MemberPage] 加载失败:', err))
      .finally(() => setLoading(false));
  }, [member, group]);

  // Load avatar
  useEffect(() => {
    fetchMemberImages().then(images => {
      if (images[member]) {
        setAvatarUrl(images[member].imageUrl);
      }
    });
  }, [member]);

  // Calendar data
  const now = new Date();
  const calYear = now.getFullYear();
  const calMonth = now.getMonth();
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const blogDates = new Set<number>();
  blogs.forEach(b => {
    const parts = extractDateParts(b.publish_date);
    if (parts && parts.year === calYear && parts.month === calMonth + 1) {
      blogDates.add(parts.day);
    }
  });

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  // Pagination
  const paginatedBlogs = blogs.slice(0, page * perPage);
  const hasMore = paginatedBlogs.length < blogs.length;

  const handleBack = useCallback(() => {
    onNavigate(`#${group}`);
  }, [group, onNavigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto" style={{ borderColor: groupColor }} />
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm mb-4 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回{groupName}
        </button>
      </div>

      {/* Layout: content + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }} className="member-page-layout">
        {/* Left: blog list */}
        <div>
          <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
            {member} 的博客 <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>({blogs.length}篇)</span>
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {paginatedBlogs.map((blog, i) => (
              <BlogCard key={blog.id} blog={blog} index={i} onNavigate={onNavigate} />
            ))}
          </div>

          {paginatedBlogs.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
              暂无博客
            </div>
          )}

          {hasMore && (
            <div className="text-center mt-8">
              <button
                onClick={() => setPage(p => p + 1)}
                className="px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                加载更多
              </button>
            </div>
          )}
        </div>

        {/* Right: sidebar */}
        <aside className="member-page-sidebar" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
          {/* Member info card */}
          <div className="sidebar-card" style={{ padding: 24, marginBottom: 20, textAlign: 'center' }}>
            <div style={{
              width: 120, height: 120, borderRadius: '50%', overflow: 'hidden',
              background: 'var(--bg-tertiary)', margin: '0 auto 16px',
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={member} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: 'var(--text-tertiary)' }}>
                  {member.charAt(0)}
                </div>
              )}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: 4 }}>{member}</h3>
            <p style={{ fontSize: 13, color: groupColor }}>{groupName}</p>
          </div>

          {/* Calendar */}
          <div className="sidebar-card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 16, color: 'var(--text-primary)' }}>カレンダー</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 12 }}>
              {weekdays.map(d => (
                <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{d}</div>
              ))}
              {Array.from({ length: startWeekday }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isToday = day === now.getDate();
                const hasBlog = blogDates.has(day);
                return (
                  <div
                    key={day}
                    onClick={() => {
                      if (!hasBlog) return;
                      const target = blogs.find(b => {
                        const parts = extractDateParts(b.publish_date);
                        return parts && parts.year === calYear && parts.month === calMonth + 1 && parts.day === day;
                      });
                      if (target) onNavigate(`#blog/${target.id}`);
                    }}
                    style={{
                      aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, cursor: hasBlog ? 'pointer' : 'default',
                      background: isToday ? (groupColor || 'var(--color-brand-nogi)') : hasBlog ? 'var(--bg-tertiary)' : 'transparent',
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
          <div className="sidebar-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 16, color: 'var(--text-primary)' }}>NEW ENTRY</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {blogs.slice(0, 10).map(blog => (
                <li
                  key={blog.id}
                  style={{ padding: '12px 0', borderBottom: '1px solid var(--border-primary)', cursor: 'pointer' }}
                  onClick={() => onNavigate(`#blog/${blog.id}`)}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    {blog.formatted_date || blog.publish_date}
                  </div>
                  <div style={{
                    fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {blog.title}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Mobile sidebar responsive — show member card + calendar above blog list */}
      <style>{`
        @media (max-width: 768px) {
          .member-page-layout { grid-template-columns: 1fr !important; }
          .member-page-sidebar { position: static !important; order: -1; }
        }
      `}</style>
    </div>
  );
}
