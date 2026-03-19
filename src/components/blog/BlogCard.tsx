/** Blog card component — matches the existing official card style */

import { memo } from 'react';
import type { BlogItem } from './blog-api';
import { getCloudinaryUrl, getGroupColor, mapGroupName } from './blog-config';

interface Props {
  blog: BlogItem;
  index: number;
  onNavigate: (hash: string) => void;
}

function extractFirstImage(content: string | undefined): string | null {
  if (!content) return null;
  const m = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
  return m ? m[1] : null;
}

function BlogCard({ blog, index, onNavigate }: Props) {
  const imageUrl = extractFirstImage(blog.translated_content);
  const groupKey = mapGroupName(blog.group_name || '');
  const formattedDate = blog.formatted_date || blog.publish_date || '未知日期';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate(`#blog/${blog.id}`);
  };

  const handleMemberClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (blog.member) {
      onNavigate(`#${groupKey}/member/${encodeURIComponent(blog.member)}`);
    }
  };

  return (
    <a
      href={`#blog/${blog.id}`}
      className="blog-card visible"
      onClick={handleClick}
    >
      <div className="blog-card-image" style={{ position: 'relative', background: '#f5f5f5' }}>
        {imageUrl ? (
          <img
            src={getCloudinaryUrl(imageUrl, 400)}
            srcSet={`${getCloudinaryUrl(imageUrl, 400)} 400w, ${getCloudinaryUrl(imageUrl, 600)} 600w`}
            sizes="(max-width: 640px) 50vw, 300px"
            alt={blog.title}
            loading={index < 8 ? 'eager' : 'lazy'}
            fetchPriority={index < 8 ? 'high' : undefined}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              background: getGradient(blog.group_name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 48, color: 'rgba(255,255,255,0.8)', fontWeight: 300 }}>
              {(blog.member || '?').charAt(0)}
            </span>
          </div>
        )}
      </div>
      <div className="blog-card-content">
        <div className="member-name mb-2" lang="ja">
          <span
            className="member-name-link"
            style={{ cursor: 'pointer', textDecoration: 'none' }}
            onClick={handleMemberClick}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            {blog.member || '未知成员'}
          </span>
        </div>
        <div className="blog-meta mb-2">{formattedDate} {blog.group_name || ''}</div>
        <h3 className="blog-title" lang="ja">{blog.title || ''}</h3>
      </div>
    </a>
  );
}

function getGradient(groupName: string | undefined): string {
  if (!groupName) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  if (groupName.includes('乃木坂')) return 'linear-gradient(135deg, #9b4dca 0%, #6b21a8 100%)';
  if (groupName.includes('樱坂') || groupName.includes('櫻坂')) return 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)';
  if (groupName.includes('日向坂')) return 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)';
  return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
}

export default memo(BlogCard);
