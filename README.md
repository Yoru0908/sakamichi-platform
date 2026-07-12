# Sakamichi Platform

> 坂道系列综合工具平台 — 统一的前端门户与 API 层

线上站点：**[46log.com](https://46log.com)**

基于 Astro 构建的坂道系列（乃木坂46 / 樱坂46 / 日向坂46）粉丝工具平台，整合博客翻译、MSG 归档、INS 归档、广播播放、握手会管理（Miguri）、Repo 生成器、生日卡、生写社区、实用工具等功能，并通过 Cloudflare Workers 提供 API 与认证体系。

## 技术栈

- **前端框架**: Astro 6.0（SSG 为主，部分交互页用 React 19 island）
- **UI**: React 19 + Tailwind CSS 4.2 + lucide icons
- **富交互**: hls.js（广播直播）、danmaku（弹幕）、cropperjs、html2canvas / modern-screenshot / satori（生写与 Repo 图片导出）
- **部署**: Cloudflare Pages（`46log.com`，生产分支 `sakamichi-platform`）
- **后端**: Cloudflare Workers + D1（`sakamichi-auth` / `miguri`）+ KV + R2
- **Pages Functions**: `functions/api/proxy-image.ts`（公式 CDN 图片同源代理，解决 html2canvas 跨域）

## 架构概览

平台 API 由多个 Worker 按路由分流（更具体的 pattern 优先）：

| Worker | 路由 | 职责 |
|--------|------|------|
| `sakamichi-auth` | `/api/auth/*`、`/api/user/*`、`/api/manage/*`、`/api/webhook/*` | 认证、OAuth、JWT、geo_pass、付费系统、Discord 会员联动、Miguri 异常告警、微博通知 |
| `sakamichi-miguri` | `/api/miguri/*`、`/api/manage/miguri/*` | 握手会（Miguri）数据、Fortune Meets 全握分析、完售同步 |
| `sakamichi-community` | `/api/community/*`、`/api/repo/*`、`/api/report` | 生写社区（works CRUD、点赞、Alist 图片上传）、Repo Community API |
| `geo-auth-worker` | `alist.46log.com/*`、`radio.46log.com/*`、`videodownload.46log.com/*` | JP 地理围栏守卫，验证 geo_pass HMAC Cookie |
| `r2-video` | `r2.46log.com` 等 | 视频资源 Worker |

> 2026-07 Worker 重构：原 `sakamichi-auth` 拆分为 `auth` / `miguri` / `community` 三个独立 Worker，共享 `sakamichi-auth` D1。

## 项目结构

```
sakamichi-platform/
├── src/
│   ├── layouts/          # BaseLayout / AuthLayout / DashboardLayout
│   ├── pages/            # 页面路由（见下方功能模块）
│   ├── components/       # 按功能域组织的组件
│   │   ├── blog/ messages/ instagram/ radio/ meguri/
│   │   ├── photocard/ repo/ birthday-cards/ video/
│   │   ├── auth/ user/ admin/ nav/ footer/ home/ ui/ shared/
│   └── utils/            # 工具函数（member-images 等）
├── workers/              # Cloudflare Workers 源码
│   ├── auth/             # sakamichi-auth（认证/付费/Discord/webhook）
│   ├── miguri/           # sakamichi-miguri（握手会）
│   ├── community/        # sakamichi-community（生写社区/Repo）
│   ├── geo-auth/         # geo-auth-worker（地理围栏）
│   └── shared/           # Worker 间共享类型/工具
├── functions/            # Cloudflare Pages Functions
│   └── api/proxy-image.ts
├── r2-video-worker/      # R2 视频 Worker
├── scripts/              # 运维脚本（Discord 频道配置、Miguri 同步、Worker 冒烟测试）
├── public/data/          # 构建期静态数据（member-images.json、birthday-cards.json 等）
└── astro.config.mjs
```

## 功能模块

| 路由 | 模块 | 说明 |
|------|------|------|
| `/` | 首页门户 | Hero 博客、直播条、热门 MSG、最新握手会、快捷入口 |
| `/blog` | 博客翻译 | 三团博客翻译列表/详情/统计/互动，对接博客后端 API |
| `/messages` | MSG 归档 | MSG 翻译归档（半公开：仅翻译不显示原文） |
| `/instagram` | INS 归档 | Instagram 归档浏览（需登录） |
| `/radio` | 广播 | 坂道广播 / 日本电台番组表、HLS 直播、录制回放、樱耳 Archive |
| `/miguri` | 握手会（Miguri） | forTUNE meets 受付管理、完售同步、Fortune Meets 全握分析 |
| `/repo` | Repo 生成器 | 咪咕力/握手会レポ作成与社区共有，图片经 proxy-image 同源导出 |
| `/photocard` | 生写社区 | 生写作品浏览/创作/用户页，支持点赞与 Alist 图片上传 |
| `/birthday-cards` | 生日卡 | 樱坂46/日向坂46 官方生日卡浏览与下载 |
| `/video` | 视频 | 视频归档 |
| `/gallery` | 生写图库 | 公式照图库 |
| `/tools` | 实用工具 | MSG 生成器、生写生成器、字幕底图、SRT 修正、字幕合并、FAD 效果 |
| `/auth` | 认证 | 登录/注册/验证/Onboarding |
| `/dashboard`、`/user` | 用户中心 | 个人仪表盘、用户设置 |
| `/about`、`/contact`、`/links`、`/privacy`、`/terms` | 信息页 | — |

### 内容访问分级

- **公开**：博客翻译
- **半公开**：MSG 翻译（仅翻译，不显示原文）
- **受限**：MSG 原文 + 图片 + INS 归档（需登录审核）
- **私有**：广播音视频（需 geo_pass / 额外验证）

## 快速开始

```bash
# 安装依赖（Node >= 22.12.0）
npm install

# 启动开发服务器 → http://localhost:4321
npm run dev

# 构建生产版本
npm run build
npm run preview
```

环境变量参考 `.env.example`（如存在），前端主要通过 `https://api.46log.com` 调用 Worker API。

## 部署

详见 `DEPLOYMENT.md`。

### Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy dist --project-name sakamichi-platform --branch=sakamichi-platform
```

> 生产分支是 `sakamichi-platform`，不是 `main`。

### Workers

```bash
# 类型检查
npm run workers:typecheck

# 部署各 Worker
(cd workers/auth && npx wrangler deploy)
(cd workers/miguri && npx wrangler deploy)
(cd workers/community && npx wrangler deploy)
(cd workers/geo-auth && npx wrangler deploy)

# 部署后冒烟验证双域名分流
npm run workers:smoke
```

### Discord 会员联动

`sakamichi-auth` 负责 Discord OAuth 绑定与付费身份组同步；频道与推送 webhook 可由脚本幂等创建：

```bash
npm run discord:setup:dry          # 只打印计划
npm run discord:setup -- --apply   # 创建/复用频道与 webhook
```

详见 `DEPLOYMENT.md` 的 Discord 章节。

## 运维脚本

| 命令 | 用途 |
|------|------|
| `npm run workers:typecheck` | 三个 Worker 类型检查 |
| `npm run workers:smoke` | Worker 部署后路由冒烟测试 |
| `npm run discord:setup` | Discord 频道/webhook 配置 |
| `npm run miguri:sync` | Miguri 数据同步（`--dry-run` 可预演） |

## 相关文档

- [部署指南](DEPLOYMENT.md)
- [项目结构](PROJECT_STRUCTURE.md)
- [广播集成方案](RADIO_INTEGRATION_PLAN.md)
- [认证系统设计](AUTH_SYSTEM_DESIGN.md)
- [Discord 会员方案](DISCORD_MEMBERSHIP_PLAN.md)
- [生写社区方案](PHOTOCARD_COMMUNITY_PLAN.md)
- [付费门禁方案](PAYMENT_GATE_PLAN.md)
- 总体架构：`../CONTENT_PLATFORM_ARCHITECTURE.md`

## License

本项目为个人学习项目，内容涉及版权请自行斟酌使用。
