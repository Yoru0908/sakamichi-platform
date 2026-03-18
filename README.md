# Sakamichi Platform

> 坂道系列综合工具平台 - 统一的前端门户

基于架构文档 `CONTENT_PLATFORM_ARCHITECTURE.md` 构建的 Astro 前端应用，整合博客翻译、MSG归档、周边商城、实用工具等功能。

## 🎯 项目目标

将现有分散的工具和内容整合为一个统一平台，支持四级内容访问控制：
- **公开内容**：博客翻译
- **半公开内容**：MSG翻译（只显示翻译不显示原文）
- **受限内容**：MSG原文+图片+INS归档（需登录审核）
- **私有内容**：广播音视频（需额外验证）

## � 技术栈

- **框架**: Astro 6.0 (SSG + 部分 SSR)
- **UI**: React 19 + Tailwind CSS 4.2
- **部署**: Cloudflare Pages
- **后端**: Cloudflare Workers + D1 + KV + R2

## 📁 项目结构

详见 `PROJECT_STRUCTURE.md`

```
sakamichi-platform/
├── src/
│   ├── layouts/          # 布局组件
│   ├── pages/            # 页面路由
│   │   ├── index.astro   # 首页
│   │   ├── blog/         # 博客翻译
│   │   ├── messages/     # MSG归档
│   │   ├── shop/         # 周边商城
│   │   ├── tools/        # 实用工具
│   │   └── auth/         # 认证页面
│   ├── components/       # 可复用组件
│   ├── styles/           # 样式文件
│   └── utils/            # 工具函数
├── public/               # 静态资源
└── astro.config.mjs      # Astro 配置
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写必要的 API 地址。

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:4321 查看效果。

### 4. 构建生产版本

```bash
npm run build
npm run preview
```

## 📚 功能模块

### ✅ 已实现（MVP）

- [x] 首页门户
- [x] 统一导航和布局
- [x] 博客翻译列表页（占位）
- [x] MSG归档列表页（占位）
- [x] 周边商城页面（占位）
- [x] 工具页面（iframe嵌入）
- [x] 登录页面（UI）

### 🚧 开发中

- [ ] 博客翻译 API 对接
- [ ] MSG D1 数据库对接
- [ ] 用户认证系统（Workers + D1）
- [ ] 商城爬虫数据对接

### 📅 计划中

- [ ] INS归档页面
- [ ] 广播播放页面
- [ ] 表情反应功能
- [ ] 字幕组协作系统
- [ ] 拼单功能

## 🎨 设计特点

- **统一视觉**：所有页面使用相同的导航、配色、组件
- **响应式**：完美支持桌面、平板、手机
- **性能优化**：Astro SSG + Tailwind PurgeCSS
- **SEO 友好**：完善的 meta 标签和结构化数据
- **渐进增强**：JavaScript 可选，核心功能无 JS 也能访问

## 📦 部署

详见 `DEPLOYMENT.md`

### Cloudflare Pages 一键部署

```bash
npm run build
npx wrangler pages deploy dist
```

## 🤝 与现有项目的关系

| 现有项目 | 在新架构中的角色 | 集成方式 |
|---------|----------------|---------|
| 博客翻译前端 | 迁移到 `/blog` 路由 | 逐步迁移 HTML → Astro |
| MSG推送后端 | 数据源（存档到D1） | Worker API 对接 |
| 生写生成器 | 嵌入 `/tools/photocard` | iframe 嵌入 |
| MSG生成器 | 嵌入 `/tools/msg-generator` | iframe 嵌入 |
| 字幕底图 | 嵌入 `/tools/subtitle` | iframe 嵌入 |

## 🔐 内容分级实现

参考 `CONTENT_PLATFORM_ARCHITECTURE.md` 第8节：

```typescript
// 示例：鉴权中间件伪代码
function checkAccess(user, contentLevel) {
  if (contentLevel === 'public') return true;
  if (contentLevel === 'semi_public') return true;
  if (contentLevel === 'restricted') return user.role >= 'member';
  if (contentLevel === 'private') return user.role >= 'verified';
  return false;
}
```

## 📖 相关文档

- [项目结构](PROJECT_STRUCTURE.md)
- [部署指南](DEPLOYMENT.md)
- [架构设计](../CONTENT_PLATFORM_ARCHITECTURE.md)

## 🙏 致谢

- Astro 团队提供优秀的 SSG 框架
- Tailwind CSS 提供强大的样式工具
- Cloudflare 提供免费的边缘计算平台

## 📝 License

本项目为个人学习项目，内容涉及版权请自行斟酌使用。
