# Sakamichi Tools 全项目前端核心逻辑分析

> 逐一浏览每个项目的前端，提取核心特征，为统一样式集成提供依据

---

## 一、博客翻译 (sakamichi-blog-frontend)

**技术栈**：原生 HTML + Tailwind CDN + DaisyUI + 手写 JS 模块  
**部署**：`blog.sakamichi-tools.cn`

### 核心模块与逻辑

| 模块 | 文件 | 核心逻辑 |
|------|------|---------|
| **路由** | `router.js` | Hash路由 `#blog/{id}`, `#member/{name}/{group}`, 支持浏览器前进/后退 |
| **全局状态** | `state.js` | `window.App` 对象管理当前团体、页码、搜索词、成员筛选等 |
| **团体配置** | `group-config.js` | 3团体元数据（key/name/apiName/color/baseUrl） |
| **博客渲染** | `blog-renderer.js` | Markdown→HTML，支持 `[NEWLINE:]` `[IMAGE:]` 结构化标签，双语渲染 |
| **SEO** | `seo-manager.js` | 动态更新 meta/title/canonical |
| **应用主逻辑** | `app.js` | 博客列表加载、搜索、分页、成员筛选、团体切换、无限滚动 |
| **图片下载** | `image-download.js` | 博客图片批量下载 |
| **分享** | `share-module.js` | 社交分享功能 |
| **详情侧边栏** | `blog-detail-sidebar.js` | 博客详情页的侧边栏（目录/相关推荐） |
| **成员页** | `member-page.js` (动态加载) | 成员个人博客列表 |
| **成员详情** | `member-detail.js` (动态加载) | 成员博客详情 |
| **成员API** | `members-api.js` (ES Module) | 从后端获取成员数据，1小时缓存 |

### 页面核心特征

1. **团体Tab切换** — 乃木坂46 / 樱坂46 / 日向坂46，每个团体有不同主题色
2. **搜索框** — 实时搜索 + debounce，支持成员名自动建议
3. **博客卡片网格** — 响应式网格布局，卡片含封面图、标题、成员名、日期
4. **分页 + 无限滚动** — 传统分页 + IntersectionObserver 无限加载
5. **成员网格** — 按期别分组的成员头像网格，点击筛选
6. **博客详情页** — 中日双语内容，图片查看器，侧边栏导航
7. **Loading/Empty状态** — 骨架屏 + 空状态提示
8. **多语言** — 中/英/日 UI 切换
9. **暗色模式** — DaisyUI theme 切换

### 关键DOM结构
```
header > (logo, group-tabs, search-input, theme-toggle, lang-toggle, mobile-menu-btn)
main > (group-info-stats, blog-grid, loading-state, empty-state, pagination, member-grid)
mobile-sidebar > (nav-links)
```

---

## 二、生写卡片生成器 (photo-card-generator)

**技术栈**：原生 HTML + Tailwind CDN + CropperJS + html2canvas  
**部署**：`photocard.sakamichi-tools.cn`

### 核心模块与逻辑

| 模块 | 文件 | 核心逻辑 |
|------|------|---------|
| **主逻辑** | `js/script.js` | 参数绑定、实时预览、html2canvas 生成、下载 |
| **多语言** | `js/script.js` 内 `translations` 对象 | 中/英/日 三语切换 |
| **裁切** | CropperJS | 上传图片后裁切为指定比例 |
| **样式** | `css/style.css` | 导航栏、移动端菜单、信息栏预览 |

### 页面核心特征

1. **左右分栏布局** — 左侧控制面板（8个可折叠区块），右侧实时预览
2. **8步配置流程**：
   - 上传主图片 → CropperJS 裁切
   - 样式选择（櫻坂46/日向坂46/乃木坂46/乃木坂46②）
   - 成员姓名输入
   - 罗马字（可选，toggle显示）
   - 主题文字（支持第二行）
   - 字体样式（6种预设 + 自定义上传，含粗细/字间距调节）
   - 颜色与边框（信息栏底色/文字色/边框色，含色板快捷选择）
   - 尺寸位置微调（信息栏边距、Logo/团名/主题/姓名/罗马字 各自XY偏移+大小）
