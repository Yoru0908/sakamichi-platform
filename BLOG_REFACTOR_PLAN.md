# 博客重构方案

## 1. 现状分析

### 1.1 架构概览

博客是一个**嵌入在 Astro 页面里的 hash-based SPA**，与平台其余部分（React + Astro）架构完全割裂。

```
平台其余页面                          博客页面
─────────────                        ──────────
BaseLayout.astro                     BlogLayout.astro (独立 layout)
├─ ClientRouter (View Transitions)   ├─ 无 ClientRouter ❌
├─ global.css (Tailwind v4)          ├─ tailwind-output.css (Tailwind v3 + DaisyUI)
├─ Navbar / Footer                   ├─ Navbar / Footer (相同)
└─ React islands (hydrated)          └─ 32个 vanilla JS 文件 (window.* 全局对象)
                                     └─ index.astro 内 500+ 行内联 <script>
```

### 1.2 博客文件清单

| 类别 | 文件数 | 总行数 | 说明 |
|------|--------|--------|------|
| JS 模块 | 32 | ~9,700 | `public/js/blog/*.js` |
| CSS | 7 | ~1,500 | `public/css/blog/*.css` |
| Astro 页面 | 1 | 766 | `src/pages/blog/index.astro`（含500行内联JS） |
| Layout | 1 | 148 | `src/layouts/BlogLayout.astro` |
| React 组件 | 1 | 271 | `HomeBlogSection.tsx`（首页卡片，已React化） |

### 1.3 博客内部视图结构

```
/blog                     → hash-based SPA
├─ #all                   → 全部博客列表 (blog grid, infinite scroll)
├─ #nogizaka              → 团体筛选 (pagination + member grid)
├─ #sakurazaka            → 同上
├─ #hinatazaka            → 同上
├─ #blog/{id}             → 博客详情页 (双语对照 + 侧边栏)
├─ #{group}/member/{name} → 成员个人页 (博客列表 + 日历 + 头像)
├─ stats                  → 数据统计 (Chart.js)
└─ interactions           → 关系分析
```

### 1.4 核心问题

#### P0: CSS 冲突 (两套 Tailwind 共存)
- Blog 加载 `tailwind-output.css` (Tailwind v3 + DaisyUI reset)
- Platform 加载 `global.css` (Tailwind v4)
- BlogLayout 有 **50+ 行 `!important` 覆盖** 仅为保护 Navbar 不被 DaisyUI reset 破坏
- 任何新增的 Navbar 样式都需要在 BlogLayout 补 `!important`，维护成本极高

#### P1: 无 View Transitions (白屏闪烁)
- BlogLayout 不使用 `ClientRouter`
- 首页 → /blog 或 /blog → 其他页面 = **完整页面刷新**
- 其余页面间切换有平滑动画，唯独博客是割裂的

#### P2: 全局状态 + DOM 操控 (脆弱)
- 所有状态挂在 `window.App.state`
- 所有渲染用 `document.getElementById() + innerHTML`
- Router 通过 `window.location.hash` + `hashchange` 事件
- MemberPage 在 JS 中用 `createElement` 创建整个页面 DOM + 内联 `<style>`（260行 CSS-in-JS）
- BlogDetailSidebar 靠 `setTimeout(100ms)` 等 DOM 就绪，用 `scrollBy(0,1); scrollBy(0,-1)` 修 sticky

#### P3: 性能 (首次加载重)
- 15+ 个 `<script>` 同步加载（仅 stats/interactions/member-page 延迟加载）
- Chart.js + JSZip + FileSaver 全部 CDN 引入
- 无 tree-shaking，无 code splitting
- 每次团体切换拉取 `?limit=500` 的完整博客列表（仅为统计成员最后更新时间）

---

## 2. 重构方案

### 核心原则
1. **Layout 统一** — 博客使用 BaseLayout，消除两套 CSS
2. **保持跳转逻辑** — 保留 hash routing，React 组件监听 hash 变化
3. **渐进式迁移** — 不一次性重写，逐视图替换为 React island
4. **向后兼容** — 每个阶段都可独立部署，不中断服务

### 2.1 Phase 1: Layout 统一 + CSS 隔离 (预计 2-3h)

**目标**: 消除白屏闪烁，统一 Navbar 样式

```
变更:
- BlogLayout.astro → 改为 extends BaseLayout (加入 ClientRouter)
- 移除 BlogLayout 中 50+ 行 !important nav 覆盖
- 博客 CSS (tailwind-output.css, main-styles.css 等) 用 CSS scope/layer 隔离:
    @layer blog { @import "blog/tailwind-output.css"; }
  或用 .blog-page 父级选择器包裹
- 验证: 博客功能不变，Navbar 样式正确，页面切换有 View Transition
```

**风险**: DaisyUI 的 CSS reset 可能与 Tailwind v4 冲突  
**对策**: 用 `@layer blog` 降低优先级，platform 的 `global.css` 自然覆盖

### 2.2 Phase 2: React 组件迁移 (按优先级排序)

按复杂度从低到高，每个可独立部署:

#### 2.2a Stats View → `<BlogStats />` (预计 1-2h)
- 最简单，独立页面，无复杂路由交互
- 移除 CDN Chart.js → 用 `npm i chart.js react-chartjs-2`
- 完全替代 `stats.js` (348行)

#### 2.2b Interactions View → `<BlogInteractions />` (预计 2h)
- 同样独立，已有 lazy-load 机制
- 替代 `interactions.js` (376行)

