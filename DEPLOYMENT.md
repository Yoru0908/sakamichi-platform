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

## Cloudflare Workers

平台 API 由三个 Worker 按路由分流：

| Worker | 路由 |
|--------|------|
| `sakamichi-auth` | `/api/auth/*`, `/api/user/*`, `/api/manage/*`, `/api/webhook/*` |
| `sakamichi-miguri` | `/api/miguri/*`, `/api/manage/miguri/*` |
| `sakamichi-community` | `/api/community/*`, `/api/repo/*`, `/api/report`, `/api/manage/reports*` |

部署前检查：

```bash
npm run workers:typecheck
```

部署：

```bash
(cd workers/auth && npx wrangler deploy)
(cd workers/miguri && npx wrangler deploy)
(cd workers/community && npx wrangler deploy)
```

部署后验证双域名分流：

```bash
npm run workers:smoke
```

### Auth Worker Discord 会员联动

`sakamichi-auth` 负责 Discord OAuth 绑定和付费身份组同步：

- `GET /api/user/discord/status`：读取当前用户 Discord 绑定/订阅/配置状态。
- `POST /api/user/discord/sync`：按 D1 `user_subscriptions` 重算 Discord 付费 role。
- Ko-fi webhook、邀请码兑换、管理员手动认领付款成功后会自动触发同步。
- Auth Worker 每日维护 cron 过期订阅后，会对受影响用户重新同步 Discord role。

需要在 `workers/auth` 配置以下 Worker secrets：

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_GUILD_ID
npx wrangler secret put DISCORD_ROLE_NOGIZAKA
npx wrangler secret put DISCORD_ROLE_SAKURAZAKA
npx wrangler secret put DISCORD_ROLE_HINATAZAKA
```

Bot 必须在 Discord 服务器内，并拥有 Manage Roles 权限；Bot 自身最高身份组必须高于三个付费身份组。

### Discord 频道与推送 Webhook

频道和 webhook 可由平台脚本幂等创建：

```bash
# 只打印计划，不访问 Discord
npm run discord:setup:dry

# 创建/复用频道和 webhook，并写出本地 private JSON
npm run discord:setup -- --apply
```

`--apply` 需要本地环境中存在：

```bash
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID
DISCORD_ROLE_NOGIZAKA
DISCORD_ROLE_SAKURAZAKA
DISCORD_ROLE_HINATAZAKA
```

脚本会写出两份不进 git 的配置：

| 服务 | 配置文件 | 用途 |
|------|----------|------|
| `msg-pusher` | `../MSG推送/config/discord-routes.local.json` | paid 区三团 MSG timeline + 成员频道 webhook |
| `blog-push` | `../博客自动翻译/自动翻译项目/sakamichi-blog-backend/blog-push-service/discord-webhooks.local.json` | free 区三团 blog + 公告类 content-push webhook |

运行时可用环境变量覆盖路径：

```bash
MSG_DISCORD_ROUTES_FILE=/home/srzwyuu/msg-pusher/config/discord-routes.local.json
BLOG_PUSH_DISCORD_CONFIG=/home/srzwyuu/blog-push-service/discord-webhooks.local.json
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
