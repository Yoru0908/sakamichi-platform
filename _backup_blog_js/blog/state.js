/**
 * 统一状态管理模块
 * 集中管理所有应用状态，避免重复定义
 * 
 * 解决的问题：
 * - currentGroup 在多处定义（window, Router, MemberPage）
 * - currentPage 在多处定义（window, Pagination）
 * - currentMember 在多处定义（Router, MemberPage）
 * - 等等...
 */

// 创建 App 全局命名空间（如果不存在则创建，否则扩展）
if (typeof window.App === 'undefined') {
  window.App = {};
}
// 保留已存在的子对象（如 App.ui）
window.App = window.App || {};

// ===== 应用状态 =====
window.App.state = {
  // 页面状态
  page: 1,              // 当前页码（1-based）
  group: 'all',         // 当前团体（all/nogizaka/sakurazaka/hinatazaka）
  member: '',           // 当前成员（用于成员页面）
  search: '',           // 搜索关键词
  
  // 加载状态
  loading: false,       // 主加载状态
  loadingMore: false,   // 无限滚动追加加载状态
  hasMore: true,        // 是否还有更多数据
  totalPages: 1,        // 总页数
  
  // 缓存
  blogs: [],            // 缓存的博客数据
  
  // 无限滚动
  scrollObserver: null  // IntersectionObserver实例
};

// ===== 应用配置 =====
window.App.config = {
  apiBaseUrl: ''        // API基础URL
};

// ===== 路由状态 =====
window.App.router = {
  view: null,           // 当前视图（group/member/blog）
  blogId: null          // 当前博客ID
};

// ===== 视图数据 =====
window.App.view = {
  currentBlog: null     // 当前显示的博客数据
};

// ===== 双语控件 =====
window.App.bilingual = {
  control: null,        // BilingualControl实例
  Class: null          // BilingualControl类
};

// ===== SEO 管理 =====
window.App.seo = {
  manager: null         // SEOManager 实例（由 seo-manager.js 初始化后设置）
};

// ===== ✅ 已全部迁移到 App.state，不再需要向后兼容层 =====
// 旧的 window.currentPage, window.currentSearch 等变量已废弃
// 所有代码已统一使用 App.state.page, App.state.search 等

console.log('[state.js] ✅ 统一状态管理已初始化');
console.log('[state.js] 初始状态:', App.state);
console.log('[state.js] ⚠️ 提醒: 旧的 window.currentPage 等变量已废弃，请使用 App.state.*');
