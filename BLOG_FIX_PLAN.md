# 博客重构后缺失功能修复文档

> 基于 `BLOG_REFACTOR_PLAN.md` Phase 2 的 React 迁移完成后，对比旧版 vanilla JS 代码确认的缺失/退化功能清单。

---

## 缺失功能一览

| # | 功能 | 严重度 | 涉及文件 | 旧实现 |
|---|------|--------|----------|--------|
| 1 | **双语切换 (桌面+手机)** | P0 | `BlogDetail.tsx` | `bilingual-control-v2.js` (424行) |
| 2 | **汉堡菜单无响应** | P1 | 全局 Navbar | `mobile-menu.js` (12行) |
| 3 | **日历点击不跳转** | P1 | `MemberPage.tsx`, `BlogDetail.tsx` | `member-page.js` |
| 4 | **毕业成员灰度+十字架** | P1 | `BlogGrid.tsx` CSS | `member-page.js` |
| 5 | **筛选排序缺失** | P1 | `BlogGrid.tsx` | `app.js` |
| 6 | **翻页不回顶** | P2 | `BlogGrid.tsx` | `pagination.js` |
| 7 | **成员页手机端无日历/查看更多** | P1 | `MemberPage.tsx` | `member-page.js` |
| 8 | **返回按钮 vs 左滑** | P2 | `BlogDetail.tsx`, `MemberPage.tsx` | 旧版无此问题 |

---

## 1. 双语切换 (中日対照 / 仅中文 / 仅日文) — P0

### 现状
- `BlogDetail.tsx` 直接用 `dangerouslySetInnerHTML` 渲染 `bilingual_content`
- **完全没有** 切换控件，用户只能看到默认的双语对照模式
- 桌面端、手机端均缺失

### 旧实现 (`bilingual-control-v2.js`)
- 3种模式: `bilingual` / `chinese` / `japanese`
- **桌面端**: 文章标题区的下拉选择器 `#languageSelector`
- **手机端**: 右下角 FAB 浮动按钮 `#fabContainer`
- 通过 CSS class 控制 `<p lang="ja">` / `<p lang="zh">` 的显示/隐藏
- 模式保存到 `localStorage`

### 修复方案
在 `BlogDetail.tsx` 中新增 `BilingualControl` 组件:

```
BlogDetail.tsx
├─ header 区域添加桌面端下拉选择器
├─ 页面底部添加手机端 FAB
├─ useState 管理当前模式
├─ useEffect 监听模式变化，操作 contentRef 内的 p[lang] 元素
└─ localStorage 持久化用户选择
```

**关键逻辑**:
```tsx
// 旧代码中的核心切换逻辑
function applyMode(mode: string, contentRef: RefObject<HTMLDivElement>) {
  const container = contentRef.current;
  if (!container) return;
  
  container.querySelectorAll('p[lang="ja"]').forEach(el => {
    (el as HTMLElement).style.display = mode === 'chinese' ? 'none' : '';
  });
  container.querySelectorAll('p[lang="zh"]').forEach(el => {
    (el as HTMLElement).style.display = mode === 'japanese' ? 'none' : '';
  });
}
```

**CSS 需新增**: FAB 样式（旧代码在 `public/css/blog/bilingual-fab.css`）

---

## 2. 汉堡菜单无响应 — P1

### 现状
- 右上角汉堡菜单图标 (≡) 点击无反应
- 这不是博客组件的问题，而是全局 **Navbar** 的问题

### 排查方向
- 检查 `src/components/Navbar.astro` 或对应的 React 组件
- 博客页面使用 `BaseLayout` → Navbar → 汉堡菜单 JS 可能未正确加载
- 旧版 `BlogLayout.astro` 可能有独立的菜单逻辑

### 修复
- 确认 Navbar 中的 mobile menu toggle 逻辑是否正常绑定事件
- 可能需要在 blog 页面的 Astro entry 中确保 Navbar 的 client-side JS 被加载

---

## 3. 日历点击不跳转 — P1

### 现状

**`MemberPage.tsx` 日历**:
```tsx
// 第 163-176 行：有 cursor: pointer 但 **无 onClick**
<div style={{
  cursor: hasBlog ? 'pointer' : 'default',
  // ❌ 无 onClick 处理
}}>
  {day}
</div>
```

