/**
 * 现在统一使用普通博客详情页
 */

window.MemberDetail = {
  detailContainer: null,
  currentBlog: null,
  memberBlogs: [],
  
  /**
   * 初始化
   */
  init() {
    // 监听浏览器返回按钮
    window.addEventListener('popstate', (e) => {
      const container = document.getElementById('memberBlogDetailContainer');
      if (container && !container.classList.contains('hidden')) {
        this.goBack();
      }
    });
    
    // 监听ESC键返回
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const container = document.getElementById('memberBlogDetailContainer');
        if (container && !container.classList.contains('hidden')) {
          this.goBack();
        }
      }
    });
    
    // 监听双指滑动返回（触摸板）
    let touchStartX = 0;
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        touchStartX = e.touches[0].pageX;
      }
    });
    
    document.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 2) {
        const touchEndX = e.changedTouches[0].pageX;
        const container = document.getElementById('memberBlogDetailContainer');
        if (container && !container.classList.contains('hidden')) {
          if (touchEndX - touchStartX > 100) { // 右滑
            this.goBack();
          }
        }
      }
    });
  },
  
  /**
   * 显示成员博客详情页
   */
  async showMemberBlogDetail(blog, memberName, groupKey) {
    this.currentBlog = blog;
    
    // 隐藏其他视图
    document.querySelector('main').style.display = 'none';
    document.querySelector('footer').style.display = 'none';
    
    // 更新URL
    history.pushState({
      view: 'member-blog-detail',
      blog: blog,
      member: memberName,
      group: groupKey
    }, '', `#${groupKey}/member/${encodeURIComponent(memberName)}/blog/${blog.id}`);
    
    // 创建详情页容器
    let container = document.getElementById('memberBlogDetailContainer');
    if (!container) {
      container = this.createDetailContainer();
      document.body.appendChild(container);
    }
    
    // 显示容器
    container.classList.remove('hidden');
    
    // 加载成员其他博客
    await this.loadMemberBlogs(memberName, groupKey);
    
    // 渲染内容
    this.renderBlogDetail(blog, memberName, groupKey);
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  
  /**
   * 创建详情页容器
   */
  createDetailContainer() {
    const container = document.createElement('div');
    container.id = 'memberBlogDetailContainer';
    container.className = 'hidden member-blog-detail-page';
    this.detailContainer = container;
    
    container.innerHTML = `
      <style>
        .member-blog-detail-page {
          background: var(--bg-secondary);
          min-height: 100vh;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow-y: auto;
          z-index: 1000;
        }
        
        .detail-header {
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-primary);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        
        .detail-header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .detail-layout {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 20px;
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 24px;
        }
        
        @media (max-width: 768px) {
          .detail-layout {
            grid-template-columns: 1fr;
          }
          
          .detail-sidebar {
            display: none;
          }
        }
        
        .detail-content {
          background: var(--bg-primary);
          border-radius: 8px;
          padding: 32px;
          min-height: 600px;
        }
        
        .blog-detail-title {
          font-size: 28px;
          font-weight: bold;
          margin-bottom: 16px;
          line-height: 1.4;
        }
        
        .blog-detail-meta {
          display: flex;
          align-items: center;
          gap: 16px;
          color: var(--text-secondary);
          font-size: 14px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border-primary);
          margin-bottom: 32px;
        }
        
        .blog-detail-body {
          font-size: 16px;
          line-height: 1.8;
          color: var(--text-primary);
        }
        
        .blog-detail-body img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 20px 0;
        }
        
        .detail-sidebar {
          position: sticky;
          top: 80px;
          height: fit-content;
        }
        
        .sidebar-section {
          background: var(--bg-primary);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }
        
        .sidebar-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 16px;
          color: var(--text-primary);
        }
        
        .member-profile-card {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        
        .member-avatar-medium {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          overflow: hidden;
          background: var(--bg-tertiary);
        }
        
        .member-avatar-medium img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .member-info-mini {
          flex: 1;
        }
        
        .member-name-mini {
          font-size: 16px;
          font-weight: bold;
          color: var(--text-primary);
        }
        
        .member-group-mini {
          font-size: 12px;
          color: var(--text-tertiary);
        }
        
        .calendar-widget {
          margin-top: 16px;
        }
        
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
          font-size: 12px;
        }
        
        .calendar-header {
          text-align: center;
          padding: 8px 0;
          font-weight: bold;
          color: var(--text-secondary);
        }
        
        .calendar-day {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .calendar-day:hover {
          background: var(--bg-tertiary);
        }
        
        .calendar-day.has-blog {
          background: var(--bg-tertiary);
          color: var(--color-brand-nogi, #742581);
          font-weight: bold;
        }
        
        .calendar-day.today {
          background: var(--color-brand-nogi, #742581);
          color: white;
        }
        
        .recent-entries {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .recent-entry {
          padding: 12px 0;
          border-bottom: 1px solid var(--border-primary);
        }
        
        .recent-entry:last-child {
          border-bottom: none;
        }
        
        .recent-entry-date {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-bottom: 4px;
        }
        
        .recent-entry-title {
          font-size: 14px;
          color: var(--text-primary);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        .recent-entry:hover .recent-entry-title {
          color: var(--color-brand-nogi, #742581);
        }
      </style>
      
      <!-- 头部 -->
      <div class="detail-header">
        <div class="detail-header-content">
          <button onclick="MemberDetail.goBack()" class="back-button">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
            <span>返回</span>
          </button>
          
          <div id="detailBreadcrumb" style="color: var(--text-secondary); font-size: 14px;">
            <!-- 面包屑导航 -->
          </div>
        </div>
      </div>
      
      <!-- 主体布局 -->
      <div class="detail-layout">
        <!-- 左侧：博客内容 -->
        <div class="detail-content">
          <h1 id="detailBlogTitle" class="blog-detail-title">加载中...</h1>
          
          <div class="blog-detail-meta">
            <span id="detailBlogDate">-</span>
            <span>•</span>
            <span id="detailBlogMember">-</span>
          </div>
          
          <div id="detailBlogBody" class="blog-detail-body">
            <!-- 博客内容 -->
          </div>
        </div>
        
        <!-- 右侧：侧边栏 -->
        <aside class="detail-sidebar">
          <!-- 成员信息卡片 -->
          <div class="sidebar-section">
            <div class="member-profile-card">
              <div class="member-avatar-medium">
                <div id="detailMemberAvatar" style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;">
                  <span style="font-size:24px;color:#999;">M</span>
                </div>
              </div>
              <div class="member-info-mini">
                <div id="detailMemberName" class="member-name-mini">-</div>
                <div id="detailMemberGroup" class="member-group-mini">-</div>
              </div>
            </div>
            
            <!-- 日历 -->
            <div class="calendar-widget">
              <div class="sidebar-title">カレンダー</div>
              <div id="detailCalendar" class="calendar-grid">
                <!-- 日历内容 -->
              </div>
            </div>
          </div>
          
          <!-- 最近博客 -->
          <div class="sidebar-section">
            <div class="sidebar-title">NEW ENTRY</div>
            <ul id="detailRecentEntries" class="recent-entries">
              <!-- 最近博客列表 -->
            </ul>
          </div>
        </aside>
      </div>
    `;
    
    return container;
  },
  
  /**
   * 渲染博客详情
   */
  renderBlogDetail(blog, memberName, groupKey) {
    // 更新标题和元信息
    document.getElementById('detailBlogTitle').textContent = blog.title || '无标题';
    // ✅ 阶段3：直接使用预处理的 formatted_date
    const formattedDate = blog.formatted_date || blog.publish_date || '-';
    document.getElementById('detailBlogDate').textContent = formattedDate;
    document.getElementById('detailBlogMember').textContent = memberName;
    
    // 更新面包屑
    const groupNames = {
      'sakurazaka': '樱坂46',
      'hinatazaka': '日向坂46',
      'nogizaka': '乃木坂46'
    };
    const groupName = groupNames[groupKey] || groupKey;
    document.getElementById('detailBreadcrumb').innerHTML = `
      <a href="#${groupKey}" style="color: inherit;">${groupName}</a>
      <span> / </span>
      <a href="#${groupKey}/member/${encodeURIComponent(memberName)}" style="color: inherit;">${memberName}</a>
      <span> / </span>
      <span>${blog.title || '博客详情'}</span>
    `;
    
    // 渲染博客内容
    const contentEl = document.getElementById('detailBlogBody');
    if (blog.translated_content) {
      // 先提取图片URL
      let images = [];
      if (window.extractImageUrlsFromContent) {
        images = window.extractImageUrlsFromContent(blog.translated_content);
      } else if (window.extractImageUrls) {
        images = window.extractImageUrls(blog.translated_content);
      }
      
      // 使用结构化渲染器
      if (window.renderStructuredContent) {
        contentEl.innerHTML = window.renderStructuredContent(blog.translated_content, images);
      } else if (window.renderMarkdown) {
        contentEl.innerHTML = window.renderMarkdown(blog.translated_content, groupName);
      } else {
        contentEl.innerHTML = blog.translated_content.replace(/\n/g, '<br>');
      }
    } else {
      contentEl.innerHTML = '<p style="color: var(--text-tertiary);">暂无内容</p>';
    }
    
    // 更新成员信息
    this.updateMemberInfo(memberName, groupName);
    
    // 渲染日历
    this.renderCalendar(blog.publish_date);
    
    // 渲染最近博客
    this.renderRecentEntries(memberName);
  },
  
  /**
   * 更新成员信息
   */
  async updateMemberInfo(memberName, groupName) {
    document.getElementById('detailMemberName').textContent = memberName;
    document.getElementById('detailMemberGroup').textContent = groupName;
    
    // 更新头像
    const avatarEl = document.getElementById('detailMemberAvatar');
    
    // 尝试从member-images.json加载
    if (!window.memberImagesData) {
      try {
        const response = await fetch('/data/member-images.json');
        if (response.ok) {
          const data = await response.json();
          window.memberImagesData = data.images;
        }
      } catch (error) {
        console.warn('Failed to load member images:', error);
      }
    }
    
    if (window.memberImagesData && window.memberImagesData[memberName]) {
      const memberData = window.memberImagesData[memberName];
      avatarEl.innerHTML = `<img src="${memberData.imageUrl}" alt="${memberName}" style="width:100%;height:100%;object-fit:cover;">`;
    } else if (window.MemberImages) {
      const imageUrl = window.MemberImages.getImageUrl(memberName, groupName);
      avatarEl.innerHTML = `<img src="${imageUrl}" alt="${memberName}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      avatarEl.innerHTML = `<span style="font-size:24px;color:#999;">${memberName.charAt(0)}</span>`;
    }
  },
  
  /**
   * 渲染日历
   */
  renderCalendar(currentDate) {
    const calendarEl = document.getElementById('detailCalendar');
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // 获取当月第一天和最后一天
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();
    
    // 星期标题
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    let html = weekdays.map(day => `<div class="calendar-header">${day}</div>`).join('');
    
    // 填充空白日期
    for (let i = 0; i < startWeekday; i++) {
      html += '<div class="calendar-day"></div>';
    }
    
    // 填充日期
    const today = now.getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === today;
      const hasBlog = this.checkHasBlog(currentYear, currentMonth + 1, day);
      const classes = ['calendar-day'];
      if (isToday) classes.push('today');
      if (hasBlog) classes.push('has-blog');
      
      html += `<div class="${classes.join(' ')}" data-date="${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}">${day}</div>`;
    }
    
    calendarEl.innerHTML = html;
    
    // 添加点击事件
    calendarEl.querySelectorAll('.calendar-day.has-blog').forEach(dayEl => {
      dayEl.addEventListener('click', () => {
        const date = dayEl.dataset.date;
        this.loadBlogByDate(date);
      });
    });
  },
  
  /**
   * 检查某天是否有博客
   */
  checkHasBlog(year, month, day) {
    // 使用通用日期匹配（支持任意格式）
    return this.memberBlogs.some(blog => {
      if (!blog.publish_date) return false;
      const parts = window.extractDateParts ? window.extractDateParts(blog.publish_date) : null;
      return parts && parts.year === year && parts.month === month && parts.day === day;
    });
  },
  
  /**
   * 渲染最近博客
   */
  renderRecentEntries(memberName) {
    const entriesEl = document.getElementById('detailRecentEntries');
    const recentBlogs = this.memberBlogs
      .filter(blog => blog.member === memberName)
      .slice(0, 10); // 显示最近10篇
    
    if (recentBlogs.length === 0) {
      entriesEl.innerHTML = '<li style="padding: 12px 0; color: var(--text-tertiary);">暂无博客</li>';
      return;
    }
    
    entriesEl.innerHTML = recentBlogs.map(blog => `
      <li class="recent-entry">
        <a href="#blog/${blog.id}" onclick="event.preventDefault(); MemberDetail.switchToBlog(${JSON.stringify(blog).replace(/"/g, '&quot;')});" style="text-decoration: none;">
          <div class="recent-entry-date">${blog.formatted_date || blog.publish_date || '-'}</div>
          <div class="recent-entry-title">${blog.title || ''}</div>
        </a>
      </li>
    `).join('');
  },
  
  /**
   * 加载成员的所有博客
   */
  async loadMemberBlogs(memberName, groupKey) {
    try {
      const groupNames = {
        'sakurazaka': '樱坂46',
        'hinatazaka': '日向坂46',
        'nogizaka': '乃木坂46'
      };
      const groupName = groupNames[groupKey] || groupKey;
      
      const apiBase = App.config.apiBaseUrl || window.API_BASE_URL || window.API_BASE;
      const url = `${apiBase}/api/blogs?group=${encodeURIComponent(groupName)}&member=${encodeURIComponent(memberName)}&limit=${window.DETAIL_LIMIT}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success && data.blogs) {
        this.memberBlogs = data.blogs;
      }
    } catch (error) {
      console.error('加载成员博客失败:', error);
    }
  },
  
  /**
   * 切换到另一篇博客
   */
  switchToBlog(blog) {
    this.currentBlog = blog;
    this.renderBlogDetail(blog, blog.member, this.getCurrentGroupKey());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  
  /**
   * 根据日期加载博客
   */
  async loadBlogByDate(date) {
    // 使用通用日期匹配（支持任意格式比较）
    const blog = this.memberBlogs.find(b => {
      if (!b.publish_date) return false;
      return window.isSameDate ? window.isSameDate(b.publish_date, date) : b.publish_date.includes(date);
    });
    if (blog) {
      this.switchToBlog(blog);
    }
  },
  
  /**
   * 获取当前团体key
   */
  getCurrentGroupKey() {
    const hash = window.location.hash;
    if (hash.includes('nogizaka')) return 'nogizaka';
    if (hash.includes('sakurazaka')) return 'sakurazaka';
    if (hash.includes('hinatazaka')) return 'hinatazaka';
    return 'nogizaka';
  },
  
  /**
   * 返回上一页
   */
  goBack() {
    const hash = window.location.hash;
    if (hash.includes('/member/')) {
      const parts = hash.split('/');
      const group = parts[0].substring(1);
      const member = decodeURIComponent(parts[2]);
      
      // 隐藏详情页
      document.getElementById('memberBlogDetailContainer').classList.add('hidden');
      
      // 显示列表页
      document.querySelector('main').style.display = 'block';
      document.querySelector('footer').style.display = 'block';
      
      // 返回成员页面
      if (window.MemberPage) {
        window.MemberPage.showMemberPage(member, group);
      } else {
        window.location.hash = `#${group}/member/${encodeURIComponent(member)}`;
      }
    } else {
      // 返回主页
      window.location.hash = '#all';
    }
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  MemberDetail.init();
  
  // 监听详情页链接
  window.showMemberBlogDetail = (blog, member, group) => {
    MemberDetail.showMemberBlogDetail(blog, member, group);
  };
});
