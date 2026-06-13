# 中日对照文章 `lang` 与字体渲染规范

## 目标

本规范用于统一 `sakamichi-platform` 内中日对照文章的内容结构、语言标记、字体策略与验收标准。

适用范围：

- 博客详情页双语正文
- 博客列表、首页 Hero、成员页等会显示日文标题/成员名的 UI 文本
- 未来新增的中日对照富文本模块

不适用范围：

- 生写生成器、Photocard Generator 等有意使用自定义设计字体的功能区
- 普通中文 UI 文案
- 不具备双语结构的自由编辑文本

## 权威实现位置

当前与本规范直接相关的权威文件：

- `src/styles/global.css`
- `src/layouts/BaseLayout.astro`
- `src/layouts/BlogLayout.astro`
- `src/components/blog/BlogDetail.tsx`
- `src/components/blog/BlogCard.tsx`
- `public/css/blog/main-styles.css`
- `public/css/blog/bilingual.css`
- `public/css/blog/mobile.css`

## 核心原则

### 1. 不允许整篇中日对照文章共用一套字体

中日对照内容必须按语言拆分，再按语言分配字体。

### 2. 不依赖浏览器自动猜语言

浏览器不能稳定识别中日混排字形差异。凡是可识别主语言的内容，必须显式输出 `lang`。

### 3. 中文容器是默认层，日文原文是特化层

默认阅读场景以中文译文为主，因此：

- 外层内容容器默认 `lang="zh-CN"`
- 中文译文走中文优先字体栈
- 日文原文走日文优先字体栈
- 博客原文若存在颜文字/半角片假名/特殊符号风险，继续走 `--font-blog`

### 4. `bilingual_content` 必须是结构化 HTML，不是纯文本拼接

如果接口返回 `bilingual_content`，它必须已经带好语言语义；前端不应再依赖正则“猜段落语言”。

## 数据契约

### 对接口/内容生产侧的要求

当文章是中日对照时，输出结构必须满足：

```html
<div class="blog-content-official" lang="zh-CN">
  <p lang="ja">日文原文……</p>
  <p lang="zh">中文译文……</p>
</div>
```

允许更细粒度语言标记：

```html
<p lang="zh">
  这是中文段落，<span lang="ja">櫻坂46</span> 等日文词汇单独标注。
</p>
```

禁止输出：

- 日文原文与中文译文混在同一个未标注语言的文本节点中
- 只有 `<br>` 换行、没有 `p[lang]` 的所谓“双语正文”
- 将 `bilingual_content` 当作纯 Markdown 或纯明文交给前端自行推断语言

### 字段约定

- `bilingual_content`
  - 表示已结构化的双语 HTML
  - 必须优先于 `translated_content` 使用
  - 若存在双语段落，必须输出 `p[lang="ja"]` / `p[lang="zh"]`

- `translated_content`
  - 表示普通译文内容
  - 若不是双语结构，可不含 `p[lang]`
  - 若未来承载双语内容，也必须升级为带 `lang` 的结构化输出，或迁移到 `bilingual_content`

## 渲染契约

### 页面与容器语言

- 页面默认语言：`<html lang="zh-CN">`
- 双语正文容器：`lang="zh-CN"`
- 纯日文标题、成员名、文章标题等：单独打 `lang="ja"`

### 字体分配

- 中文 UI / 中文译文：`--font-sans-zh`
- 日文 UI 文本：`--font-sans-ja`
- 博客日文原文 / 颜文字高风险文本：`--font-blog`
- 标题衬线风格需求：`--font-serif-ja` 或 `--font-serif`

### 当前项目内的实际约束

- `src/styles/global.css`
  - 已提供 `--font-sans-ja`
  - 已提供 `--font-sans-zh`
  - 已提供 `--font-blog`
  - 已提供基于 `[lang]` 的全局字体分流

- `public/css/blog/main-styles.css`
  - `.blog-content-official` 默认走 `--font-sans-zh`
  - `:lang(ja)` / `[lang|="ja"]` 走 `--font-blog`
  - `:lang(zh)` / `[lang|="zh"]` 走 `--font-sans-zh`

- `public/css/blog/bilingual.css`
  - `p[lang="ja"]` 为日文原文样式
  - `p[lang="zh"]` 为中文译文样式
  - `mode-chinese` / `mode-japanese` 控制显隐

## UI 文本规则

以下内容即使不是双语正文，也应尽量补 `lang="ja"`：

- 博客标题
- 成员名
- 文章卡片上的日文名和日文标题
- 首页 Hero 中的成员名与标题拼接文本
- 成员页、详情页、侧边栏中的日文标题列表

原因：这些文本通常是纯日文，若不标注，中文默认字体会接管，Windows 上更容易出现字形偏差。

## 新功能开发检查清单

