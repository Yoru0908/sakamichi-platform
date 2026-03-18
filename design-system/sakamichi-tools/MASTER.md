# Sakamichi Tools — Design System Master

> **LOGIC:** When building a specific page, first check `design-system/sakamichi-tools/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Sakamichi Tools
**Style:** Refined Minimalism (content-first community platform)
**Stack:** Astro 5 + Tailwind CSS 4 + React Islands + Lucide Icons
**Fonts:** Noto Sans JP (body) + Noto Serif JP (headings/editorial)

---

## 1. Color System

### 1.1 Brand Colors (Group Identity)

| Group | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| Nogizaka46 | `#742581` | `brand-nogi` | Primary brand, default accent |
| Sakurazaka46 | `#F19DB5` | `brand-sakura` | Group-specific accent |
| Hinatazaka46 | `#7BC7E8` | `brand-hinata` | Group-specific accent |

### 1.2 Semantic Colors (Light Mode)

| Role | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Background | `#FAFAFA` | `bg-surface` | Page background |
| Surface | `#FFFFFF` | `bg-surface-primary` | Cards, panels |
| Surface Alt | `#F5F5F5` | `bg-surface-secondary` | Alternating rows, sidebar |
| Text Primary | `#1A1A1A` | `text-primary` | Headings, body text |
| Text Secondary | `#525252` | `text-secondary` | Captions, metadata |
| Text Muted | `#A3A3A3` | `text-muted` | Placeholders, disabled |
| Border | `#E5E5E5` | `border-default` | Card borders, dividers |
| Border Hover | `#D4D4D4` | `border-hover` | Hover state borders |
| Accent | `#742581` | `accent` | Links, active states, CTA |
| Accent Hover | `#5E1D68` | `accent-hover` | Hover on accent |
| Success | `#16A34A` | `text-success` | Online/active indicators |
| Error | `#DC2626` | `text-error` | Error states |

### 1.3 Semantic Colors (Dark Mode)

| Role | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Background | `#0A0A0A` | `dark:bg-surface` | Page background |
| Surface | `#171717` | `dark:bg-surface-primary` | Cards, panels |
| Surface Alt | `#1C1C1C` | `dark:bg-surface-secondary` | Sidebar, alternate |
| Text Primary | `#F5F5F5` | `dark:text-primary` | Headings, body text |
| Text Secondary | `#A3A3A3` | `dark:text-secondary` | Captions, metadata |
| Text Muted | `#525252` | `dark:text-muted` | Placeholders, disabled |
| Border | `#262626` | `dark:border-default` | Card borders, dividers |
| Border Hover | `#404040` | `dark:border-hover` | Hover state borders |
| Accent | `#9B4DCA` | `dark:accent` | Lighter purple for dark bg |
| Accent Hover | `#B366D9` | `dark:accent-hover` | Hover on accent |

### 1.4 Contrast Requirements

- Body text on background: minimum **4.5:1** ratio (WCAG AA)
- Large text (18px+ / 14px bold+): minimum **3:1** ratio
- Light mode: `#1A1A1A` on `#FAFAFA` = **15.4:1** (passes AAA)
- Dark mode: `#F5F5F5` on `#0A0A0A` = **18.1:1** (passes AAA)
- Interactive elements: visible focus ring `outline: 2px solid var(--accent); outline-offset: 2px`

---

## 2. Typography

### 2.1 Font Stack（跨平台策略）

**Google Fonts 加载**（Web Font，全平台统一基础）：
```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+JP:wght@400;500;600;700&display=swap');
```