**`BlogDetail.tsx` 日历**: 同样无 onClick (第 245-263 行)

### 旧实现
- 点击有博客的日期 → 滚动到该日期对应的博客条目
- 或者跳转到成员页面并滚动到该日期

### 修复方案
```tsx
// MemberPage.tsx 日历日期点击
onClick={() => {
  if (!hasBlog) return;
  // 方案A: 滚动到该日期的博客
  const targetBlog = blogs.find(b => {
    const parts = extractDateParts(b.publish_date);
    return parts?.day === day;
  });
  if (targetBlog) {
    onNavigate(`#blog/${targetBlog.id}`);
  }
}}

// BlogDetail.tsx 日历日期点击
onClick={() => {
  if (!hasBlog) return;
  const targetBlog = memberBlogs.find(b => {
    const parts = extractDateParts(b.publish_date);
    return parts?.day === day && parts?.month === calMonth + 1;
  });
  if (targetBlog) onNavigate(`#blog/${targetBlog.id}`);
}}
```

---

## 4. 毕业成员灰度+十字架标识 — P1

### 现状
- `BlogGrid.tsx` 第 358-367 行有 `member-item--graduated` CSS class
- 但 **CSS 样式可能未定义** 或丢失

### 旧实现
- 毕业成员名字灰度显示
- 名字前或后有十字架 (†) 图标
- 成员列表中视觉区分

### 修复方案
新增 CSS:
```css
.member-item--graduated {
  opacity: 0.5;
  filter: grayscale(0.5);
  position: relative;
}
.member-item--graduated::after {
  content: ' †';
  font-size: 0.8em;
}
```

同时检查 `BlogGrid.tsx` 第 233-245 行的 filter dropdown 中已毕业成员的显示:
```tsx
// 当前代码已有 optgroup，但可能需要确认 API 返回的 graduated 数组是否正确
{groupData?.graduated && groupData.graduated.length > 0 && (
  <optgroup label="── 已毕业 ──">
    {groupData.graduated.map(m => (
      <option key={m} value={m}>{m}（已毕业）</option>
    ))}
  </optgroup>
)}
```

---

## 5. 筛选排序缺失 — P1

### 现状
- `BlogGrid.tsx` 有成员筛选 dropdown
- **缺少**: 排序选项（最新/最旧）
- **缺少**: "最近更新" 时间显示（每个成员的最后更新时间）
- 截图中 FILTER dropdown 只有成员列表，无期别分组标题

### 旧实现
- 排序: 最新优先 / 最旧优先
- 成员列表按期别分组显示（optgroup）
- 显示每个成员的最新博客时间

### 修复方案
1. **添加排序选择器**: 在 filter 区域添加 "排序" dropdown
```tsx
<select onChange={handleSortChange}>
  <option value="newest">最新优先</option>
  <option value="oldest">最旧优先</option>
</select>
```

2. **成员筛选按期别分组**: 修改 member filter dropdown 使用 `<optgroup>`
```tsx
{groupData?.generations?.map(gen => (
  <optgroup key={gen.name} label={gen.name}>
    {gen.members
      .filter(m => !groupData.graduated?.includes(m))
      .map(m => <option key={m} value={m}>{m}</option>)}
  </optgroup>
))}
```

3. **最新更新显示**: 需要额外 API 调用或在 stats 数据中获取

---

## 6. 翻页不回顶 — P2

### 现状
`BlogGrid.tsx` 第 305-320 行 pagination 按钮只调用 `setPage()`:
```tsx
onClick={() => setPage(Number(p))}
// ❌ 没有 scrollTo
```

### 修复
```tsx
onClick={() => {
  setPage(Number(p));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}}