新增或修改中日对照内容时，必须逐项确认：

- 数据源是否明确区分日文原文与中文译文
- 双语正文是否输出为结构化 HTML，而不是纯文本拼接
- 是否为每个双语段落打上 `lang`
- 外层容器是否设置默认语言 `lang="zh-CN"`
- 日文标题/成员名等 UI 文本是否打 `lang="ja"`
- 是否避免移动端或旧 CSS 再次覆盖统一字体策略
- 是否在 Windows 实机验证颜文字、半角片假名、特殊符号

## 当前检查结果（2026-05-04）

### 已符合或基本符合

- `src/components/blog/BlogDetail.tsx`
  - 双语正文容器已设置 `lang="zh-CN"`
  - 双语模式依赖 `bilingual_content`
  - 内容区域样式已接入中日分流与 `--font-blog`

- `src/components/blog/BlogCard.tsx`
  - 成员名已加 `lang="ja"`
  - 卡片标题已加 `lang="ja"`

- `public/css/blog/main-styles.css`
  - 双语正文已按 `lang` 分流字体

- `public/css/blog/bilingual.css`
  - 双语段落样式已按 `p[lang="ja"]` / `p[lang="zh"]` 区分

### 现行链路中仍建议补齐 `lang` 的位置

#### 1. 首页静态 Hero

文件：`src/pages/index.astro`

问题：

- `{heroBlog.member}「{heroBlog.title}」` 为典型日文显示文本，但未打 `lang="ja"`

建议：

- 将成员名与标题的包裹元素加 `lang="ja"`

#### 2. 首页 React Hero

文件：`src/components/home/HomeBlogSection.tsx`

问题：

- `{blog.member_name}「{blog.title}」` 未打 `lang="ja"`
- 占位图首字 `{blog.member_name.charAt(0)}` 无语言标记

建议：

- Hero 标题区域至少整体加 `lang="ja"`
- 若继续拆分，可成员名与标题分别打 `lang="ja"`

#### 3. 成员页标题与侧边栏

文件：`src/components/blog/MemberPage.tsx`

问题：

- 页面主标题中的 `{member}` 未打 `lang="ja"`
- 侧边栏成员名 `{member}` 未打 `lang="ja"`
- Recent entries 中 `{blog.title}` 未打 `lang="ja"`

建议：

- 成员名相关元素加 `lang="ja"`
- Recent entries 标题行加 `lang="ja"`

#### 4. 博客详情页标题与元信息

文件：`src/components/blog/BlogDetail.tsx`

问题：

- 主标题 `{blog.title}` 未打 `lang="ja"`
- Meta row 中 `{blog.member}` 未打 `lang="ja"`
- 侧边栏成员名 `{blog.member}` 未打 `lang="ja"`
- Recent entries 中 `{b.title}` 未打 `lang="ja"`

建议：

- 所有纯日文标题/成员名元素补 `lang="ja"`

#### 5. 团体页成员筛选下拉

文件：`src/components/blog/BlogGrid.tsx`

问题：

- `<option>` 中成员名通常为日文，但目前未打 `lang`
- 最新日期兜底文本与成员名拼接在同一 option 中，不利于细粒度标注

建议：

- 若浏览器兼容性与实现成本允许，为 `<option>` 设置 `lang="ja"` 或优化为更可控的自定义选择器
- 若短期不改，可接受为次优项，但应列入后续治理

### 遗留链路说明

以下文件主要属于旧博客 JS 体系，不是当前 `src/pages/blog/index.astro` 的现行渲染入口，但若未来重新启用，也必须遵守本规范：

- `public/js/blog/bilingual-control-v2.js`
- `public/js/blog/structured-renderer.js`
- `public/js/blog/member-detail.js`
- `public/js/blog/blog-detail-sidebar.js`
- `public/js/blog/app.js`

其中需要特别注意：

- 旧链路大量使用 `innerHTML`
- 旧链路依赖“页面里已经存在 `p[lang]`”来判定双语模式
- 旧链路本身并不保证内容生成时一定补好 `lang`

结论：

- 当前 React 主链路应继续作为权威实现
- 遗留 JS 链路如果保留，只能作为兼容层，不能再作为双语语义的来源

## 验收标准

一篇中日对照文章要算“合规”，至少满足：

- 双语正文中每段原文/译文都能在 DOM 中看到明确 `lang`
- 中文模式可隐藏 `p[lang="ja"]`
- 日文模式可隐藏 `p[lang="zh"]`
- Windows 上日文原文、中文译文、颜文字显示稳定
- 不因移动端样式或旧 CSS 覆盖而退化

## 后续建议

优先级建议：

1. 先补首页 Hero 的 `lang`
2. 再补 BlogDetail / MemberPage 的标题与成员名 `lang`
3. 最后处理 BlogGrid 成员筛选器这类次优项