**CSS 变量定义**：
```css
:root {
  /* ---- UI 字体（全站导航/卡片/按钮/标签等） ---- */
  --font-sans:
    'Noto Sans JP',           /* Web Font: 日文基础（全平台一致） */
    'Noto Sans SC',           /* Web Font: 中文基础（全平台一致） */
    -apple-system,            /* macOS: San Francisco */
    BlinkMacSystemFont,       /* macOS Chrome */
    'Hiragino Sans',          /* macOS: 日文 */
    'Hiragino Kaku Gothic ProN', /* macOS: 日文(旧名) */
    'Yu Gothic UI',           /* Windows 10+: 日文 UI 字体 */
    'Yu Gothic',              /* Windows: 日文 */
    'Meiryo',                 /* Windows: 日文回退 */
    'Microsoft YaHei UI',     /* Windows: 中文 UI 字体 */
    'Microsoft YaHei',        /* Windows: 中文回退 */
    'Segoe UI',               /* Windows: 英文 UI */
    sans-serif,
    'Apple Color Emoji',      /* macOS/iOS: Emoji */
    'Segoe UI Emoji',         /* Windows: Emoji */
    'Noto Color Emoji';       /* Android/Linux: Emoji */

  /* ---- 标题/编辑字体（Hero/页面标题/博客标题） ---- */
  --font-serif:
    'Noto Serif JP',          /* Web Font */
    'Hiragino Mincho ProN',   /* macOS */
    'Yu Mincho',              /* Windows */
    'MS PMincho',             /* Windows 回退 */
    serif;

  /* ---- 博客原文专用（颜文字 + 组合字符安全） ---- */
  /* 此字体栈来自现有 blog-frontend，已验证可正确渲染颜文字 */
  --font-blog-content:
    'Hiragino Kaku Gothic ProN',  /* macOS: 日文（颜文字最佳） */
    'ヒラギノ角ゴ ProN W3',       /* macOS: 日文(和名) */
    'Yu Gothic',                  /* Windows 10+: 日文 */
    'YuGothic',                   /* Windows: 日文(旧名) */
    'Meiryo',                     /* Windows: 日文回退 */
    'メイリオ',                    /* Windows: 日文(和名) */
    'MS PGothic',                 /* Windows: 半角颜文字 */
    'ＭＳ Ｐゴシック',             /* Windows: 半角(和名) */
    'MS Gothic',                  /* Windows: 全角颜文字 */
    'ＭＳ ゴシック',               /* Windows: 全角(和名) */
    Osaka,                        /* macOS legacy */
    -apple-system,
    BlinkMacSystemFont,
    sans-serif,
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Noto Color Emoji';

  /* ---- 等宽字体（代码/技术内容） ---- */
  --font-mono:
    'SFMono-Regular',         /* macOS */
    Menlo,                    /* macOS 回退 */
    Monaco,                   /* macOS 回退 */
    Consolas,                 /* Windows */
    'Courier New',
    monospace;
}
```

### 2.2 字体栈使用规则

| 上下文 | CSS 变量 | Tailwind Class | 说明 |
|--------|----------|---------------|------|
| 全站 UI（导航/卡片/按钮） | `--font-sans` | `font-sans` | 默认字体，Noto Sans 保证跨平台一致 |
| 页面标题/Hero | `--font-serif` | `font-serif` | 装饰性标题，Noto Serif JP |
| 博客日文原文 | `--font-blog-content` | `font-blog` | **必须使用**：包含颜文字安全字体 |
| 博客中文翻译 | `--font-sans` | `font-sans` | 翻译文本用标准 UI 字体即可 |
| MSG 消息原文 | `--font-blog-content` | `font-blog` | MSG 也可能包含颜文字 |
| 代码/等宽 | `--font-mono` | `font-mono` | 极少用到，备用 |

### 2.3 平台特性说明

**macOS（保持现有设置不变）**：
- `-apple-system` / `BlinkMacSystemFont` → San Francisco（系统 UI）
- `Hiragino Sans` / `Hiragino Kaku Gothic ProN` → 日文显示 + 颜文字
- `Hiragino Mincho ProN` → 日文衬线标题
- macOS 自带 Hiragino 字体对颜文字和组合字符支持极佳，无需额外处理

**Windows（需优化）**：
- `Yu Gothic UI` / `Yu Gothic` → Windows 10+ 最佳日文字体，优先使用
- `Meiryo` → 旧版 Windows 回退，仍然常见
- `MS PGothic` / `MS Gothic` → 颜文字必需：这两个字体包含大量半角/全角特殊符号
- `Microsoft YaHei UI` / `Microsoft YaHei` → 中文显示
- `Segoe UI` → 英文 UI
- **关键**：`Noto Sans JP` 作为 Web Font 首选项，确保即使 Windows 系统字体缺失也有保底

**颜文字渲染保障**：
```
成员博客中常见的颜文字示例：
  (ﾉ´∀｀*)ﾉ  ←  半角片假名 + 特殊符号
  (◍•ᴗ•◍)✧  ←  Unicode 组合字符
  ♡(ŐωŐ人)   ←  特殊数学符号
  ╰(*´︶`*)╯  ←  Box Drawing + 全角
  ꒰ঌ🥺໒꒱   ←  Emoji + Unicode Extensions

