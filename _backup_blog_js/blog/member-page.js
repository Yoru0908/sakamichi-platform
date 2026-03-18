/**
 * 成员页面模块
 * 处理成员独立页面的显示和交互
 */

window.MemberPage = {
  // 成员数据
  memberImages: null,
  memberBlogs: [],
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,

  /**
   * 初始化成员页面
   */
  init() {
    // 创建成员页面容器
    this.createMemberPageContainer();

    // 加载成员图片数据
    this.loadMemberImages();

    // 不再监听hashchange，由Router统一处理
    console.log('[MemberPage] 初始化完成');
  },

  /**
   * 加载成员图片数据
   */
  async loadMemberImages() {
    try {
      const response = await fetch('data/member-images.json');
      if (response.ok) {
        const data = await response.json();
        this.memberImages = data.images;
        console.log('✅ 成员图片数据加载成功');
      }
    } catch (error) {
      console.warn('⚠️ 成员图片数据加载失败，将使用默认头像');
    }
  },

  /**
   * 创建成员页面容器
   */
  createMemberPageContainer() {
    // 检查是否已存在
    if (document.getElementById('memberPageContainer')) return;

    // 创建容器
    const container = document.createElement('div');
    container.id = 'memberPageContainer';
    container.className = 'hidden member-page-nogizaka-style';
    container.innerHTML = `
      <!-- 仿乃木坂官网风格布局 -->
      <style>
        .member-page-nogizaka-style {
          background: var(--bg-secondary);
          min-height: 100vh;
          padding: 0;
        }
        
        .member-page-layout {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 32px;
        }
        
        @media (max-width: 768px) {
          .member-page-layout {
            grid-template-columns: 1fr;
          }
          
          .member-sidebar {
            display: none;
          }
        }
        
        .member-main-content {
          background: var(--bg-primary);
          border-radius: 8px;
          padding: 24px;
        }
        
        .member-sidebar {
          position: sticky;
          top: 80px;
          max-height: calc(100vh - 100px);
          overflow-y: auto;
          align-self: start;
          scrollbar-width: thin;
          scrollbar-color: rgba(126,87,194,0.3) transparent;
        }
        
        .member-sidebar::-webkit-scrollbar {
          width: 4px;
        }
        
        .member-sidebar::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .member-sidebar::-webkit-scrollbar-thumb {
          background: rgba(126,87,194,0.3);
          border-radius: 2px;
        }
        
        .member-sidebar::-webkit-scrollbar-thumb:hover {
          background: rgba(126,87,194,0.5);
        }
        
        .sidebar-card {
          background: var(--bg-primary);
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 20px;
          text-align: center;
        }
        
        .member-avatar-sidebar {
          width: 240px;
          height: 300px;
          overflow: hidden;
          background: var(--bg-tertiary);
          margin: 0 auto 20px;
          clip-path: polygon(0 0, 100% 0, 100% 80%, 75% 100%, 0 100%);
        }
        
        .member-avatar-sidebar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .member-name-sidebar {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 4px;
          color: var(--text-primary);
        }
        
        .member-kana-sidebar {
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }
        
        .profile-link {
          display: inline-block;
          padding: 8px 24px;
          background: #7e57c2;
          color: white;
          border-radius: 20px;
          text-decoration: none;
          font-size: 14px;
          transition: background 0.3s;
        }
        
        .profile-link:hover {
          background: #6a4ca5;
        }
        
        .calendar-section {
          background: var(--bg-primary);
          border-radius: 8px;
          padding: 20px;
        }
        
        .calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          font-size: 16px;
          font-weight: bold;
        }
        
        /* 日历样式已移至 calendar-component.css */
        
        .back-button {
          margin-bottom: 20px;
          padding: 8px 16px;
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          background: var(--bg-primary);
          color: var(--text-secondary);
          font-size: 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        
        .back-button:hover {
          background: var(--bg-tertiary);
        }
        
        .blog-list-header {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 24px;
          color: var(--text-primary);
        }
        
        .blog-list-nogizaka {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .blog-list-item {
          padding: 20px 0;
          border-bottom: 1px solid var(--border-primary);
          transition: background 0.2s;
        }
        
        .blog-list-item:hover {
          background: var(--bg-secondary);
        }
        
        .blog-list-item:last-child {
          border-bottom: none;
        }
        
        .blog-list-link {
          display: block;
          text-decoration: none;
          color: inherit;
        }
        
        .blog-list-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
          line-height: 1.5;
        }
        
        .blog-list-meta {
          display: flex;
          align-items: center;
          gap: 16px;
          color: var(--text-secondary);
          font-size: 14px;
        }
        
        .blog-list-date {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .blog-list-excerpt {
          margin-top: 12px;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.6;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      </style>
      
      <!-- 返回按钮（仅桌面显示） -->
      <div style="margin-bottom: 16px;" class="hidden md:block">
        <button id="memberBackBtn" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 0; background: none; border: none; cursor: pointer; font-size: 14px; color: var(--text-tertiary, #9ca3af); transition: color 0.2s;" onmouseover="this.style.color='var(--color-brand-nogi, #742581)'" onmouseout="this.style.color='var(--text-tertiary, #9ca3af)'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path>
          </svg>
          <span>返回博客列表</span>
        </button>
      </div>
      
      <!-- 主布局 -->
      <div class="member-page-layout">
        <!-- 左侧：博客列表 -->
        <div class="member-main-content">
          <!-- 手机端标题（只在手机显示） -->
          <div class="md:hidden text-center mb-6 pb-4 border-b border-gray-200">
            <h1 class="text-lg font-medium text-gray-900">
              <span id="memberNameHeader">-</span> 公式博客一览
            </h1>
          </div>
          
          <h2 class="blog-list-header">Blog</h2>
          
          <!-- 博客列表（网格布局，一行3个） -->
          <div id="memberBlogsContainer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- 博客卡片将在这里动态加载 -->
          </div>
          
          <!-- 分页组件 -->
          <div id="memberPagination" class="hidden" style="margin-top: 32px;">
            <div class="flex flex-col items-center gap-4">
              <div id="memberPageInfo" class="text-sm text-gray-600 font-medium"></div>
              <div class="inline-flex items-center gap-2">
                <button id="memberPrevBtn" class="flex items-center justify-center w-8 h-8 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                  </svg>
                </button>
                <div id="memberPageButtons" class="flex items-center gap-1"></div>
                <button id="memberNextBtn" class="flex items-center justify-center w-8 h-8 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <!-- 加载中状态 -->
          <div id="memberLoadingState" class="hidden text-center py-12">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
          
          <!-- 空状态 -->
          <div id="memberEmptyState" class="hidden text-center py-12">
            <p class="text-gray-500">该成员暂无博客</p>
          </div>
        </div>
        
        <!-- 右侧：侧边栏 -->
        <aside class="member-sidebar">
          <!-- 成员信息卡片 -->
          <div class="sidebar-card">
            <div class="member-avatar-sidebar">
              <div id="memberAvatarSidebar" style="width:100%;height:100%;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:48px;color:#999;">
                <span id="memberInitialSidebar">M</span>
              </div>
            </div>
            <h3 id="memberNameSidebar" class="member-name-sidebar" lang="ja">成员姓名</h3>
            <p id="memberKanaSidebar" class="member-kana-sidebar" lang="ja"></p>
            <a href="#" class="profile-link" onclick="event.preventDefault();">Profile</a>
          </div>
          
          <!-- 日历 -->
          <div class="calendar-section">
            <h3 style="text-align: center; font-size: 18px; font-weight: bold; color: var(--color-brand-nogi, #742581); margin-bottom: 16px; letter-spacing: 2px;">ARCHIVES</h3>
            <div style="margin-bottom: 16px; position: relative;">
              <div class="calendar-month-selector-new" style="width: 100%; padding: 12px 16px; background: var(--bg-primary); border: 2px solid var(--color-brand-nogi, #742581); border-radius: 8px; cursor: pointer; transition: all 0.3s ease;" onclick="MemberPage.toggleMonthDropdown()" onmouseover="this.style.background=document.documentElement.classList.contains('dark')?'var(--bg-tertiary)':'#f3e5f5'" onmouseout="this.style.background='var(--bg-primary)'">
                <div style="display: flex; align-items: center; justify-content: center;">
                  <span id="calendarMonth" style="font-weight: bold; font-size: 16px; color: var(--color-brand-nogi, #742581);">2025.10</span>
                  <span id="dropdownArrow" style="margin-left: 8px; color: var(--color-brand-nogi, #742581); transition: transform 0.3s ease;">▼</span>
                </div>
              </div>
              
              <!-- 月份下拉菜单（带动画） -->
              <div id="monthDropdown" style="opacity: 0; visibility: hidden; position: absolute; top: calc(100% + 8px); left: 0; right: 0; z-index: 1000; background: var(--bg-primary); border: 2px solid var(--color-brand-nogi, #742581); border-radius: 8px; padding: 16px; box-shadow: 0 8px 24px rgba(126, 87, 194, 0.15); transition: all 0.3s ease; transform: translateY(-10px); overscroll-behavior: contain;">
                <div id="monthDropdownYears" style="display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; justify-content: center;"></div>
                <div id="monthDropdownList" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-height: 240px; overflow-y: auto; overscroll-behavior: contain;"></div>
              </div>
            </div>
            <div id="calendarDates" class="calendar-dates">
              <!-- 日期将在这里动态加载 -->
            </div>
          </div>
        </aside>
      </div>
    `;

    // 插入到主内容区域（追加到 main 末尾，避免 insertBefore 的 DOM 引用问题）
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.appendChild(container);
    } else {
      document.body.appendChild(container);
    }
  },

  /**
   * 显示成员页面
   */
  async showMemberPage(memberName, groupKey) {
    console.log('[MemberPage] 显示成员页面:', memberName, groupKey);

    // 设置统一状态
    App.state.group = groupKey;
    App.state.member = memberName;

    // 更新URL (由Router调用时已经设置了hash,不需要再pushState)
    // history.pushState现在注释掉,由Router统一管理
    // history.pushState({
    //   view: 'member',
    //   group: groupKey,
    //   member: memberName
    // }, '', `#${groupKey}/member/${encodeURIComponent(memberName)}`);

    // 隐藏其他视图
    this.hideOtherViews();

    // 显示成员页面容器
    const container = document.getElementById('memberPageContainer');
    if (container) {
      console.log('[MemberPage] 显示成员页面容器');
      container.classList.remove('hidden');

      // 确保加载状态初始化为隐藏
      const loadingState = document.getElementById('memberLoadingState');
      if (loadingState) loadingState.classList.add('hidden');
    } else {
      console.error('[MemberPage] 成员页面容器未找到!');
    }

    // 更新成员信息
    this.updateMemberInfo(memberName, groupKey);

    // 加载成员博客
    await this.loadMemberBlogs(memberName, groupKey);

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /**
   * 隐藏其他视图
   */
  hideOtherViews() {
    // 隐藏团体信息
    const groupInfo = document.getElementById('groupInfo');
    if (groupInfo) groupInfo.classList.add('hidden');

    // 隐藏成员列表
    const memberListSection = document.getElementById('memberListSection');
    if (memberListSection) memberListSection.classList.add('hidden');

    // 隐藏主博客列表
    const blogsContainer = document.getElementById('blogsContainer');
    if (blogsContainer) {
      blogsContainer.style.display = 'none';
    }

    // 隐藏主页面的加载状态
    const loadingState = document.getElementById('loadingState');
    if (loadingState) {
      console.log('[MemberPage] 隐藏主页面加载状态');
      loadingState.classList.add('hidden');
    }

    // 隐藏分页
    const paginationContainer = document.getElementById('paginationContainer');
    if (paginationContainer) paginationContainer.classList.add('hidden');

    // 隐藏滚动提示
    const scrollHint = document.getElementById('scrollHint');
    if (scrollHint) scrollHint.classList.add('hidden');

    // 隐藏加载更多
    const loadingMore = document.getElementById('loadingMore');
    if (loadingMore) loadingMore.classList.add('hidden');

    // 隐藏博客详情页
    const blogDetail = document.getElementById('blogDetail');
    if (blogDetail) blogDetail.remove();

    // 显示main（因为member页面是main的子元素）
    const main = document.querySelector('main');
    if (main) main.style.display = 'block';

    // 隐藏页脚
    const footer = document.querySelector('footer');
    if (footer) footer.style.display = 'none';
  },

  /**
   * 更新成员信息显示
   */
  updateMemberInfo(memberName, groupKey) {
    // 使用 GroupConfig 获取团体名称
    const groupName = window.GroupConfig ? window.GroupConfig.getDisplayName(groupKey) : groupKey;

    console.log(`[MemberPage] 更新成员信息: ${memberName}, 团体: ${groupName}`);

    // 更新侧边栏成员信息
    const nameEl = document.getElementById('memberNameSidebar');
    if (nameEl) nameEl.textContent = memberName;

    // 更新手机端标题
    const headerEl = document.getElementById('memberNameHeader');
    if (headerEl) headerEl.textContent = memberName;

    // 更新假名（如果有的话）
    const kanaEl = document.getElementById('memberKanaSidebar');
    if (kanaEl) {
      kanaEl.textContent = this.getMemberKana(memberName) || '';
    }

    // 更新头像 - 智能匹配真实图片
    const avatarSidebar = document.getElementById('memberAvatarSidebar');
    if (avatarSidebar) {
      // 智能匹配：处理带空格/不带空格的名字变体，优先使用真实图片
      let memberData = null;

      if (this.memberImages) {
        // 1. 直接匹配
        if (this.memberImages[memberName]) {
          memberData = this.memberImages[memberName];
        }

        // 2. 如果是占位图或未找到，尝试无空格版本
        if (!memberData || memberData.imageUrl.includes('ui-avatars.com')) {
          const nameWithoutSpaces = memberName.replace(/\s+/g, '');
          if (this.memberImages[nameWithoutSpaces] && !this.memberImages[nameWithoutSpaces].imageUrl.includes('ui-avatars.com')) {
            memberData = this.memberImages[nameWithoutSpaces];
            console.log(`[MemberPage] 使用无空格名字匹配: ${nameWithoutSpaces}`);
          }
        }

        // 3. 如果无空格版本也是占位图，尝试有空格版本
        if (!memberData || memberData.imageUrl.includes('ui-avatars.com')) {
          const nameWithSpaces = memberName.replace(/(.)/g, '$1 ').trim();
          if (this.memberImages[nameWithSpaces] && !this.memberImages[nameWithSpaces].imageUrl.includes('ui-avatars.com')) {
            memberData = this.memberImages[nameWithSpaces];
            console.log(`[MemberPage] 使用有空格名字匹配: ${nameWithSpaces}`);
          }
        }
      }

      if (memberData && !memberData.imageUrl.includes('ui-avatars.com')) {
        console.log(`[MemberPage] ✅ 从member-images加载真实头像: ${memberData.imageUrl}`);
        avatarSidebar.innerHTML = `<img src="${memberData.imageUrl}" alt="${memberName}" class="w-full h-full object-cover">`;
      } else if (window.MemberImages) {
        const imageUrl = window.MemberImages.getImageUrl(memberName, groupName);
        console.log(`[MemberPage] 从MemberImages加载头像: ${imageUrl}`);
        avatarSidebar.innerHTML = `<img src="${imageUrl}" alt="${memberName}" class="w-full h-full object-cover">`;
      } else {
        console.warn(`[MemberPage] 未找到头像，使用默认头像`);
        // 使用默认头像
        avatarSidebar.innerHTML = `<span style="font-size:48px;color:#999;">${memberName.charAt(0)}</span>`;
      }
    }
  },

  /**
   * 获取成员假名
   */
  getMemberKana(memberName) {
    // 这里可以添加成员假名映射
    const kanaMap = {
      '池田瑛紗': 'いけだ てれさ',
      '五百城茉央': 'いおき まひろ',
      '一ノ瀬美空': 'いちのせ みく',
      '井上和': 'いのうえ なぎ',
      '岡本姫奈': 'おかもと ひな'
      // 添加更多成员...
    };
    return kanaMap[memberName] || '';
  },

  /**
   * 加载成员博客
   */
  async loadMemberBlogs(memberName, groupKey, page = 1) {
    const pageSize = window.PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    // 显示加载状态
    const loadingEl = document.getElementById('memberLoadingState');
    const containerEl = document.getElementById('memberBlogsContainer');
    const emptyEl = document.getElementById('memberEmptyState');

    console.log('[MemberPage] 元素状态:', {
      loading: !!loadingEl,
      container: !!containerEl,
      empty: !!emptyEl
    });

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (containerEl) containerEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.add('hidden');

    try {
      // 使用 GroupConfig 获取API团体名称
      const groupName = window.GroupConfig ? window.GroupConfig.getApiName(groupKey) : groupKey;

      console.log(`[MemberPage] 加载博客 - 成员: ${memberName}, 团体: ${groupName}`);

      // 构建API URL
      const apiBase = window.API_BASE_URL || window.API_BASE;
      let url = `${apiBase}/api/blogs?member=${encodeURIComponent(memberName)}&limit=${pageSize}&offset=${offset}`;

      // 只有非all时才添加团体筛选
      if (groupKey !== 'all') {
        url += `&group=${encodeURIComponent(groupName)}`;
      }

      console.log('[MemberPage] API URL:', url);

      const response = await fetch(url);
      const data = await response.json();

      console.log('[MemberPage] API响应:', data);

      const loadingState = document.getElementById('memberLoadingState');
      if (loadingState) {
        console.log('[MemberPage] 隐藏加载状态');
        loadingState.classList.add('hidden');
      } else {
        console.error('[MemberPage] 找不到 memberLoadingState 元素！');
      }

      if (data.success && data.blogs && data.blogs.length > 0) {
        // ✨ 数据源处理：统一格式化日期
        const processedBlogs = window.processBlogsData
          ? window.processBlogsData(data.blogs)
          : data.blogs;

        // 更新博客数量
        const blogCount = data.count || processedBlogs.length;
        // 博客数量不再显示在页面上

        // 更新最后更新时间（如果元素存在）
        if (processedBlogs[0]) {
          const lastUpdateEl = document.getElementById('memberLastUpdate');
          if (lastUpdateEl) {
            // ✅ 现在可以直接使用formatted_date
            const formattedDate = processedBlogs[0].formatted_date || processedBlogs[0].publish_date || '-';
            lastUpdateEl.textContent = formattedDate;
          }
        }

        // 渲染博客列表（使用博客卡片样式）
        const container = document.getElementById('memberBlogsContainer');
        console.log('[MemberPage] 容器找到:', !!container);
        console.log('[MemberPage] renderBlogItem存在:', !!window.renderBlogItem);
        console.log('[MemberPage] 博客数量:', processedBlogs.length);

        // ✅ 清空容器，避免重复显示
        if (container) {
          container.innerHTML = '';
        }

        const cards = [];
        processedBlogs.forEach((blog, index) => {
          // 使用主页面的博客卡片渲染 + Cloudinary优化
          if (window.renderBlogItem) {
            const card = window.renderBlogItem(blog, index);
            console.log(`[MemberPage] 创建卡片 ${index + 1}:`, !!card);
            container.appendChild(card);
            cards.push(card);

            // 立即显示卡片（不等待滚动动画）
            setTimeout(() => {
              card.classList.add('visible');
              console.log(`[MemberPage] 卡片 ${index + 1} 已显示`);

              // 调试图片尺寸
              const img = card.querySelector('.blog-card-image');
              if (img) {
                console.log(`[MemberPage] 图片 ${index + 1} 尺寸:`, {
                  宽度: img.offsetWidth,
                  高度: img.offsetHeight,
                  比例: (img.offsetHeight / img.offsetWidth).toFixed(2)
                });
              }
            }, index * 50); // 保持波浪效果
          } else {
            console.warn('[MemberPage] renderBlogItem不存在，使用列表样式');
            container.appendChild(this.createBlogListItem(blog));
          }
        });

        console.log('[MemberPage] 容器子元素数量:', container.children.length);
        console.log('[MemberPage] 容器 display:', window.getComputedStyle(container).display);
        console.log('[MemberPage] 容器 visibility:', window.getComputedStyle(container).visibility);
        console.log('[MemberPage] 容器 offsetHeight:', container.offsetHeight);
        console.log('[MemberPage] 容器父元素:', container.parentElement);

        // 更新日历
        this.updateCalendar(processedBlogs);

        // 更新分页
        const totalCount = data.total || data.pagination?.total || data.count;
        if (totalCount > pageSize) {
          this.updatePagination(page, Math.ceil(totalCount / pageSize));
        } else {
          document.getElementById('memberPagination').classList.add('hidden');
        }
      } else {
        document.getElementById('memberEmptyState').classList.remove('hidden');
        const blogCountEl = document.getElementById('memberBlogCountHero');
        if (blogCountEl) blogCountEl.textContent = '0';
        const lastUpdateEl = document.getElementById('memberLastUpdate');
        if (lastUpdateEl) lastUpdateEl.textContent = '-';
      }
    } catch (error) {
      console.error('加载成员博客失败:', error);
      document.getElementById('memberLoadingState').classList.add('hidden');
      document.getElementById('memberEmptyState').classList.remove('hidden');
    }
  },

  /**
   * 创建博客列表项
   */
  createBlogListItem(blog) {
    const li = document.createElement('li');
    li.className = 'blog-list-item';

    // 提取文本摘要
    let excerpt = '';
    if (blog.translated_content) {
      excerpt = blog.translated_content
        .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
        .replace(/\[NEWLINE:\d+\]/g, ' ') // 替换换行标记
        .replace(/\[IMAGE:\d+\]/g, '') // 移除图片标记
        .replace(/[#*_`]/g, '') // 移除markdown符号
        .replace(/\n+/g, ' ') // 替换换行
        .trim()
        .substring(0, 150);
      if (excerpt.length === 150) excerpt += '...';
    }

    li.innerHTML = `
      <a href="#blog/${blog.id}" class="blog-list-link">
        <h3 class="blog-list-title">${blog.title || ''}</h3>
        <div class="blog-list-meta">
          <span class="blog-list-date">${blog.formatted_date || blog.publish_date || ''}</span>
        </div>
        ${excerpt ? `<p class="blog-list-excerpt">${excerpt}</p>` : ''}
      </a>
    `;

    return li;
  },

  /**
   * 更新分页组件
   */
  updatePagination(currentPage, totalPages) {
    const container = document.getElementById('memberPagination');
    const pageInfo = document.getElementById('memberPageInfo');
    const prevBtn = document.getElementById('memberPrevBtn');
    const nextBtn = document.getElementById('memberNextBtn');
    const pageButtons = document.getElementById('memberPageButtons');

    if (totalPages <= 1) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    pageInfo.textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页`;

    // 更新按钮状态
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    prevBtn.onclick = () => this.goToPage(currentPage - 1);
    nextBtn.onclick = () => this.goToPage(currentPage + 1);

    // 生成页码按钮
    pageButtons.innerHTML = '';
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('button');
      btn.className = i === currentPage
        ? 'px-3 py-1 text-sm text-white rounded'
        : 'px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100';
      if (i === currentPage) btn.style.background = '#7e57c2';
      btn.textContent = i;
      btn.onclick = () => this.goToPage(i);
      pageButtons.appendChild(btn);
    }
  },

  /**
   * 跳转到指定页
   */
  async goToPage(page) {
    if (!App.state.member || !App.state.group) return;
    await this.loadMemberBlogs(App.state.member, App.state.group, page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /**
   * 返回团体页面
   */
  backToGroupPage() {
    console.log('[MemberPage] 返回团体页面:', App.state.group);
    console.log('[MemberPage] Router存在:', !!window.Router);

    // 直接调用 Router.showGroupPage，不依赖 hash 变化
    if (window.Router) {
      console.log('[MemberPage] 直接调用 Router.showGroupPage');
      // 先重置状态，确保不被防重复逻辑拦截
      window.Router.currentView = null;
      // 清除成员状态已在 Router.showGroupPage 中处理
      window.Router.showGroupPage(App.state.group);
    } else {
      console.log('[MemberPage] 降级：直接设置 hash');
      window.location.hash = App.state.group;
    }
  },

  /**
   * 处理路由变化
   */
  handleRouteChange() {
    const hash = window.location.hash;
    if (hash.includes('/member/')) {
      const parts = hash.split('/');
      if (parts.length >= 3) {
        const group = parts[0].substring(1);
        const member = decodeURIComponent(parts[2]);
        this.showMemberPage(member, group);
      }
    }
  },

  /**
   * 更新日历
   */
  updateCalendar(blogs) {
    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth() + 1;
    this.memberBlogs = blogs;

    this.renderCalendar();
  },

  /**
   * 渲染日历（仿官网风格）
   */
  renderCalendar() {
    // 更新月份显示
    const monthEl = document.getElementById('calendarMonth');
    if (monthEl) {
      monthEl.textContent = `${this.currentYear}.${String(this.currentMonth).padStart(2, '0')}`;
    }

    // 获取该月有博客的日期（用于标记）- 使用通用日期工具
    const blogDatesSet = new Set();
    if (this.memberBlogs) {
      this.memberBlogs.forEach(blog => {
        if (blog.publish_date && window.isInMonth && window.isInMonth(blog.publish_date, this.currentYear, this.currentMonth)) {
          const parts = window.extractDateParts(blog.publish_date);
          if (parts) {
            blogDatesSet.add(parts.day);
          }
        }
      });
    }

    // 获取当月的日历信息
    const firstDay = new Date(this.currentYear, this.currentMonth - 1, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay(); // 0=周日, 1=周一, ...

    // 渲染完整的日历网格
    const datesEl = document.getElementById('calendarDates');
    if (datesEl) {
      let html = '';

      // 使用单一 grid 布局（与博客详情页一致）
      html += '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; padding: 4px;">';

      // 添加星期标题（日文）
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      weekdays.forEach(day => {
        html += `<div style="text-align: center; font-size: 10px; color: var(--text-tertiary); padding: 4px;">${day}</div>`;
      });

      // 添加占位空白
      for (let i = 0; i < startWeekday; i++) {
        html += '<div style="aspect-ratio: 1; padding: 2px;"></div>';
      }

      // 添加每一天
      const today = new Date();
      const isCurrentMonth = today.getFullYear() === this.currentYear && (today.getMonth() + 1) === this.currentMonth;
      const currentDay = isCurrentMonth ? today.getDate() : -1;

      for (let day = 1; day <= daysInMonth; day++) {
        const hasBlog = blogDatesSet.has(day);
        const isToday = day === currentDay;

        let style = 'aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 11px; padding: 2px; border-radius: 4px; border: none; background: transparent; cursor: default;';

        if (isToday) {
          style += ' background: var(--color-brand-nogi, #742581); color: white; font-weight: bold;';
        } else if (hasBlog) {
          style += ' background: var(--bg-tertiary); color: var(--color-brand-nogi, #742581); cursor: pointer;';
        } else {
          style += ' color: var(--text-tertiary);';
        }

        const dateStr = `${this.currentYear}/${String(this.currentMonth).padStart(2, '0')}/${String(day).padStart(2, '0')}`;

        if (hasBlog) {
          html += `<button style="${style}" onclick="MemberPage.filterByDate('${dateStr}')">${day}</button>`;
        } else {
          html += `<div style="${style}">${day}</div>`;
        }
      }

      html += '</div>';
      datesEl.innerHTML = html;
    }
  },

  /**
   * 获取指定月份有博客的日期
   */
  getBlogDatesForMonth(year, month) {
    const dates = new Set();

    if (this.memberBlogs) {
      this.memberBlogs.forEach(blog => {
        if (blog.publish_date && window.isInMonth && window.isInMonth(blog.publish_date, year, month)) {
          // ✅ 阶段3：直接使用预处理的 formatted_date
          const dateStr = blog.formatted_date || blog.publish_date;
          dates.add(dateStr.split(' ')[0]); // 只保留日期部分
        }
      });
    }

    return Array.from(dates).sort();
  },

  /**
   * 切换月份
   */
  changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth > 12) {
      this.currentMonth = 1;
      this.currentYear++;
    } else if (this.currentMonth < 1) {
      this.currentMonth = 12;
      this.currentYear--;
    }

    this.renderCalendar();
  },

  /**
   * 按日期筛选
   */
  filterByDate(date) {
    // 查找该日期的博客（使用通用日期匹配）
    const blog = this.memberBlogs.find(b => {
      if (!b.publish_date) return false;
      return window.isSameDate ? window.isSameDate(b.publish_date, date) : b.publish_date.includes(date);
    });
    if (blog) {
      // 直接跳转到普通博客详情页
      window.location.hash = `#blog/${blog.id}`;
    }
  },

  /**
   * 切换月份下拉菜单（带动画）
   */
  toggleMonthDropdown() {
    const dropdown = document.getElementById('monthDropdown');
    const arrow = document.getElementById('dropdownArrow');
    if (!dropdown || !arrow) return;

    const isHidden = dropdown.style.opacity === '0' || dropdown.style.visibility === 'hidden';

    if (isHidden) {
      // 生成可用月份列表
      this.populateMonthDropdown();

      // 显示下拉菜单（带动画）
      dropdown.style.visibility = 'visible';
      dropdown.style.opacity = '0';
      dropdown.style.transform = 'translateY(-10px)';

      // 触发动画
      setTimeout(() => {
        dropdown.style.opacity = '1';
        dropdown.style.transform = 'translateY(0)';
        arrow.style.transform = 'rotate(180deg)';
      }, 10);

      // 点击外部关闭
      setTimeout(() => {
        document.addEventListener('click', this.closeMonthDropdown);
      }, 0);
    } else {
      // 隐藏下拉菜单（带动画）
      dropdown.style.opacity = '0';
      dropdown.style.transform = 'translateY(-10px)';
      arrow.style.transform = 'rotate(0)';

      setTimeout(() => {
        dropdown.style.visibility = 'hidden';
      }, 300);

      document.removeEventListener('click', this.closeMonthDropdown);
    }
  },

  /**
   * 关闭月份下拉菜单
   */
  closeMonthDropdown(event) {
    const dropdown = document.getElementById('monthDropdown');
    const selector = document.querySelector('.calendar-month-selector-new');
    const arrow = document.getElementById('dropdownArrow');

    if (dropdown && !dropdown.contains(event.target) && !selector.contains(event.target)) {
      // 隐藏下拉菜单（带动画）
      dropdown.style.opacity = '0';
      dropdown.style.transform = 'translateY(-10px)';
      if (arrow) arrow.style.transform = 'rotate(0)';

      setTimeout(() => {
        dropdown.style.visibility = 'hidden';
      }, 300);

      document.removeEventListener('click', MemberPage.closeMonthDropdown);
    }
  },

  /**
   * 填充月份下拉列表（年份→月份层级）
   */
  populateMonthDropdown() {
    const yearContainer = document.getElementById('monthDropdownYears');
    const list = document.getElementById('monthDropdownList');
    if (!list || !yearContainer) return;

    // 获取博客中所有的年月（使用通用日期工具）
    const yearMonthMap = {}; // { year: [month1, month2, ...] }
    if (this.memberBlogs) {
      this.memberBlogs.forEach(blog => {
        if (blog.publish_date) {
          const parts = window.extractDateParts ? window.extractDateParts(blog.publish_date) : null;
          if (parts) {
            const y = parts.year;
            const m = parts.month;
            if (!yearMonthMap[y]) yearMonthMap[y] = new Set();
            yearMonthMap[y].add(m);
          }
        }
      });
    }

    // 获取可用年份（倒序）
    const years = Object.keys(yearMonthMap).sort((a, b) => b - a);
    if (years.length === 0) return;

    // 默认选中当前日历年份，若不在列表中则选最新年份
    if (!this._dropdownYear || !yearMonthMap[this._dropdownYear]) {
      this._dropdownYear = this.currentYear && yearMonthMap[this.currentYear] ? this.currentYear : parseInt(years[0]);
    }

    // 渲染年份标签
    yearContainer.innerHTML = years.map(y => {
      const isActive = parseInt(y) === this._dropdownYear;
      return `
        <button
          onclick="event.stopPropagation(); MemberPage.switchDropdownYear(${y})"
          style="
            padding: 6px 14px;
            border: ${isActive ? '2px solid var(--color-brand-nogi, #742581)' : '1px solid var(--border-primary)'};
            border-radius: 20px;
            background: ${isActive ? 'var(--color-brand-nogi, #742581)' : 'var(--bg-primary)'};
            color: ${isActive ? 'white' : 'var(--text-secondary)'};
            font-size: 13px;
            font-weight: ${isActive ? 'bold' : 'normal'};
            cursor: pointer;
            transition: all 0.2s ease;
          "
          onmouseover="if(!${isActive}){this.style.background='var(--bg-tertiary)';this.style.borderColor='var(--color-brand-nogi, #742581)';this.style.color='var(--color-brand-nogi, #742581)';}"
          onmouseout="if(!${isActive}){this.style.background='var(--bg-primary)';this.style.borderColor='var(--border-primary)';this.style.color='var(--text-secondary)';}"
        >${y}</button>
      `;
    }).join('');

    // 渲染该年份下的月份按钮（倒序）
    const months = Array.from(yearMonthMap[this._dropdownYear] || []).sort((a, b) => b - a);
    list.innerHTML = months.map(m => {
      const isSelected = this.currentYear === this._dropdownYear && this.currentMonth === m;
      const monthStr = `${String(m).padStart(2, '0')}月`;
      return `
        <button 
          onclick="MemberPage.selectMonth(${this._dropdownYear}, ${m})" 
          style="
            padding: 10px 12px;
            border: ${isSelected ? '2px solid var(--color-brand-nogi, #742581)' : '1px solid var(--border-primary)'};
            border-radius: 6px;
            background: ${isSelected ? 'var(--bg-tertiary)' : 'var(--bg-primary)'};
            color: ${isSelected ? 'var(--color-brand-nogi, #742581)' : 'var(--text-secondary)'};
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: ${isSelected ? 'bold' : 'normal'};
            text-align: center;
          "
          onmouseover="this.style.background='var(--bg-tertiary)'; this.style.borderColor='var(--color-brand-nogi, #742581)'; this.style.color='var(--color-brand-nogi, #742581)';"
          onmouseout="this.style.background='${isSelected ? 'var(--bg-tertiary)' : 'var(--bg-primary)'}'; this.style.borderColor='${isSelected ? 'var(--color-brand-nogi, #742581)' : 'var(--border-primary)'}'; this.style.color='${isSelected ? 'var(--color-brand-nogi, #742581)' : 'var(--text-secondary)'}';"
        >
          ${monthStr}
        </button>
      `;
    }).join('');

    // 滚动隔离：防止下拉菜单内滚动穿透到页面
    this.setupDropdownScrollIsolation();
  },

  /**
   * 切换下拉菜单中的年份
   */
  switchDropdownYear(year) {
    this._dropdownYear = year;
    this.populateMonthDropdown();
  },

  /**
   * 设置下拉菜单滚动隔离
   */
  setupDropdownScrollIsolation() {
    const dropdown = document.getElementById('monthDropdown');
    if (!dropdown || dropdown._scrollIsolated) return;
    dropdown._scrollIsolated = true;

    dropdown.addEventListener('wheel', function(e) {
      const list = document.getElementById('monthDropdownList');
      if (!list) return;
      const { scrollTop, scrollHeight, clientHeight } = list;
      const atTop = scrollTop === 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight && e.deltaY > 0;
      if (atTop || atBottom) {
        e.preventDefault();
      }
    }, { passive: false });
  },

  /**
   * 选择月份
   */
  selectMonth(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    this.renderCalendar();

    // 关闭下拉菜单（带动画）
    const dropdown = document.getElementById('monthDropdown');
    const arrow = document.getElementById('dropdownArrow');
    if (dropdown) {
      dropdown.style.opacity = '0';
      dropdown.style.transform = 'translateY(-10px)';
      if (arrow) arrow.style.transform = 'rotate(0)';

      setTimeout(() => {
        dropdown.style.visibility = 'hidden';
      }, 300);

      document.removeEventListener('click', this.closeMonthDropdown);
    }
  }
};

// 🔧 脚本懒加载后立即执行（DOMContentLoaded 此时已经触发，监听没有意义）
MemberPage.createMemberPageContainer();
MemberPage.loadMemberImages();
console.log('[MemberPage] 模块已加载，容器已创建');
