/**
 * 博客详情页侧边栏模块
 * 处理成员头像、日历和最新博客
 */

window.BlogDetailSidebar = {
  initialized: false,
  isInitializing: false,
  currentBlog: null,
  memberBlogs: [],

  /**
   * 初始化侧边栏
   */
  async init(blog) {
    if (!blog) return;

    // 防止重复初始化
    if (this.isInitializing) {
      console.warn('[BlogDetailSidebar] 已经在初始化中，跳过重复调用');
      return;
    }

    this.isInitializing = true;
    this.currentBlog = blog;
    console.log('[BlogDetailSidebar] 🎯 开始初始化侧边栏:', blog.member, blog.group_name);

    // 延迟一下确保DOM已经创建
    await new Promise(resolve => setTimeout(resolve, 100));

    // 确保容器存在
    const avatarEl = document.getElementById('detailMemberAvatar');
    const calendarEl = document.getElementById('detailCalendarDates');
    const entriesEl = document.getElementById('detailNewEntries');

    if (!avatarEl) {
      console.warn('[BlogDetailSidebar] 头像元素未找到');
    }
    if (!calendarEl) {
      console.warn('[BlogDetailSidebar] 日历元素未找到');
    }
    if (!entriesEl) {
      console.warn('[BlogDetailSidebar] 博客列表元素未找到');
    }

    // 清空现有内容
    if (avatarEl) avatarEl.innerHTML = '';
    if (calendarEl) calendarEl.innerHTML = '';
    if (entriesEl) entriesEl.innerHTML = '';

    try {
      // 并行加载所有数据
      await Promise.all([
        this.loadMemberAvatar(blog),
        this.loadMemberBlogs(blog)
      ]);

      this.initialized = true;
      console.log('[BlogDetailSidebar] ✅ 初始化完成');
      
      // 强制重新计算sticky定位
      this.refreshStickyPosition();
    } catch (error) {
      console.error('[BlogDetailSidebar] ❌ 初始化失败:', error);
    } finally {
      this.isInitializing = false;
    }
  },

  /**
   * 刷新sticky定位
   * 解决初次加载时sticky不生效的问题
   */
  refreshStickyPosition() {
    const sidebar = document.querySelector('.member-sidebar-detail');
    if (!sidebar) {
      console.warn('[BlogDetailSidebar] 侧边栏元素未找到');
      return;
    }

    console.log('[BlogDetailSidebar] 刷新sticky定位');
    
    // 方法1: 强制重排
    const originalPosition = sidebar.style.position;
    sidebar.style.position = 'relative';
    void sidebar.offsetHeight; // 触发重排
    sidebar.style.position = originalPosition || 'sticky';
    
    // 方法2: 确保top值正确应用
    if (!sidebar.style.top || sidebar.style.top === '') {
      sidebar.style.top = '80px';
    }
    
    // 方法3: 触发滚动事件让浏览器重新计算sticky
    setTimeout(() => {
      window.scrollBy(0, 1);
      window.scrollBy(0, -1);
    }, 100);
    
    console.log('[BlogDetailSidebar] Sticky定位已刷新:', {
      position: sidebar.style.position,
      top: sidebar.style.top,
      height: sidebar.offsetHeight
    });
  },
  
  /**
   * 加载成员头像（使用与个人页相同的方式）
   */
  async loadMemberAvatar(blog) {
    const avatarEl = document.getElementById('detailMemberAvatar');
    if (!avatarEl) return;

    console.log('[BlogDetailSidebar] 加载成员头像:', blog.member, '团体:', blog.group_name);

    try {
      // 方式1：先尝试从member-images.json加载（与个人页相同）
      const response = await fetch('data/member-images.json');
      if (response.ok) {
        const data = await response.json();

        // 智能匹配：处理带空格/不带空格的名字变体，优先使用真实图片
        let memberData = null;

        // 1. 直接匹配
        if (data.images && data.images[blog.member]) {
          memberData = data.images[blog.member];
        }

        // 2. 如果是占位图或未找到，尝试无空格版本
        if (!memberData || memberData.imageUrl.includes('ui-avatars.com')) {
          const nameWithoutSpaces = blog.member.replace(/\s+/g, '');
          if (data.images[nameWithoutSpaces] && !data.images[nameWithoutSpaces].imageUrl.includes('ui-avatars.com')) {
            memberData = data.images[nameWithoutSpaces];
            console.log('[BlogDetailSidebar] 使用无空格名字匹配:', nameWithoutSpaces);
          }
        }

        // 3. 如果无空格版本也是占位图，尝试有空格版本
        if (!memberData || memberData.imageUrl.includes('ui-avatars.com')) {
          const nameWithSpaces = blog.member.replace(/(.)/g, '$1 ').trim();
          if (data.images[nameWithSpaces] && !data.images[nameWithSpaces].imageUrl.includes('ui-avatars.com')) {
            memberData = data.images[nameWithSpaces];
            console.log('[BlogDetailSidebar] 使用有空格名字匹配:', nameWithSpaces);
          }
        }

        if (memberData && !memberData.imageUrl.includes('ui-avatars.com')) {
          console.log('[BlogDetailSidebar] ✅ 从member-images.json加载真实头像:', memberData.imageUrl);
          avatarEl.innerHTML = `<img src="${memberData.imageUrl}" alt="${blog.member}" style="width:100%;height:100%;object-fit:cover;object-position:center;">`;
          return;
        } else {
          console.warn('[BlogDetailSidebar] ⚠️ 只找到占位图，尝试其他方式');
        }
      }

      // 方式2：使用MemberImages生成的URL（需要传递中文团体名称）
      if (window.MemberImages) {
        // 获取中文团体显示名称，增强兼容性
        let groupDisplayName = blog.group_name;

        // 如果 getChineseGroupName 函数存在，使用它
        if (window.getChineseGroupName) {
          groupDisplayName = window.getChineseGroupName(blog.group_name);
          console.log('[BlogDetailSidebar] 使用 getChineseGroupName 转换:', blog.group_name, '→', groupDisplayName);
        }
        // 兜底：手动映射
        else {
          const manualMap = {
            'nogizaka': '乃木坂46',
            'sakurazaka': '樱坂46',
            'hinatazaka': '日向坂46'
          };
          const lowerGroupName = (blog.group_name || '').toLowerCase();
          if (manualMap[lowerGroupName]) {
            groupDisplayName = manualMap[lowerGroupName];
            console.log('[BlogDetailSidebar] 使用手动映射转换:', blog.group_name, '→', groupDisplayName);
          } else {
            console.warn('[BlogDetailSidebar] 无法转换团体名称，使用原值:', blog.group_name);
          }
        }

        const imageUrl = window.MemberImages.getImageUrl(blog.member, groupDisplayName);
        console.log('[BlogDetailSidebar] 使用MemberImages生成头像 URL:', imageUrl);
        avatarEl.innerHTML = `<img src="${imageUrl}" alt="${blog.member}" style="width:100%;height:100%;object-fit:cover;object-position:center;">`;
        return;
      }

      // 方式3：使用默认头像
      console.warn('[BlogDetailSidebar] 所有方式失败，使用默认头像');
      this.setDefaultAvatar(avatarEl, blog.member);
    } catch (error) {
      console.error('[BlogDetailSidebar] 加载头像失败:', error);
      this.setDefaultAvatar(avatarEl, blog.member);
    }
  },
  
  /**
   * 设置默认头像
   */
  setDefaultAvatar(element, memberName) {
    const firstChar = memberName.charAt(0);
    element.innerHTML = `<span style="font-size:36px;color:#999;">${firstChar}</span>`;
  },
  
  /**
   * 加载成员博客列表
   */
  async loadMemberBlogs(blog) {
    try {
      // 使用统一的 API 配置
      const apiBase = App.config.apiBaseUrl || window.API_BASE_URL || window.API_BASE;
      const groupName = encodeURIComponent(blog.group_name);
      const memberName = encodeURIComponent(blog.member);
      
      const response = await fetch(`${apiBase}/api/blogs?group=${groupName}&member=${memberName}&limit=${window.SIDEBAR_LIMIT}`);
      const data = await response.json();
      
      if (data.success && data.blogs) {
        // ✨ 数据源处理：统一格式化日期
        const processedBlogs = window.processBlogsData 
          ? window.processBlogsData(data.blogs) 
          : data.blogs;
        this.memberBlogs = processedBlogs;

        // 渲染NEW ENTRY
        this.renderNewEntries(processedBlogs.slice(0, 5));

        // 渲染日历
        this.renderCalendar(processedBlogs);

        // 设置 View More 链接
        this.setupViewMoreLink(blog);
      }
    } catch (error) {
      console.error('[BlogDetailSidebar] 加载博客列表失败:', error);
      this.renderEmptyState();
    }
  },
  
  /**
   * 设置 View More 链接
   */
  setupViewMoreLink(blog) {
    const viewMoreLink = document.getElementById('viewMoreLink');
    if (!viewMoreLink) {
      console.warn('[BlogDetailSidebar] viewMoreLink 元素未找到');
      return;
    }

    // 将团体名称转换为 URL key
    const groupKeyMap = {
      '乃木坂46': 'nogizaka',
      '樱坂46': 'sakurazaka',
      '日向坂46': 'hinatazaka'
    };

    let groupKey = groupKeyMap[blog.group_name];

    // 如果映射不存在,尝试小写化处理
    if (!groupKey) {
      const lowerGroupName = (blog.group_name || '').toLowerCase();
      if (lowerGroupName.includes('nogizaka') || lowerGroupName.includes('乃木坂')) {
        groupKey = 'nogizaka';
      } else if (lowerGroupName.includes('sakurazaka') || lowerGroupName.includes('樱坂')) {
        groupKey = 'sakurazaka';
      } else if (lowerGroupName.includes('hinatazaka') || lowerGroupName.includes('日向坂')) {
        groupKey = 'hinatazaka';
      } else {
        groupKey = blog.group_name.toLowerCase();
      }
    }

    // 设置链接
    const memberName = encodeURIComponent(blog.member);
    viewMoreLink.href = `#${groupKey}/member/${memberName}`;

    console.log(`[BlogDetailSidebar] 设置 View More 链接: #${groupKey}/member/${memberName}`);
  },

  /**
   * 渲染最新博客列表
   */
  renderNewEntries(blogs) {
    const entriesEl = document.getElementById('detailNewEntries');
    if (!entriesEl) return;

    if (blogs.length === 0) {
      entriesEl.innerHTML = '<li style="padding: 8px 0; color: var(--text-tertiary); font-size: 12px;">暂无博客</li>';
      return;
    }

    entriesEl.innerHTML = blogs.map(blog => {
      // 从translated_content中提取第一张图片
      let thumbnailUrl = '';
      if (blog.translated_content) {
        const imageMatch = blog.translated_content.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
        if (imageMatch && imageMatch[1]) {
          thumbnailUrl = imageMatch[1];
        }
      }

      // 如果没有找到图片,使用默认渐变背景
      const thumbnailStyle = thumbnailUrl
        ? `background-image: url('${thumbnailUrl}'); background-size: cover; background-position: center;`
        : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);';

      return `
      <li style="padding: 8px 0; border-bottom: 1px solid var(--border-primary);">
        <a href="#blog/${blog.id}" onclick="event.preventDefault(); if(window.Router) Router.navigate('#blog/${blog.id}'); return false;" style="text-decoration: none; color: inherit; display: flex; align-items: center; gap: 12px; cursor: pointer;">
          <div style="width: 80px; height: 80px; border-radius: 5px; overflow: hidden; flex-shrink: 0; ${thumbnailStyle}"></div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 10px; color: var(--text-tertiary); margin-bottom: 4px;">${blog.formatted_date || blog.publish_date || '-'}</div>
            <div style="font-size: 12px; color: var(--text-primary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${blog.title || ''}
            </div>
          </div>
        </a>
      </li>
    `;
    }).join('');
  },
  
  /**
   * 渲染日历
   */
  renderCalendar(blogs) {
    const calendarEl = document.getElementById('detailCalendarDates');
    if (!calendarEl) return;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    // 获取当月有博客的日期（使用通用日期工具）
    const blogDates = new Set();
    
    blogs.forEach(blog => {
      if (blog.publish_date && window.isInMonth && window.isInMonth(blog.publish_date, currentYear, currentMonth)) {
        const parts = window.extractDateParts(blog.publish_date);
        if (parts) {
          blogDates.add(parts.day);
        }
      }
    });
    
    // 生成日历
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();
    
    let html = '<div class="calendar-days">';
    
    // 添加星期标题（日文）
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    weekdays.forEach(day => {
      html += `<div class="calendar-weekday">${day}</div>`;
    });
    
    // 空白占位
    for (let i = 0; i < startWeekday; i++) {
      html += '<div class="calendar-day-empty"></div>';
    }
    
    // 日期
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === today.getDate();
      const hasBlog = blogDates.has(day);
      
      // 使用CSS类而不是内联样式
      let classes = 'calendar-day-cell';
      if (isToday) classes += ' is-today';
      if (hasBlog) classes += ' has-blog';
      
      if (hasBlog) {
        // 使用通用日期匹配（支持任意格式）
        const targetBlog = blogs.find(b => {
          if (!b.publish_date) return false;
          const parts = window.extractDateParts(b.publish_date);
          return parts && parts.year === currentYear && parts.month === currentMonth && parts.day === day;
        });
        if (targetBlog) {
          html += `<div class="${classes}" onclick="if(window.Router) Router.navigate('#blog/${targetBlog.id}');" style="cursor: pointer;">${day}</div>`;
        } else {
          html += `<div class="${classes}">${day}</div>`;
        }
      } else {
        html += `<div class="${classes}">${day}</div>`;
      }
    }
    
    html += '</div>';
    calendarEl.innerHTML = html;
  },
  
  /**
   * 渲染空状态
   */
  renderEmptyState() {
    const entriesEl = document.getElementById('detailNewEntries');
    if (entriesEl) {
      entriesEl.innerHTML = '<li style="padding: 8px 0; color: var(--text-tertiary); font-size: 12px;">暂无博客</li>';
    }
    
    const calendarEl = document.getElementById('detailCalendarDates');
    if (calendarEl) {
      calendarEl.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); font-size: 12px; padding: 20px;">暂无日历数据</div>';
    }
  }
};