渲染保障措施：
  1. --font-blog-content 包含 MS PGothic/MS Gothic（Windows 颜文字必需）
  2. text-rendering: optimizeLegibility（启用连字和组合字符优化）
  3. font-variant-ligatures: normal（保持正常连字行为）
  4. Emoji 字体链：Apple Color Emoji → Segoe UI Emoji → Noto Color Emoji
  5. white-space: pre-wrap（保留博客原文的换行和空格）
```

### 2.4 Tailwind 配置

```js
// tailwind.config.mjs — fontFamily 部分
fontFamily: {
  sans: [
    'Noto Sans JP', 'Noto Sans SC',
    '-apple-system', 'BlinkMacSystemFont',
    'Hiragino Sans', 'Hiragino Kaku Gothic ProN',
    'Yu Gothic UI', 'Yu Gothic', 'Meiryo',
    'Microsoft YaHei UI', 'Microsoft YaHei',
    'Segoe UI', 'sans-serif',
    'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji',
  ],
  serif: [
    'Noto Serif JP', 'Hiragino Mincho ProN',
    'Yu Mincho', 'MS PMincho', 'serif',
  ],
  blog: [
    'Hiragino Kaku Gothic ProN', 'ヒラギノ角ゴ ProN W3',
    'Yu Gothic', 'YuGothic', 'Meiryo', 'メイリオ',
    'MS PGothic', 'ＭＳ Ｐゴシック',
    'MS Gothic', 'ＭＳ ゴシック',
    'Osaka', '-apple-system', 'BlinkMacSystemFont', 'sans-serif',
    'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji',
  ],
  mono: [
    'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Courier New', 'monospace',
  ],
},
```

### 2.5 博客原文 CSS 类

```css
/* 博客日文原文专用 — 保证颜文字和组合字符正确渲染 */
.blog-content-original {
  font-family: var(--font-blog-content);
  text-rendering: optimizeLegibility;
  font-variant-ligatures: normal;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.8;
}

