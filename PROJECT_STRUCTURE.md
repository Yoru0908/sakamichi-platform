# Sakamichi Platform - 项目结构

## 技术栈
- **框架**: Astro 6.0 + React 19
- **样式**: Tailwind CSS 4.2
- **部署**: Cloudflare Pages
- **API**: Cloudflare Workers + D1 + KV + R2

## 目录结构

```
sakamichi-platform/
├── src/
│   ├── layouts/
│   │   ├── BaseLayout.astro          # 基础布局（导航、页脚）
│   │   ├── AuthLayout.astro          # 认证页面布局
│   │   └── DashboardLayout.astro     # 用户中心布局
│   ├── components/
│   │   ├── common/
│   │   │   ├── Navigation.astro      # 顶部导航
│   │   │   ├── Footer.astro          # 页脚
│   │   │   ├── Loading.astro         # 加载动画
│   │   │   └── SEO.astro             # SEO元数据
│   │   ├── blog/
│   │   │   ├── BlogCard.astro        # 博客卡片
│   │   │   ├── BlogList.astro        # 博客列表
│   │   │   └── BlogDetail.astro      # 博客详情
│   │   ├── messages/
│   │   │   ├── MessageCard.astro     # MSG卡片
│   │   │   ├── MessageBubble.astro   # MSG气泡（复用现有样式）
│   │   │   └── MemberFilter.astro    # 成员筛选
│   │   ├── shop/
│   │   │   ├── ProductCard.astro     # 商品卡片
│   │   │   ├── ProductGrid.astro     # 商品网格
│   │   │   └── PriceDisplay.astro    # 价格显示
│   │   ├── tools/
│   │   │   └── ToolCard.astro        # 工具卡片
│   │   └── auth/
│   │       ├── LoginForm.tsx         # 登录表单（React）
│   │       └── RegisterForm.tsx      # 注册表单（React）
│   ├── pages/
│   │   ├── index.astro               # 首页门户
│   │   ├── blog/
│   │   │   ├── index.astro           # 博客列表
│   │   │   ├── [id].astro            # 博客详情
│   │   │   └── stats.astro           # 数据统计
│   │   ├── messages/
│   │   │   ├── index.astro           # MSG列表（半公开）
│   │   │   ├── [id].astro            # MSG详情
│   │   │   └── member/
│   │   │       └── [name].astro      # 按成员查看
│   │   ├── instagram/
│   │   │   ├── index.astro           # INS归档首页（需登录）
│   │   │   └── [member]/
│   │   │       └── [postId].astro    # 具体帖子
│   │   ├── radio/
│   │   │   ├── index.astro           # 广播列表（需验证）
│   │   │   └── episodes/
│   │   │       └── [ep].astro        # 播放页
│   │   ├── shop/
│   │   │   ├── index.astro           # 商城首页
│   │   │   ├── [group].astro         # 按团体查看
│   │   │   └── product/
│   │   │       └── [id].astro        # 商品详情
│   │   ├── tools/
│   │   │   ├── index.astro           # 工具入口
│   │   │   ├── photocard.astro       # 生写生成器
│   │   │   ├── subtitle.astro        # 字幕底图
│   │   │   └── msg-generator.astro   # MSG生成器
│   │   ├── auth/
│   │   │   ├── login.astro           # 登录
│   │   │   ├── register.astro        # 注册
│   │   │   └── callback.astro        # OAuth回调
│   │   └── account/
│   │       ├── index.astro           # 用户中心
│   │       ├── favorites.astro       # 收藏
│   │       └── settings.astro        # 设置
│   ├── styles/
│   │   ├── global.css                # Tailwind全局样式
│   │   ├── message-bubble.css        # MSG气泡样式（复用）
│   │   └── blog.css                  # 博客特定样式
│   └── utils/
│       ├── api.ts                    # API调用工具
│       ├── auth.ts                   # 认证工具
│       └── constants.ts              # 常量定义
├── public/
│   ├── images/
│   │   └── sakamichi.jpg             # Logo
│   └── fonts/                        # 字体文件（如果需要）
└── astro.config.mjs                  # Astro配置
```

## 内容分级实现

### 公开内容（无需登录）
- `/` - 首页
- `/blog/*` - 博客翻译
- `/messages` - MSG翻译列表（只显示翻译）
- `/tools/*` - 所有工具

### 半公开内容（只显示部分）
- `/messages/:id` - MSG详情（翻译可见，原文需登录）

### 受限内容（需 member 角色）
- `/messages/:id` 完整内容（原文+媒体）
- `/instagram/*` - INS归档
- `/shop/watchlist` - 商品关注

### 私有内容（需 verified 角色）
- `/radio/*` - 广播音视频

## 功能优先级

### MVP (第一期 - 2周)
- [x] 项目初始化
- [ ] 基础布局和导航
- [ ] 首页门户
- [ ] 博客翻译展示（复用现有前端）
- [ ] MSG翻译列表（半公开）
- [ ] 工具页面（iframe嵌入现有工具）

### 第二期 (2-3周)
- [ ] 用户认证系统
- [ ] MSG完整内容（受限）
- [ ] 商城信息展示
- [ ] 表情反应功能

### 第三期 (按需)
- [ ] INS归档
- [ ] 广播播放
- [ ] 字幕组协作系统
- [ ] 拼单功能
