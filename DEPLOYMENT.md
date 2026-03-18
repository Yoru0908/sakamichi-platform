# Sakamichi Platform - 部署指南

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:4321
```

## 构建

```bash
# 生产构建
npm run build

# 预览构建结果
npm run preview
```

## 部署到 Cloudflare Pages

### 方式1：通过 Cloudflare Dashboard

1. 登录 Cloudflare Dashboard
2. 进入 Pages 板块
3. 创建新项目
4. 连接 Git 仓库
5. 配置构建设置：
   - **构建命令**: `npm run build`
   - **构建输出目录**: `dist`
   - **Node 版本**: `22.12.0`

### 方式2：使用 Wrangler CLI

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录
wrangler login

# 部署
wrangler pages deploy dist
```

## 环境变量配置

在 Cloudflare Pages 设置中添加环境变量：

```
PUBLIC_API_URL=https://api.sakamichi-tools.cn
PUBLIC_BLOG_API_URL=https://blog-api.sakamichi-tools.cn
PUBLIC_MSG_API_URL=https://msg-api.sakamichi-tools.cn
PUBLIC_SHOP_API_URL=https://shop-api.sakamichi-tools.cn
```

## 自定义域名

1. 在 Cloudflare Pages 项目设置中
2. 点击 "Custom domains"
3. 添加 `sakamichi-tools.cn`
4. 按照提示配置 DNS 记录

## 性能优化

- 图片已通过 R2 存储和 CDN 加速
- Astro 自动进行代码分割
- Tailwind CSS 已配置 PurgeCSS
- 关键 CSS 内联，非关键 CSS 延迟加载

## 监控与分析

建议集成：
- Cloudflare Web Analytics（免费、注重隐私）
- Sentry（错误追踪）
- Lighthouse CI（性能监控）