#### 2.2c Blog Grid (列表页) → `<BlogGrid />` (预计 3-4h)
- 核心视图，包含:
  - 团体筛选 pill
  - 搜索框
  - 博客卡片网格
  - Infinite scroll (#all) / Pagination (团体页)
  - Member grid (团体页)
- 替代: `app.js` 大部分 (loadBlogs, displayBlogs, pagination等)
- 内部状态用 React state，暴露 `window.App.state` 兼容层供未迁移模块使用

#### 2.2d Member Page → `<MemberPage />` (预计 3h)
- 替代 `member-page.js` (1170行) + 其内联 260 行 CSS
- 包含: 头像/日历/博客列表/分页
- CSS 改用 Tailwind classes

#### 2.2e Blog Detail → `<BlogDetail />` (预计 4-5h)
- 最复杂，替代:
  - `member-detail.js` (670行)
  - `blog-detail-sidebar.js` (430行)
  - `bilingual-control-v2.js` (423行)
  - `structured-renderer.js` (275行)
  - `image-download.js` (303行)
- 包含: 双语对照、Markdown 渲染、侧边栏、图片下载、分享

#### 2.2f Router 迁移 (与上述并行)
```tsx
// 新 React hash router hook
function useBlogRouter() {
  const [route, setRoute] = useState(parseHash(location.hash));
  useEffect(() => {
    const handler = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route; // { view: 'group'|'member'|'detail'|'stats'|'interactions', params: {...} }
}
```
- 保持 `#hash` URL 格式不变
- React 组件根据 route 切换视图
- 替代 `router.js` (518行)

### 2.3 Phase 3: 清理 + 性能优化 (Phase 2 全部完成后)

1. **移除 legacy 文件**: `public/js/blog/*.js`, `public/css/blog/*.css`, `BlogLayout.astro`
2. **移除 DaisyUI/Tailwind v3**: 所有样式统一 Tailwind v4
3. **动态导入**: Chart.js 仅在 Stats 视图加载
4. **API 优化**: `loadGroupInfo` 不再拉 `?limit=500`，改用专用端点
5. **图片优化**: Astro `<Image>` 组件 + 响应式 srcset
6. **SEO**: 替代 `seo-manager.js`，用 Astro 的 `<head>` 管理

---

## 3. 迁移后架构

```
src/pages/blog/index.astro
  └─ BaseLayout.astro (统一 layout, ClientRouter ✅)
      └─ <BlogApp client:load />  ← 单个 React island
          ├─ useBlogRouter()       ← hash routing hook
          ├─ <BlogGrid />          ← #all / #nogizaka / ...
          ├─ <MemberPage />        ← #{group}/member/{name}
          ├─ <BlogDetail />        ← #blog/{id}
          ├─ <BlogStats />         ← stats
          └─ <BlogInteractions />  ← interactions
```

**文件结构**:
```
src/components/blog/
├─ BlogApp.tsx            ← 入口 + router
├─ BlogGrid.tsx           ← 博客列表 + 筛选
├─ BlogCard.tsx           ← 博客卡片
├─ MemberPage.tsx         ← 成员个人页
├─ BlogDetail.tsx         ← 博客详情
├─ BlogDetailSidebar.tsx  ← 详情页侧边栏
├─ BilingualControl.tsx   ← 双语对照
├─ BlogStats.tsx          ← 数据统计
├─ BlogInteractions.tsx   ← 关系分析
├─ BlogCalendar.tsx       ← 日历组件
└─ hooks/
    ├─ useBlogRouter.ts   ← hash routing
    ├─ useBlogApi.ts      ← API 调用 + 缓存
    └─ usePagination.ts   ← 分页逻辑
```

---

## 4. 预估工作量

| Phase | 内容 | 预估时间 | 可独立部署 |
|-------|------|----------|-----------|
| **1** | Layout 统一 + CSS 隔离 | 2-3h | ✅ |
| **2a** | Stats React 化 | 1-2h | ✅ |
| **2b** | Interactions React 化 | 2h | ✅ |
| **2c** | Blog Grid React 化 | 3-4h | ✅ |
| **2d** | Member Page React 化 | 3h | ✅ |
| **2e** | Blog Detail React 化 | 4-5h | ✅ |
| **2f** | Router 迁移 | 含在 2c 中 | — |
| **3** | 清理 + 优化 | 2h | ✅ |
| **总计** | | **~18-21h** | |

---

## 5. 建议执行顺序

**Phase 1 → 2c → 2f → 2d → 2e → 2a → 2b → 3**

理由:
- Phase 1 (Layout统一) 先做，立即消除白屏和 CSS 冲突
- Blog Grid (2c) + Router (2f) 是核心，决定了其他组件的接口
- Member Page (2d) 和 Blog Detail (2e) 依赖 Router 先就位
- Stats (2a) 和 Interactions (2b) 最独立，放最后
- Phase 3 清理是所有 React 迁移完成后的收尾工作

## 6. 备注

- **不建议**: 同时维护两套路由（Astro path routing + hash routing），会增加复杂度
- **推荐**: 保持 hash routing 直到全部迁移完成，最后一次性切换到 path routing (如 `/blog/nogizaka`, `/blog/post/xxx`)
- **从首页进入**: `HomeBlogSection.tsx` 的链接 `href="/blog#blog/{id}"` + `data-astro-reload` 在 Phase 1 后可以去掉 `data-astro-reload`，实现无刷新跳转
