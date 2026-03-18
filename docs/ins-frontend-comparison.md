# Instagram 归档前端对比分析

## 两个前端概览

| 项目 | sakamichi-platform | instagram-archive-frontend |
|------|-------------------|---------------------------|
| 框架 | Astro + React (TSX) | 原生 JS (vanilla) |
| 部署 | Cloudflare Pages | Cloudflare Pages |
| API 端点 | `/api/file-list` (全量) | `/api/media` (分页) |
| 数据加载 | 一次加载全部 32K 文件，客户端过滤/排序 | 服务端分页 + 排序，每页按需加载 |

---

## 核心差异

### 1. 数据获取与排序

**archive-frontend**:
- 使用 `/api/media?page=1&limit=50&sort=publish_time&order=desc&username=xxx`
- 服务端排序，返回精确分页
- `PublishTime` 精度：新数据有完整时间戳 (`2026-03-15T11:20:19.000Z`)，旧数据只有日期 (`2022-10-23T00:00:00`)

**platform (当前)**:
- 使用 `/api/file-list` 一次返回全部 32425 条记录
- 客户端 `Array.sort()` 排序
- ~~使用字符串 `localeCompare` 比较 PublishTime~~ → 已修复为 `new Date().getTime()` 数值比较

**⚠️ 未解决问题**: 
- 客户端对 32K 条记录排序性能较差
- `/api/file-list` 和 `/api/media` 返回的 `PublishTime` 格式不完全一致（有无 `Z` 后缀、`.000Z` 等）
- 无时间精度的旧数据（`T00:00:00`）在同一天内排序不稳定



### 2. 视频缩略图预览

**archive-frontend**:
```html
<video class="lazy-video" data-src="${file.url}" muted></video>
```
- IntersectionObserver 触发时设置 `video.src = data-src`
- 无 `preload`、无 `playsInline`、无 `#t=0.1`
- 部分视频能显示首帧，部分显示黑屏（取决于视频编码和浏览器）

**platform (当前)**:
```tsx
<video src={src} muted className="w-full h-full object-cover" />
```
- React 状态驱动：`visible` 为 true 时渲染 `<video>` 并设置 `src`
- 理论上与 archive-frontend 行为一致

**⚠️ 未解决问题**:
- 两个前端的视频首帧显示效果应该相同，但用户反馈 platform 不显示
- 可能原因：
  1. **`object-cover` CSS**: platform 使用 `object-cover` 裁剪视频，archive 未使用此属性 → 视频可能被裁剪到不可见区域
  2. **容器尺寸**: platform 使用 `aspect-square` 固定宽高比，视频在容器内可能无法正确渲染
  3. **React 渲染时机**: React 在虚拟 DOM diff 后才插入实际 DOM，可能影响浏览器视频预加载行为
  4. **AList CORS**: `alist.sakamichi-tools.cn` 可能不返回视频文件的 CORS 头，某些浏览器会阻止跨域视频渲染



### 3. 下载按钮

**archive-frontend**:
```html
<button class="download-btn" onclick="event.stopPropagation(); downloadFile('${file.url}', '${file.filename}')">
```
- `downloadFile()` 全局函数，创建临时 `<a>` 标签触发下载
- 按钮始终可见（非 hover 显示）

**platform (当前)**:
```tsx
<button onClick={(e) => { e.stopPropagation(); window.open(url, '_blank'); }}>
```
- hover 时显示在右上角
- 使用 `window.open` 打开新标签（因为 `<a download>` 属性对跨域 URL 无效）

**⚠️ 未解决问题**:
- 用户反馈下载按钮不可见
- 可能原因：`opacity-0 group-hover:opacity-100` 在触摸设备上无效；或 `group` class 作用域问题
- `window.open` 只是打开新标签页，不是真正的下载


### 4. 时间戳显示

**archive-frontend**:
```js
const date = new Date(file.publishTime).toLocaleDateString('zh-CN');
// 输出: "2026/3/15"
```

**platform (当前)**:
```tsx
const hms = d.toTimeString().split(' ')[0];
dateStr = hms === '00:00:00' || hms === '09:00:00' ? ymd : `${ymd} ${hms.slice(0, 5)}`;
// 输出: "2026-03-15 11:20" 或 "2022-10-23" (无精确时间时)
```
- ✅ 已解决：有精确时间的显示时分，无精确时间的只显示日期

### 5. Modal 预览

**archive-frontend**:
- 使用 Plyr 播放器（自定义控件）
- 有明确的关闭(×)、下载、分享按钮
- 键盘导航：Escape 关闭，←→ 切换

**platform (当前)**:
- 使用原生 `<video controls>` 播放
- 有关闭(×)、下载、复制链接按钮
- 键盘导航：支持
- ✅ 功能基本对齐

### 6. 图片缩略图

**archive-frontend**:
```js
// 使用服务端 /api/thumb 生成指定宽度的缩略图
buildResponsiveImageUrl(key, gridSize) {
    const width = gridSize === 'small' ? 200 : gridSize === 'medium' ? 400 : 600;
    return `${API_BASE}/api/thumb/${encodeURIComponent(key)}?w=${width}`;
}
```
- 服务端用 Pillow 压缩到指定宽度，缓存在 `thumbs/` 目录

**platform (当前)**:
- 直接使用 AList 全尺寸原图 URL
- 加载 32K 张全尺寸图片会消耗大量带宽

**建议**: 集成 `/api/thumb` 端点生成适合网格尺寸的缩略图

---

## 已完成的修复

1. ✅ `MediaItem` 接口添加 `PublishTime` 字段
2. ✅ `fetchAllFiles` 优先使用 `f.PublishTime`
3. ✅ 排序改用 `new Date().getTime()` 数值比较
4. ✅ 时间戳显示具体时间（有精度时）
5. ✅ 添加 `LazyVideo` 组件
6. ✅ 卡片从 `<button>` 改为 `<div>`（修复嵌套交互元素问题）
7. ✅ 修复 `getAccountsByGroup` 调用签名

## 仍需解决

1. ❌ **视频首帧不显示** — 需排查 CSS `object-cover` / React 渲染时机 / CORS
2. ❌ **下载按钮不可见** — 需改为始终可见或排查 hover 机制
3. ⚠️ **性能** — 客户端加载排序 32K 条 + 全尺寸图片，建议改用分页 API + 缩略图