3. **实时预览** — 所有滑块/输入改变即时反映到右侧预览卡片
4. **html2canvas 生成** — 点击"生成并下载"按钮，html2canvas 渲染后自动下载
5. **移动端长按保存** — 移动端弹出模态框显示生成图片供长按保存
6. **参数重置** — 一键恢复默认参数
7. **打赏模态框** — 支付宝/微信二维码
8. **页面切换动画** — fade-in/fade-out 过渡

### 关键DOM结构
```
navbar > (logo, links[坂道中字博客, MSG生成器, 生写生成器, 字幕导出, 时间轴修复, FAD特效], lang-switcher, mobile-menu)
main > grid(control-panel[8个details折叠面板], preview[photo-card实时预览])
crop-modal, save-modal, error-modal, donate-modal
footer
```

### 关键依赖
- `html2canvas 1.4.1` — 截图生成
- `CropperJS 1.6.1` — 图片裁切
- 自定义字体文件（UDXinWan, mplus1p, Soft Go Std, bebasneue, AaChaoDaJianYuan）

---

## 三、MSG样式生成器 (MSG生成)

**技术栈**：原生 HTML + Tailwind CDN + html2canvas  
**部署**：`msg.sakamichi-tools.cn`

### 核心模块与逻辑

| 模块 | 核心逻辑 |
|------|---------|
| **成员侧边栏** | 左侧固定面板，按团体tab（置顶/乃木坂/樱坂/日向坂）显示成员列表 |
| **置顶系统** | localStorage 存储置顶成员，支持拖拽排序 |
| **聊天气泡** | 可编辑的 contenteditable div，支持文字+图片 |
| **团体样式** | 3种 header 渐变色（日向坂蓝/樱坂粉/乃木坂紫） |
| **截图下载** | html2canvas 生成聊天截图 |
| **头像管理** | 点击头像可上传自定义图片，FileReader → dataURL |

### 页面核心特征

1. **三栏布局**：
   - 左侧：成员选择面板（固定定位，按期别分组，含头像+名字）
   - 中间：聊天消息区域（模拟 MSG app 样式）
   - 下方：操作按钮（添加消息/添加图片消息/下载）
2. **聊天消息操作**：
   - 添加文字消息框 (`addChatBox`)
   - 添加图片消息框 (`addImageChatBox`)
   - 拖拽排序消息框 (`enableChatBoxDragSort`)
   - 删除单条消息
   - 粘贴清洗（去除格式）
3. **成员预设系统**：
   - 点击成员 → 自动填充头像+姓名+header样式
   - 置顶/取消置顶（☆/★）
   - 置顶成员拖拽排序
   - 自定义头像上传
4. **Header样式** — 模拟 MSG app 的团体色 header（紫/粉/蓝渐变）
5. **移动端FAB** — 浮动操作按钮（添加消息/截图下载）
6. **移动端成员切换** — 底部弹出式成员选择面板

### 关键DOM结构
```
navbar > (logo, links[坂道中字博客, 生写生成器, MSG生成器], mobile-menu)
preset-container > (group-tabs[置顶/乃木坂/樱坂/日向坂], presets-scroll[preset-sections])
msg-area > header + chat-container > chat-box[avatar + chat-content + delete-btn]
desktop-buttons / fab-container(mobile)
footer
```

### 关键依赖
- `html2canvas` — 截图生成
- Google Fonts: `M+PLUS 1p`, `Noto Sans SC`, `Noto Sans JP`

---

## 四、字幕底图制作 (字幕底图制作)

**技术栈**：原生 HTML + CSS + Canvas API (ES Module)  
**部署**：独立页面（无导航栏）

### 核心模块与逻辑

| 模块 | 文件 | 核心逻辑 |
|------|------|---------|
| **全局状态** | `app.js` state对象 | 管理背景、对话框列表、头像参数 |
| **Canvas渲染** | `app.js` render() | requestAnimationFrame 实时渲染到 1920×1080 Canvas |
| **历史记录** | `app.js` historyStack | 撤回操作（Ctrl+Z） |
| **成员数据** | `data/member-images.json` | 成员头像URL列表 |
| **持久化** | localStorage | 保存/恢复对话框参数 |

