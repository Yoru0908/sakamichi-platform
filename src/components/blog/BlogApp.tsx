/** Blog App — main entry point, view switching based on hash route */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useBlogRouter } from './useBlogRouter';
import BlogGrid from './BlogGrid';
import MemberPage from './MemberPage';
import BlogDetail from './BlogDetail';
import { GROUPS, type GroupKey, getApiBaseUrl } from './blog-config';

type TabId = 'blog' | 'stats' | 'interactions';

export default function BlogApp() {
  const { route, navigate } = useBlogRouter();
  const [activeTab, setActiveTab] = useState<TabId>('blog');
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Map route view to tab
  useEffect(() => {
    if (route.view === 'grid' || route.view === 'member' || route.view === 'detail') {
      setActiveTab('blog');
    }
  }, [route.view]);

  // Expose API base for any remaining legacy scripts
  useEffect(() => {
    (window as any).API_BASE_URL = getApiBaseUrl();
  }, []);

  const handleGroupClick = useCallback((group: string) => {
    setSearchQuery('');
    if (searchRef.current) searchRef.current.value = '';
    navigate(`#${group}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [navigate]);

  const handleTabSwitch = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'blog') {
      navigate(`#${route.group || 'all'}`);
    }
  }, [navigate, route.group]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setSearchQuery((e.target as HTMLInputElement).value.trim());
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    if (searchRef.current) searchRef.current.value = '';
  }, []);

  // Show blog detail or member page in their own layout (no top nav pills)
  if (route.view === 'detail' && route.blogId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        <BlogDetail blogId={route.blogId} onNavigate={navigate} />
      </div>
    );
  }

  if (route.view === 'member' && route.member) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        <MemberPage member={route.member} group={route.group} onNavigate={navigate} />
      </div>
    );
  }

  // Grid view with compact inline navigation (matches original layout)
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
      {/* Compact inline nav — same pattern as original */}
      <div className="blog-inline-nav">
        <h1 className="blog-page-title">坂道博客翻译</h1>
        <div className="blog-nav-toolbar">
          <div className="blog-pills-row">
            {/* Group pills */}
            <div
              className={`group-pill ${route.group === 'all' && activeTab === 'blog' ? 'active' : ''}`}
              onClick={() => { handleTabSwitch('blog'); handleGroupClick('all'); }}
            >
              全部
            </div>
            {(Object.keys(GROUPS) as GroupKey[]).map(key => (
              <div
                key={key}
                className={`group-pill ${route.group === key && activeTab === 'blog' ? 'active' : ''}`}
                onClick={() => { handleTabSwitch('blog'); handleGroupClick(key); }}
              >
                {GROUPS[key].name}
              </div>
            ))}
            <span className="blog-pills-divider" />
            {/* View pills */}
            <div
              className={`blog-pill ${activeTab === 'stats' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('stats')}
            >
              数据统计
            </div>
            <div
              className={`blog-pill ${activeTab === 'interactions' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('interactions')}
            >
              关系分析
            </div>
          </div>
          <div className="blog-nav-actions">
            <input
              ref={searchRef}
              type="text"
              placeholder="搜索成员或标题..."
              className="blog-search-input"
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        </div>
      </div>

      {/* Content area */}
      {activeTab === 'blog' && (
        <BlogGrid
          group={route.group}
          memberFilter={route.memberFilter}
          searchQuery={searchQuery}
          onClearSearch={handleClearSearch}
          onNavigate={navigate}
        />
      )}

      {activeTab === 'stats' && (
        <StatsPlaceholder />
      )}

      {activeTab === 'interactions' && (
        <InteractionsPlaceholder />
      )}
    </div>
  );
}

function StatsPlaceholder() {
  return (
    <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
      <p>数据统计功能 — 即将迁移至 React</p>
    </div>
  );
}

function InteractionsPlaceholder() {
  return (
    <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
      <p>关系分析功能 — 即将迁移至 React</p>
    </div>
  );
}
