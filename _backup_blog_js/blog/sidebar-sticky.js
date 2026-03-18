/**
 * 侧边栏智能固定模块
 * 在滚动经过成员卡片后，固定日历和 NEW ENTRY 部分
 */

window.SidebarSticky = {
  initialized: false,
  sidebar: null,
  memberCard: null,
  calendarSection: null,

  /**
   * 初始化侧边栏固定功能
   */
  init() {
    if (this.initialized) return;

    // 等待侧边栏元素加载
    const checkSidebar = setInterval(() => {
      this.sidebar = document.querySelector('.member-sidebar-detail');
      this.memberCard = this.sidebar?.querySelector('.sidebar-card, div[style*="background: white"]');
      this.calendarSection = this.sidebar?.querySelector('.calendar-section, div[style*="background: white"]:nth-child(2)');

      if (this.sidebar && this.memberCard) {
        clearInterval(checkSidebar);
        this.setupStickyBehavior();
        this.initialized = true;
        console.log('[SidebarSticky] 初始化完成');
      }
    }, 100);

    // 5秒后停止检查
    setTimeout(() => clearInterval(checkSidebar), 5000);
  },

  /**
   * 设置智能固定行为
   */
  setupStickyBehavior() {
    // ⚠️ 关键：移除侧边栏的 sticky（这是整个侧边栏的inline style）
    this.sidebar.style.position = 'static';
    this.sidebar.style.top = 'auto';
    this.sidebar.style.height = 'auto';

    // 获取所有子div
    const allDivs = Array.from(this.sidebar.children);
    console.log('[SidebarSticky] 侧边栏子元素数量:', allDivs.length);

    // 第1个是成员卡片(不固定)，第2、3个是日历和NEW ENTRY(需要固定)
    const calendarAndEntries = allDivs.slice(1); // 跳过第一个元素

    if (calendarAndEntries.length >= 2) {
      // 创建固定容器
      const stickyContainer = document.createElement('div');
      stickyContainer.className = 'sidebar-sticky-container';
      stickyContainer.style.cssText = 'position: sticky; top: 80px; height: fit-content;';

      // 将日历和 NEW ENTRY 移入固定容器
      calendarAndEntries.forEach(el => {
        stickyContainer.appendChild(el);
      });

      // 将固定容器添加到侧边栏
      this.sidebar.appendChild(stickyContainer);

      console.log('[SidebarSticky] ✅ 已创建智能固定容器');
      console.log('[SidebarSticky] - 成员卡片: 不固定（正常滚动）');
      console.log('[SidebarSticky] - 日历和NEW ENTRY: 固定在top: 80px');
    }
  },

  /**
   * 清理
   */
  destroy() {
    this.initialized = false;
    this.sidebar = null;
    this.memberCard = null;
    this.calendarSection = null;
  }
};

// 在博客详情页加载时自动初始化
if (typeof window !== 'undefined') {
  // 监听详情页创建
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.id === 'blogDetail') {
          console.log('[SidebarSticky] 检测到博客详情页，准备初始化');
          setTimeout(() => {
            window.SidebarSticky.init();
          }, 200);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: false
  });
}