/* 博客中文翻译 — 使用标准 UI 字体 */
.blog-content-translated {
  font-family: var(--font-sans);
  line-height: 1.7;
}
```

### 2.6 Type Scale

| Level | Size | Weight | Font | Line Height | Letter Spacing | Usage |
|-------|------|--------|------|-------------|----------------|-------|
| Display | `clamp(2rem, 5vw, 3.5rem)` | 700 | Serif | 1.1 | -0.02em | Hero headlines |
| H1 | `1.875rem` (30px) | 700 | Serif | 1.2 | -0.01em | Page titles |
| H2 | `1.5rem` (24px) | 600 | Sans | 1.3 | 0 | Section titles |
| H3 | `1.25rem` (20px) | 500 | Sans | 1.4 | 0 | Card titles |
| Body | `1rem` (16px) | 400 | Sans | 1.6 | 0 | Body text |
| Small | `0.875rem` (14px) | 400 | Sans | 1.5 | 0 | Captions, metadata |
| Tiny | `0.75rem` (12px) | 500 | Sans | 1.4 | 0.02em | Labels, badges |

### 2.7 Line Length

- Max `65ch` for body text (optimal readability for Japanese/Chinese mixed content)
- Max `45ch` for card descriptions

---

## 3. Spacing & Layout

### 3.1 Spacing Scale (mapped to Tailwind)

| Token | Tailwind | Value | Usage |
|-------|----------|-------|-------|
| xs | `p-1` / `gap-1` | 4px | Tight gaps, icon padding |
| sm | `p-2` / `gap-2` | 8px | Icon gaps, inline spacing |
| md | `p-4` / `gap-4` | 16px | Standard padding |
| lg | `p-6` / `gap-6` | 24px | Card padding, section gap |
| xl | `p-8` / `gap-8` | 32px | Large gaps between sections |
| 2xl | `p-12` / `gap-12` | 48px | Section margins |
| 3xl | `p-16` / `gap-16` | 64px | Hero padding |

### 3.2 Page Layout

```
Page max-width: max-w-7xl (1280px) with mx-auto
Page padding: px-4 sm:px-6 lg:px-8 (responsive page gutter)
Content area: max-w-4xl for text-heavy pages (blog detail, message timeline)
```

### 3.3 Grid System

| Layout | Tailwind | Breakpoints |
|--------|----------|-------------|
| Card grid (tools) | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6` | 1→2→3 cols |
| Member grid | `grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4` | 3→4→6→8 cols |
| Blog cards | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6` | 1→2→3 cols |
| INS content | `grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2` | 3→4→6 cols |
| Radio stations | `flex gap-3 overflow-x-auto` | Horizontal scroll |

### 3.4 Breakpoints (Tailwind defaults)

| Name | Min width | Target |
|------|-----------|--------|
| `sm` | 640px | Large phones, landscape |
| `md` | 768px | Tablets |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Wide desktop |

### 3.5 Z-Index Scale

| Level | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| Base | 0 | `z-0` | Normal flow |
| Raised | 10 | `z-10` | Cards on hover, dropdowns trigger |
| Dropdown | 20 | `z-20` | Dropdown menus, tooltips |
| Sticky | 30 | `z-30` | Sticky header, floating player |
| Overlay | 40 | `z-40` | Sidebar overlay, dimmer |
| Modal | 50 | `z-50` | Modal dialogs, lightbox |

---

## 4. Component Specs

### 4.1 Navbar (Fixed Top)

```
Height: h-16 (64px)
Background: bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md
Border: border-b border-default
Z-index: z-30
Content below navbar: pt-16 to prevent overlap
```

### 4.2 Cards

```css
/* Base Card */
.card {
  @apply bg-white dark:bg-neutral-800
         rounded-xl border border-neutral-200 dark:border-neutral-700
         p-6 cursor-pointer
         transition-all duration-200 ease-out;
}
.card:hover {
  @apply shadow-md border-neutral-300 dark:border-neutral-600;
}
.card:focus-visible {
  @apply outline-2 outline-offset-2 outline-[#742581];
}
```

- NO `transform: scale()` on hover (causes layout shift)
- Use `shadow` + `border-color` change for hover feedback

### 4.3 Buttons

```css
/* Primary (CTA) */
.btn-primary {
  @apply bg-[#742581] hover:bg-[#5E1D68] text-white
         px-6 py-3 rounded-lg font-medium
         transition-colors duration-200
         cursor-pointer
         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#742581];
}

/* Secondary (Outline) */
.btn-secondary {
  @apply border-2 border-[#742581] text-[#742581]
         dark:border-[#9B4DCA] dark:text-[#9B4DCA]
         hover:bg-[#742581]/10 dark:hover:bg-[#9B4DCA]/10
         px-6 py-3 rounded-lg font-medium
         transition-colors duration-200
         cursor-pointer;
}

/* Ghost */
.btn-ghost {
  @apply text-neutral-600 dark:text-neutral-400
         hover:bg-neutral-100 dark:hover:bg-neutral-800
         px-4 py-2 rounded-lg
         transition-colors duration-200
         cursor-pointer;
}

/* Group-colored (dynamic) */
.btn-group-nogi  { @apply bg-[#742581] hover:bg-[#5E1D68] text-white; }
.btn-group-sakura { @apply bg-[#F19DB5] hover:bg-[#E8839F] text-white; }
.btn-group-hinata { @apply bg-[#7BC7E8] hover:bg-[#5DB8DE] text-white; }
```

### 4.4 Group Tabs

```css
/* Tab container */
.group-tabs {
  @apply flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl;
}

/* Tab item (inactive) */
.group-tab {
  @apply px-4 py-2 rounded-lg text-sm font-medium
         text-neutral-600 dark:text-neutral-400
         hover:text-neutral-900 dark:hover:text-neutral-200
         transition-colors duration-200 cursor-pointer;
}

/* Tab item (active) — color changes per group */
.group-tab[data-active="true"][data-group="nogizaka"]  {
  @apply bg-[#742581] text-white shadow-sm;
}
.group-tab[data-active="true"][data-group="sakurazaka"] {
  @apply bg-[#F19DB5] text-white shadow-sm;
}
.group-tab[data-active="true"][data-group="hinatazaka"] {
  @apply bg-[#7BC7E8] text-white shadow-sm;
}
```

### 4.5 Inputs

```css
.input {
  @apply w-full px-4 py-3 text-base
         bg-white dark:bg-neutral-800
         border border-neutral-300 dark:border-neutral-600
         rounded-lg
         placeholder:text-neutral-400 dark:placeholder:text-neutral-500
         focus:border-[#742581] dark:focus:border-[#9B4DCA]
         focus:ring-2 focus:ring-[#742581]/20 dark:focus:ring-[#9B4DCA]/20
         focus:outline-none
         transition-colors duration-200;
}
```

### 4.6 Modal / Lightbox

```css
.modal-overlay {
  @apply fixed inset-0 z-50
         bg-black/60 backdrop-blur-sm;
}
.modal-content {
  @apply bg-white dark:bg-neutral-900
         rounded-2xl shadow-xl
         max-w-lg w-[90%] p-8
         border border-neutral-200 dark:border-neutral-700;
}
```

### 4.7 Skeleton Loading

```css
.skeleton {
  @apply animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded;
}
/* Use for: images, text blocks, cards while loading */
/* Show skeleton for operations > 300ms */
```

### 4.8 Badge / Tag

```css
.badge {
  @apply inline-flex items-center px-2.5 py-0.5
         text-xs font-medium rounded-full;
}
.badge-nogi   { @apply bg-[#742581]/10 text-[#742581] dark:bg-[#742581]/20 dark:text-[#C084FC]; }
.badge-sakura { @apply bg-[#F19DB5]/10 text-[#D9708C] dark:bg-[#F19DB5]/20 dark:text-[#F19DB5]; }
.badge-hinata { @apply bg-[#7BC7E8]/10 text-[#4A9BBF] dark:bg-[#7BC7E8]/20 dark:text-[#7BC7E8]; }
```

---

## 5. Icons

### 5.1 Icon Library: Lucide

- Use `lucide-astro` for Astro components
- Use `lucide-react` for React Islands
- Standard size: `w-5 h-5` (20px) for UI, `w-4 h-4` (16px) for inline
- Stroke width: 1.5 (default) for large icons, 2 for small icons

### 5.2 Icon Mapping (replaces emojis)

| Purpose | Lucide Icon | Component |
|---------|-------------|-----------|
| Blog / Writing | `Pen` or `FileText` | `<Pen />` |
| MSG / Messages | `MessageCircle` | `<MessageCircle />` |
| Radio / Broadcast | `Radio` | `<Radio />` |
| Sakumimi | `Headphones` | `<Headphones />` |
| Recordings | `Disc` | `<Disc />` |
| Live Stream | `Antenna` or `Signal` | `<Signal />` |
| Instagram | `Camera` | `<Camera />` |
| Tools | `Wrench` | `<Wrench />` |
| Photo Card | `Image` | `<Image />` |
| MSG Generator | `MessageSquare` | `<MessageSquare />` |
| Subtitle BG | `Film` | `<Film />` |
| Subtitle Tools | `FileCode` | `<FileCode />` |
| Search | `Search` | `<Search />` |
| Dark Mode | `Moon` / `Sun` | `<Moon />` / `<Sun />` |
| Language | `Globe` | `<Globe />` |
| User | `User` | `<User />` |
| Settings | `Settings` | `<Settings />` |
| Star / Favorite | `Star` | `<Star />` |
| Download | `Download` | `<Download />` |
| External Link | `ExternalLink` | `<ExternalLink />` |
| Play | `Play` | `<Play />` |
| Pause | `Pause` | `<Pause />` |
| Volume | `Volume2` | `<Volume2 />` |
| Lock | `Lock` | `<Lock />` |
| Arrow Left | `ArrowLeft` | `<ArrowLeft />` |
| Arrow Right | `ArrowRight` | `<ArrowRight />` |
| Close | `X` | `<X />` |
| Menu | `Menu` | `<Menu />` |
| Chevron Down | `ChevronDown` | `<ChevronDown />` |
| Calendar | `Calendar` | `<Calendar />` |
| Clock | `Clock` | `<Clock />` |
| Filter | `SlidersHorizontal` | `<SlidersHorizontal />` |

---

## 6. Motion & Transitions

### 6.1 Duration Scale

| Type | Duration | Tailwind | Usage |
|------|----------|----------|-------|
| Instant | 0ms | — | Cursor changes |
| Fast | 150ms | `duration-150` | Button hover, icon hover |
| Normal | 200ms | `duration-200` | Card hover, menu open |
| Slow | 300ms | `duration-300` | Sidebar slide, modal open |
| Page | 500ms | `duration-500` | Page transitions (if any) |

### 6.2 Easing

- `ease-out` for entering elements (menus opening, modals appearing)
- `ease-in` for exiting elements (menus closing)
- `ease-in-out` for state changes (color transitions)

### 6.3 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Shadows

| Level | Tailwind | Usage |
|-------|----------|-------|
| None | `shadow-none` | Default card state |
| Subtle | `shadow-sm` | Navbar, raised elements |
| Medium | `shadow-md` | Card hover, dropdowns |
| Large | `shadow-lg` | Modals, popovers |
| XL | `shadow-xl` | Featured cards, hero images |

Dark mode: shadows are nearly invisible on dark backgrounds. Use **border color change** instead of shadow for hover feedback in dark mode.

---

## 8. Tailwind Config Extensions

```js
// tailwind.config.mjs (relevant extensions)
export default {
  theme: {
    extend: {
      colors: {
        'brand-nogi': '#742581',
        'brand-sakura': '#F19DB5',
        'brand-hinata': '#7BC7E8',
        surface: {
          DEFAULT: '#FAFAFA',
          primary: '#FFFFFF',
          secondary: '#F5F5F5',
          dark: '#0A0A0A',
          'dark-primary': '#171717',
          'dark-secondary': '#1C1C1C',
        },
      },
      fontFamily: {
        // 完整字体栈见 Section 2.4
        sans: [
          'Noto Sans JP', 'Noto Sans SC',
          '-apple-system', 'BlinkMacSystemFont',
          'Hiragino Sans', 'Hiragino Kaku Gothic ProN',
          'Yu Gothic UI', 'Yu Gothic', 'Meiryo',
          'Microsoft YaHei UI', 'Microsoft YaHei',
          'Segoe UI', 'sans-serif',
          'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji',
        ],
        serif: [
          'Noto Serif JP', 'Hiragino Mincho ProN',
          'Yu Mincho', 'MS PMincho', 'serif',
        ],
        blog: [
          'Hiragino Kaku Gothic ProN', 'ヒラギノ角ゴ ProN W3',
          'Yu Gothic', 'YuGothic', 'Meiryo', 'メイリオ',
          'MS PGothic', 'ＭＳ Ｐゴシック',
          'MS Gothic', 'ＭＳ ゴシック',
          'Osaka', '-apple-system', 'BlinkMacSystemFont', 'sans-serif',
          'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji',
        ],
        mono: [
          'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Courier New', 'monospace',
        ],
      },
      maxWidth: {
        prose: '65ch',
      },
    },
  },
};
```

---

## 9. Anti-Patterns (NEVER Use)

- **Emojis as icons** — Always use Lucide SVG icons
- **Missing cursor:pointer** — All clickable elements must have `cursor-pointer`
- **Layout-shifting hovers** — No `transform: scale()` on cards; use shadow + border
- **Low contrast text** — 4.5:1 minimum; never use `text-neutral-400` for body text in light mode
- **Instant state changes** — All interactive state changes use `transition-colors duration-200`
- **Invisible focus states** — Every interactive element needs `focus-visible:outline`
- **Arbitrary z-index** — Only use the defined scale (0, 10, 20, 30, 40, 50)
- **Content behind navbar** — Always add `pt-16` to page content when navbar is fixed
- **Horizontal scroll on mobile** — Test at 375px width; use `overflow-hidden` on body
- **Mixed icon libraries** — Only Lucide across the entire project
- **Magic numbers in spacing** — Use Tailwind spacing scale only

---

## 10. Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (Lucide SVG only)
- [ ] All icons from Lucide (consistent `w-5 h-5` / `w-4 h-4`)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with `transition-colors duration-200`
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Dark mode: border change instead of shadow for hover
- [ ] Focus states: `focus-visible:outline-2 focus-visible:outline-offset-2`
- [ ] `prefers-reduced-motion` media query included
- [ ] Responsive tested: 375px, 768px, 1024px, 1280px
- [ ] No content hidden behind fixed navbar (`pt-16`)
- [ ] No horizontal scroll on mobile
- [ ] Z-index uses defined scale only
- [ ] Japanese fonts have proper fallback chain
- [ ] Loading states use skeleton (`animate-pulse`) for > 300ms operations
- [ ] Group colors (nogi/sakura/hinata) applied correctly per context