### 页面核心特征

1. **左右分栏布局** — 左侧 Canvas 预览（1920×1080），右侧控制面板
2. **多对话框系统**：
   - 添加/移除对话框
   - Tab切换当前编辑的对话框
   - 等分排列所有框
   - 同步当前参数到所有框
3. **3大控制区域**：
   - 背景设置（上传背景图、模糊度）
   - 对话框设置（底边距、高度、左右边距、圆角、背景色/透明度、边框色/粗细）
   - 头像设置（选择成员头像/上传自定义、大小、偏移、缩放、挂载方式[内嵌/左边缘/右边缘]、形状[圆形/方形]）
4. **Canvas 实时渲染** — 所有参数改变立即重绘 Canvas
5. **导出 PNG** — Canvas.toDataURL → 下载
6. **撤回** — historyStack 支持 undo
7. **无导航栏** — 独立页面，无统一导航

### 关键DOM结构
```
app-container > (preview-area[canvas + export-btn], control-panel[header + box-tabs + controls])
```

---

## 五、字幕工具集 (photo-card-generator 下的子页面)

### 5a. 字幕导出工具 (subtitle.html)
- **功能**：SRT字幕合并，Time-gap + 短句优先 + 长度限制
- **核心逻辑**：`js/subtitle.js` + `js/subtitle-merger.js`
- **输入**：上传 SRT 文件
- **输出**：合并后的字幕文件下载

### 5b. 时间轴修复工具 (srt_fixer.html)
- **功能**：SRT/ASS 时间轴偏移修复
- **核心逻辑**：`js/srt_fixer.js`
- **输入**：上传字幕文件 + 偏移量
- **输出**：修复后的字幕文件下载

### 5c. FAD特效工具 (fad_tool.html)
- **功能**：字幕淡入淡出特效添加
- **核心逻辑**：内联 JS
- **输入**：ASS 字幕文件
- **输出**：添加 fad 特效后的字幕文件

### 共同特征
- 都使用**相同的导航栏**和**移动端菜单**
- 纯前端处理（File API + Blob），无需后端
- 输入 → 处理 → 下载 的简单流程
- 支持三语（中/英/日）

---

## 六、广播前端 (Radiko Frontend)

**技术栈**：Svelte + Vite + Lucide Icons + 自定义 CSS  
**部署**：内部管理面板

### 核心模块与逻辑

| 组件 | 功能 |
|------|------|
| `ProgramGuide.svelte` | 节目指南/搜索 |
| `RecordingQueue.svelte` | 录制任务队列管理 |
| `ScheduledQueue.svelte` | 定时录制队列 |
| `ScheduledStreamQueue.svelte` | 定时推流队列 |
| `ProgramSchedule.svelte` | 节目时间表 |
| `StationStreaming.svelte` | 电台实时推流 |
| `KeywordRecording.svelte` | 关键词自动录制 |
| `KeywordRules.svelte` | 关键词规则管理 |
| `Settings.svelte` | 系统设置（基础/推流/自动推流/录制/高级） |

### 页面核心特征

1. **侧边栏导航** — 可折叠侧边栏，图标+文字导航
2. **暗色模式** — data-theme 切换
3. **视图切换** — currentView 状态管理当前显示的组件
4. **后端API驱动** — 所有数据通过 REST API 与 Python backend 交互
5. **移动端** — 响应式侧边栏（汉堡菜单）

> 注意：此前端是**管理面板**性质，面向管理员，不面向普通用户。普通用户需要的是**归档查看**和**实时收听**功能。

---

## 七、各项目共性总结

### 7.1 共享导航栏模式

所有面向用户的页面共享相同的导航栏模式：
```html
<nav class="navbar">
  <div class="navbar-left">
    <a class="navbar-logo">Sakamichi Tools</a>
    <div class="navbar-links">...</div>
  </div>
  <div class="navbar-right">
    <select class="language-switcher">...</select>
    <button class="mobile-menu-btn">...</button>
  </div>
</nav>
<div class="mobile-menu-overlay"></div>
<div class="mobile-sidebar">...</div>
```