```

同样修复上一页/下一页按钮。

---

## 7. 成员页手机端无日历/查看更多 — P1

### 现状
`MemberPage.tsx` 第 208-213 行:
```tsx
@media (max-width: 768px) {
  .member-page-layout { grid-template-columns: 1fr !important; }
  .member-page-sidebar { display: none !important; }  // ❌ 日历完全隐藏
}
```

`BlogDetail.tsx` 第 312-315 行同样问题:
```tsx
.blog-detail-sidebar { display: none !important; }  // ❌ 手机端无侧边栏
```

### 修复方案
手机端不隐藏整个 sidebar，而是**重新排列**:
```tsx
@media (max-width: 768px) {
  .member-page-layout {
    grid-template-columns: 1fr !important;
  }
  .member-page-sidebar {
    position: static !important;  /* 取消 sticky */
    order: -1;  /* 移到博客列表上方 */
  }
}
```

或者在手机端将日历和成员信息抽出作为**页面顶部卡片**，不在 sidebar 中。

---

## 8. 返回按钮 vs 左滑 — P2

### 现状
- `BlogDetail.tsx` 和 `MemberPage.tsx` 左上角有 "< 返回" 按钮
- 使用 `window.history.back()` / `onNavigate(#group)`

### 建议
- **保留返回按钮** (桌面端需要)
- 手机端可以添加左滑手势 (touch events):
```tsx
// 简易左滑返回
useEffect(() => {
  let startX = 0;
  const onTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (dx > 80 && startX < 40) window.history.back();  // 从左边缘右滑 80px
  };
  document.addEventListener('touchstart', onTouchStart);
  document.addEventListener('touchend', onTouchEnd);
  return () => { /* cleanup */ };
}, []);
```

---

## 后端 API 路由对照

### 已对接的路由

| 后端路由 | 前端调用 | 状态 |
|----------|----------|------|
| `GET /api/blogs` | `fetchBlogs()` | ✅ |
| `GET /api/blogs/:id` | `fetchBlogById()` | ✅ |
| `GET /api/search` | `searchBlogs()` | ✅ |
| `GET /api/members/:group` | `fetchGroupMembers()` | ✅ |

### 未对接的路由

| 后端路由 | 用途 | 前端需要 |
|----------|------|----------|
| `GET /api/stats` | 博客统计数据 | ⚠️ `BlogApp.tsx` 有 `StatsPlaceholder` 但未实现 |
| `GET /api/members/all` | 全部成员 | ❌ 未使用 |
| `GET /api/proxy/image` | 图片代理 | ❌ 改用 Cloudinary |
| `GET /api/stats/state` | 状态统计 | ❌ 管理用 |
| `POST /api/notify` | 通知 | ❌ 管理用 |

### 前端未实现的视图

| 视图 | 旧实现 | 新状态 |
|------|--------|--------|
| **数据统计** | `stats.js` (348行) + Chart.js | `StatsPlaceholder` 占位符 |
| **关系分析** | `interactions.js` (376行) | `InteractionsPlaceholder` 占位符 |
| **图片下载** | `image-download.js` (303行) | ❌ 未实现 |
| **分享功能** | `share-module.js` | ❌ 未实现 |

---

## 建议修复顺序

1. **P0 双语切换** — 核心功能，影响所有用户阅读体验
2. **P1 翻页回顶** — 一行代码修复
3. **P1 日历点击** — 几行代码
4. **P1 毕业成员样式** — CSS 补充
5. **P1 手机端日历/sidebar** — 响应式布局调整
6. **P1 筛选排序** — 添加排序控件
7. **P1 汉堡菜单** — 需排查全局 Navbar
8. **P2 左滑返回** — 增强体验

---

## 参考文件

### 旧版 vanilla JS (可参考逻辑)
- `public/js/blog/bilingual-control-v2.js` — 双语切换 (424行)
- `public/js/blog/member-page.js` — 成员页日历+列表 (1170行)
- `public/js/blog/member-detail.js` — 博客详情 (670行)
- `public/js/blog/blog-detail-sidebar.js` — 侧边栏 (430行)
- `public/js/blog/image-download.js` — 图片下载 (303行)
- `public/js/blog/pagination.js` — 分页+回顶
- `public/js/blog/app.js` — 主逻辑

### 新版 React 组件
- `src/components/blog/BlogDetail.tsx` — 博客详情 (324行)
- `src/components/blog/MemberPage.tsx` — 成员页 (217行)
- `src/components/blog/BlogGrid.tsx` — 列表页 (389行)
- `src/components/blog/BlogApp.tsx` — 入口 (160行)
- `src/components/blog/blog-api.ts` — API 客户端 (231行)
- `src/components/blog/blog-config.ts` — 配置 (112行)
- `src/components/blog/useBlogRouter.ts` — 路由 (88行)
