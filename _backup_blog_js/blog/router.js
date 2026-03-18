/**
 * 统一路由管理模块
 * 处理所有页面的路由跳转和状态管理
 * 🚀 支持按需加载 JS 模块
 */

window.Router = {
  currentView: null,
  currentBlog: null,
  previousPage: 1,  // 保存离开列表页时的页码
  previousGroup: null,  // 保存离开列表页时的团体
  previousMemberFilter: '',  // 保存离开列表页时的成员筛选

  /**
   * 初始化路由
   */
  init() {
    console.log('[Router] 初始化路由管理');

    // 监听浏览器前进后退
    window.addEventListener('popstate', (event) => {
      console.log('[Router] popstate事件:', event.state, window.location.hash);
      this.handleRoute();
    });

    // 监听hash变化
    window.addEventListener('hashchange', (event) => {
      console.log('[Router] hashchange事件:', window.location.hash);
      this.handleRoute();
    });

    // 初始路由处理（立即执行）
    this.handleRoute();
  },

  /**
   * 动态加载脚本文件
   * @param {string} url - 脚本路径
   */
  loadScript(url) {
    return new Promise((resolve, reject) => {
      // 检查是否已经加载
      const existing = document.querySelector(`script[src="${url}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve();
        } else {
          // 如果正在加载中，添加监听器
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)));
        }
        return;
      }

      console.log(`[Router] 动态加载脚本: ${url}`);
      const script = document.createElement('script');
      script.src = url;
      script.dataset.loaded = 'false';
      script.defer = true;

      script.onload = () => {
        console.log(`[Router] 脚本加载成功: ${url}`);
        script.dataset.loaded = 'true';
        resolve();
      };

      script.onerror = () => {
        console.error(`[Router] 脚本加载失败: ${url}`);
        reject(new Error(`Failed to load ${url}`));
      };

      document.body.appendChild(script);
    });
  },

  /**
   * 解析 URL 中的查询参数
   */
  parseHashParams(hash) {
    const result = { path: hash, params: {} };
    const questionIndex = hash.indexOf('?');
    if (questionIndex !== -1) {
      result.path = hash.substring(0, questionIndex);
      const queryString = hash.substring(questionIndex + 1);
      const pairs = queryString.split('&');
      pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          result.params[key] = decodeURIComponent(value);
        }
      });
    }
    return result;
  },

  /**
   * 处理路由
   */
  handleRoute() {
    const hash = window.location.hash;
    console.log('[Router] 处理路由:', hash);

    if (!hash || hash === '#') {
      this.showGroupPage('all');
      return;
    }

    // 解析 hash 和查询参数
    const { path, params } = this.parseHashParams(hash);
    const memberFilter = params.member || '';

    console.log('[Router] 解析路由:', { path, memberFilter });

    // 解析路由
    if (path.startsWith('#blog/')) {
      // 博客详情页
      const blogId = path.substring(6);
      this.showBlogDetail(blogId);
    } else if (path.includes('/member/')) {
      // 成员页面
      const parts = path.split('/');
      const group = parts[0].substring(1); // 去掉#
      const member = decodeURIComponent(parts[2]);
      this.showMemberPage(member, group);
    } else {
      // 团体页面（可能带有成员筛选参数）
      const group = path.substring(1);
      this.showGroupPage(group, memberFilter);
    }
  },

  /**
   * 显示团体页面
   * @param {string} group - 团体名称
   * @param {string} memberFilter - 可选的成员筛选参数
   */
  async showGroupPage(group, memberFilter = '') {
    // 🚀 立即显示loading，提升感知响应速度
    if (window.showLoading) {
      window.showLoading();
    }

    console.log('[Router] 显示团体页面:', group);
    console.log('[Router] 当前状态:', {
      currentView: this.currentView,
      stateMember: App.state.member,
      stateGroup: App.state.group
    });

    // ✅ 防止重复调用：如果已经在相同的团体页面且筛选状态相同，不重新加载
    const currentMemberFilter = App.state.search || '';
    if (this.currentView === 'group' &&
      App.state.group === group &&
      currentMemberFilter === memberFilter &&
      !App.state.member) {  // 确保不是从成员页返回
      console.log('[Router] 已经在当前团体页面，筛选状态相同，跳过重新加载');
      // 确保隐藏loading
      if (window.hideLoading) {
        window.hideLoading();
      }
      return;
    }

    // 🔧 修复：判断是否从详情页返回
    const isReturningFromDetail = this.currentView === 'blog';
    const isSameGroup = this.previousGroup === group;

    // 🔧 修复：从详情页返回时恢复成员筛选状态
    if (isReturningFromDetail && isSameGroup && !memberFilter && this.previousMemberFilter) {
      memberFilter = this.previousMemberFilter;
      console.log(`[Router] 从详情页返回，恢复成员筛选: ${memberFilter}`);
    }

    console.log('[Router] 继续执行showGroupPage，设置状态');
    this.currentView = 'group';
    App.state.member = '';  // 清除成员状态

    // 🔧 路由切换时滚动到顶部
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });

    // 设置统一状态
    App.state.group = group;

    // 🔧 修复：从详情页返回同一团体时，恢复之前的页码
    if (isReturningFromDetail && isSameGroup && this.previousPage > 1) {
      console.log(`[Router] 从详情页返回，恢复页码: ${this.previousPage}`);
      App.state.page = this.previousPage;  // 恢复之前的页码
    } else {
      console.log('[Router] 切换团体或首次进入，重置为第1页');
      App.state.page = 1;  // 重置为第1页
    }

    // 🔧 修复：根据 memberFilter 设置搜索状态
    App.state.search = memberFilter;
    // 🔧 修复：只有'all'使用无限滚动，具体团体使用翻页
    App.state.hasMore = (group === 'all');
    App.state.blogs = [];    // 清空缓存的博客
    // 🔧 修复：重置 loading 状态，确保 loadBlogs 能够执行（修复手机端返回不显示内容问题）
    App.state.loading = false;

    // 🎯 SEO 更新（模块化）
    if (App.seo && App.seo.manager) {
      if (group === 'all') {
        App.seo.manager.updateHomeMeta();
      } else {
        App.seo.manager.updateGroupMeta(group);
      }
    }

    // 🔧 修复：只在切换团体时重置分页，从详情页返回时不重置
    if (!isReturningFromDetail || !isSameGroup) {
      if (App.pagination) {
        App.pagination.reset();
      }
    }

    // ✅ 恢复或重置成员筛选器UI
    if (memberFilter) {
      // 恢复成员筛选状态
      if (window.restoreMemberFilter) {
        window.restoreMemberFilter(memberFilter);
      }
      console.log(`[Router] 恢复成员筛选: ${memberFilter}`);
    } else {
      // 🔧 修复：没有筛选参数时始终重置筛选器UI
      if (window.resetMemberFilter) {
        window.resetMemberFilter();
      }
      console.log('[Router] 重置成员筛选器');
    }

    console.log('[Router] 设置状态 App.state.group:', App.state.group);

    // ⚠️ 重要：先隐藏其他页面，再调用 switchGroup
    // 切换回博客视图（隐藏数据统计/关系分析等视图）
    if (typeof window.switchView === 'function') {
      window.switchView('blog');
    }

    // 隐藏成员页面
    const memberPageContainer = document.getElementById('memberPageContainer');
    if (memberPageContainer) {
      memberPageContainer.classList.add('hidden');
    }

    // 隐藏博客详情页
    const blogDetail = document.getElementById('blogDetail');
    if (blogDetail) {
      console.log('[Router] 移除详情页');
      // 先销毁双语控件实例
      if (window.bilingualControl && typeof window.bilingualControl.destroy === 'function') {
        window.bilingualControl.destroy();
        window.bilingualControl = null;
      }
      blogDetail.remove();
    }

    // 显示主页面
    const main = document.querySelector('main');
    if (main) {
      console.log('[Router] 显示主页面');
      main.style.display = 'block';
    }

    // 恢复博客容器显示
    const blogsContainer = document.getElementById('blogsContainer');
    if (blogsContainer) {
      console.log('[Router] 恢复博客容器显示');
      blogsContainer.style.display = '';
      blogsContainer.innerHTML = ''; // 清空旧内容
    }

    // 🔧 修复：清除搜索结果标题（如果存在）
    const searchHeader = document.getElementById('searchResultHeader');
    if (searchHeader) {
      searchHeader.remove();
      console.log('[Router] 清除搜索结果标题');
    }

    // 清空搜索框
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.value = '';
    }

    // 显示页脚
    const footer = document.querySelector('footer');
    if (footer) {
      console.log('[Router] 显示页脚');
      footer.style.display = 'block';
    }

    // 更新所有group pill状态（桌面端+移动端）
    document.querySelectorAll('.group-pill').forEach(pill => {
      pill.classList.remove('active');
      if (pill.dataset.group === group) {
        pill.classList.add('active');
      }
    });

    // 显示/隐藏团体信息
    const groupInfo = document.getElementById('groupInfo');
    const memberListSection = document.getElementById('memberListSection');

    if (group !== 'all') {
      if (groupInfo) groupInfo.classList.remove('hidden');
      if (memberListSection) memberListSection.classList.remove('hidden');

      // 加载团体信息
      if (window.loadGroupInfo) {
        await window.loadGroupInfo(group);
      }
    } else {
      if (groupInfo) groupInfo.classList.add('hidden');
      if (memberListSection) memberListSection.classList.add('hidden');
    }

    // 加载博客列表（使用平滑过渡动画）
    try {
      if (window.smoothTransition && window.loadBlogs) {
        console.log('[Router] 使用平滑过渡加载博客, currentGroup:', App.state.group);
        await window.smoothTransition(async () => {
          await window.loadBlogs();
        });
      } else if (window.loadBlogs) {
        console.log('[Router] 直接加载博客, currentGroup:', App.state.group);
        await window.loadBlogs();
      }
    } catch (error) {
      console.error('[Router] 加载博客失败:', error);
      // 确保隐藏loading
      if (window.hideLoading) {
        window.hideLoading();
      }
    }
  },

  /**
   * 显示成员页面
   */
  async showMemberPage(member, group) {
    console.log('[Router] 显示成员页面:', member, group);
    this.currentView = 'member';

    // 设置统一状态
    App.state.group = group;
    App.state.member = member;

    // 🎯 SEO 更新（模块化）
    if (App.seo && App.seo.manager) {
      App.seo.manager.updateMemberMeta(member, group);
    }

    // 🚀 按需加载成员页面脚本
    if (typeof window.MemberPage === 'undefined') {
      console.log('[Router] 动态加载 MemberPage 模块...');
      if (window.showLoading) window.showLoading();

      try {
        await this.loadScript('/js/blog/member-page.js?v=4');
        // 🔧 初始化 MemberPage（创建 DOM 容器）
        if (window.MemberPage && window.MemberPage.init) {
          window.MemberPage.init();
          console.log('[Router] MemberPage.init() 调用完成');
        }
        // 预加载详情页相关，因为用户很可能点击博客详情
        this.loadScript('/js/blog/member-detail.js?v=2');
        console.log('[Router] MemberPage 模块加载完成');
      } catch (e) {
        console.error('[Router] 加载 MemberPage 模块失败:', e);
        if (window.hideLoading) window.hideLoading();
        return;
      }
      if (window.hideLoading) window.hideLoading();
    }

    // 隐藏博客详情页
    const blogDetail = document.getElementById('blogDetail');
    if (blogDetail) {
      // 先销毁双语控件实例
      if (window.bilingualControl && typeof window.bilingualControl.destroy === 'function') {
        window.bilingualControl.destroy();
        window.bilingualControl = null;
      }
      blogDetail.remove();
    }

    // 调用成员页面显示
    if (window.MemberPage && window.MemberPage.showMemberPage) {
      // 🔧 确保容器存在（init 可能没被调用，或容器被意外移除）
      if (window.MemberPage.createMemberPageContainer) {
        window.MemberPage.createMemberPageContainer();
      }
      window.MemberPage.showMemberPage(member, group);
    }
  },

  /**
   * 显示博客详情页
   */
  async showBlogDetail(blogId) {
    console.log('[Router] 显示博客详情:', blogId);

    // 🔧 保存当前状态，用于返回时恢复
    if (this.currentView === 'group') {
      this.previousPage = App.state.page || 1;
      this.previousGroup = App.state.group;
      this.previousMemberFilter = App.state.search || '';
      console.log(`[Router] 保存列表页状态: 团体=${this.previousGroup}, 页码=${this.previousPage}, 成员筛选=${this.previousMemberFilter || '无'}`);
    }

    this.currentView = 'blog';
    this.currentBlog = blogId;

    // 隐藏成员页面
    const memberPageContainer = document.getElementById('memberPageContainer');
    if (memberPageContainer) {
      memberPageContainer.classList.add('hidden');
    }

    // 先检查是否已经在详情页
    const existingDetail = document.getElementById('blogDetail');
    if (existingDetail) {
      console.log('[Router] 已经在详情页，更新内容');
      existingDetail.remove();
    }

    // 🚀 按需加载博客详情相关脚本
    // 需要: showBlogDetail (在 index.html 或 member-detail.js?), BlogDetailSidebar
    // 注意：showBlogDetail 实际上是在 index.html 中定义的（之前看到的），但依赖 blog-detail-sidebar.js
    if (typeof window.BlogDetailSidebar === 'undefined') {
      console.log('[Router] 动态加载 BlogDetailSidebar 模块...');
      if (window.showLoading) window.showLoading();
      try {
        await Promise.all([
          this.loadScript('/js/blog/member-detail.js?v=2'), // 可能包含渲染逻辑
          this.loadScript('/js/blog/blog-detail-sidebar.js?v=2')
        ]);
      } catch (e) {
        console.error('[Router] 加载详情页模块失败:', e);
      }
      if (window.hideLoading) window.hideLoading();
    }

    // 调用博客详情显示
    if (window.showBlogDetail) {
      try {
        // 先获取博客数据
        const apiBase = window.API_BASE_URL || window.API_BASE;
        const response = await fetch(`${apiBase}/api/blogs/${blogId}`);
        const data = await response.json();

        if (data.success && data.blog) {
          // ✨ 数据源处理：统一格式化日期
          const processedBlog = window.processBlogData
            ? window.processBlogData(data.blog)
            : data.blog;
          console.log('[Router] 调用showBlogDetail，传递博客数据避免重复请求');
          // 传递 blogData 参数，避免 loadBlogContent 重复请求
          window.showBlogDetail(processedBlog, false, processedBlog);
        } else {
          console.error('[Router] 博客不存在:', blogId);
          // 返回主页
          this.navigate('#all');
        }
      } catch (error) {
        console.error('[Router] 加载博客失败:', error);
        // 返回主页
        this.navigate('#all');
      }
    } else {
      console.error('[Router] showBlogDetail函数不存在');
    }
  },

  /**
   * 导航到指定路由
   */
  navigate(hash) {
    console.log('[Router] 导航到:', hash);
    console.log('[Router] 当前视图:', this.currentView);
    console.log('[Router] 当前成员:', App.state.member);
    console.log('[Router] 是博客详情:', hash.startsWith('#blog/'));
    console.log('[Router] 是成员页面:', hash.includes('/member/'));

    // 特殊处理：如果当前在成员页面，要切换到团体页面
    if (this.currentView === 'member' && !hash.includes('/member/') && !hash.startsWith('#blog/')) {
      console.log('[Router] 从成员页直接切换到团体页');
      const group = hash.substring(1); // 移除 #
      // 重置状态
      this.currentView = null;
      App.state.member = '';
      this.showGroupPage(group);
      return;
    }

    console.log('[Router] 设置 window.location.hash');
    console.log('[Router] 当前 hash:', window.location.hash);
    console.log('[Router] 目标 hash:', hash);

    if (window.location.hash === hash) {
      console.warn('[Router] hash 相同，手动调用 handleRoute');
      this.handleRoute();
    } else {
      window.location.hash = hash;
    }
  },

  /**
   * 返回上一页
   */
  back() {
    window.history.back();
  }
};