### 7.2 共享样式基础
- **Tailwind CDN** — 全部使用 cdn.tailwindcss.com
- **紫色系主题** — violet/purple 为主色调
- **共享 CSS** — navbar/mobile-menu 样式在 `css/style.css` 或 `css/styles.css` 中几乎相同
- **Google Fonts** — Noto Sans JP, M+PLUS 1p 等日文字体

### 7.3 共享交互模式
- **移动端侧边栏菜单** — 所有页面相同的汉堡菜单
- **三语切换** — 中/英/日
- **页面切换动画** — fade-in/fade-out
- **html2canvas 截图** — 生写和MSG都用

### 7.4 核心差异

| 项目 | 渲染方式 | 数据来源 | 交互复杂度 |
|------|---------|---------|-----------|
| 博客翻译 | DOM + Markdown→HTML | REST API | 高（路由/搜索/分页/筛选） |
| 生写生成器 | DOM预览 + html2canvas | 纯本地 | 中（参数调节+实时预览） |
| MSG生成器 | DOM + html2canvas | 纯本地 + 成员图片CDN | 中（拖拽/编辑/截图） |
| 字幕底图 | Canvas 2D | 纯本地 + 成员JSON | 中（多对话框+实时Canvas） |
| 字幕工具集 | 纯文本处理 | 纯本地（文件上传） | 低（输入→处理→下载） |
| 广播前端 | Svelte 组件 | REST API | 高（管理面板） |

---

## 八、统一集成建议

### 8.1 统一导航（Astro组件化）

将共享的 navbar 和 mobile-sidebar 抽取为 Astro 组件：
```
src/components/
├── Navbar.astro          ← 统一导航栏
├── MobileSidebar.astro   ← 统一移动端菜单
├── Footer.astro          ← 统一页脚
└── LanguageSwitcher.astro ← 统一语言切换
```

导航项根据当前页面动态高亮，导航结构统一为：
```
博客翻译 | MSG归档 | 广播 | 工具箱 ▾ | 周边
                      └── 生写生成器
                      └── MSG生成器
                      └── 字幕底图
                      └── 字幕工具
                      └── 时间轴修复
                      └── FAD特效
```

### 8.2 各工具集成方式

| 工具 | 集成方式 | 理由 |
|------|---------|------|
| **博客翻译** | 已有 Astro 页面 + 现有 JS 模块 | 已完成，保持现状 |
| **生写生成器** | Astro 页面 + 迁移核心 JS | 依赖 html2canvas + CropperJS，需保留完整逻辑 |
| **MSG生成器** | Astro 页面 + 迁移核心 JS | 依赖 html2canvas + 成员数据，需保留完整逻辑 |
| **字幕底图** | Astro 页面 + 迁移 Canvas 逻辑 | Canvas API 独立，迁移较简单 |
| **字幕工具集** | Astro 页面 + 迁移 JS | 纯文件处理，迁移最简单 |
| **MSG归档** | 新建 Astro 页面 + React 组件 | 全新功能，直接用现代方案 |
| **广播归档** | 新建 Astro 页面 | 普通用户版本，不需要管理面板 |

### 8.3 统一样式方案

替换所有 Tailwind CDN 为项目内 Tailwind：
- `sakamichi-platform` 已配置 Tailwind
- 抽取共享 CSS 变量（团体色、主题色等）
- 统一字体加载方案
- 统一组件样式（按钮、卡片、模态框、输入框等）

### 8.4 迁移顺序建议

1. **第一步**：统一 Navbar/Footer 组件 → 所有页面共享
2. **第二步**：迁移字幕工具集（最简单，验证流程）
3. **第三步**：迁移字幕底图制作（Canvas 独立性强）
4. **第四步**：迁移生写生成器（保留 html2canvas 核心）
5. **第五步**：迁移 MSG 生成器（保留聊天气泡+截图核心）
6. **第六步**：新建 MSG 归档页面
7. **第七步**：新建广播归档页面
