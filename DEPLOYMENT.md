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

### Miguri 日历订阅

`sakamichi-miguri` 直接输出标准 ICS，不依赖 Google OAuth：

| 类型 | 地址 |
|------|------|
| 三团全部抽选受付 | `/api/miguri/calendar/lottery/all-groups.ics` |
| 乃木坂46 抽选受付 | `/api/miguri/calendar/lottery/nogizaka.ics` |
| 櫻坂46 抽选受付 | `/api/miguri/calendar/lottery/sakurazaka.ics` |
| 日向坂46 抽选受付 | `/api/miguri/calendar/lottery/hinatazaka.ics` |
| 乃木坂46 官网完整日程 | `/api/miguri/calendar/official/nogizaka.ics` |
| 櫻坂46 官网完整日程 | `/api/miguri/calendar/official/sakurazaka.ics` |
| 日向坂46 官网完整日程 | `/api/miguri/calendar/official/hinatazaka.ics` |
| 乃木坂46 整团全部日程 | `/api/miguri/calendar/complete/nogizaka.ics` |
| 櫻坂46 整团全部日程 | `/api/miguri/calendar/complete/sakurazaka.ics` |
| 日向坂46 整团全部日程 | `/api/miguri/calendar/complete/hinatazaka.ics` |
| 私人 Miguri 行程 | `/api/miguri/calendar/personal/{signed-token}.ics` |

`official/{group}.ics` 只包含对应团官网公布的电视、广播、演出、发行、生日等
完整日程；`complete/{group}.ics` 在此基础上合并 D1 中对应团的 Meet & Greet
抽选受付开始与截止。两类地址是“按需订阅”和“整团订阅”两种使用方式，同一团
不应同时添加，否则系统日历可能显示重复的官方日程。私人成员、日期、部数和张数
只进入 signed-token 私人订阅，不进入任何公开整团地址。

私人订阅地址由登录态 API 生成，可重置、撤销；D1 只保存订阅 ID 和版本，
可使用的 URL 由 `JWT_SECRET` 做 HMAC 签名。首次发布前先迁移 `miguri` D1：

```bash
(cd workers/auth && npm run db:migrate:miguri-calendar -- --remote)
```

公开日历读取 `miguri_events` / `miguri_event_windows`，私人日历读取
`miguri_user_entries` / `miguri_event_slots`；Homeserver 的既有 Miguri 同步任务
仍是公开抽选时间的唯一写入方。官网完整日程不写入 D1：Worker 在订阅刷新时读取
乃木坂 JSONP 日程 API，以及櫻坂、日向坂官网结构化日程页，统一标准化为
`CalendarEvent` 后输出滚动 7 个月（上月、当月及未来 5 个月）的 ICS；个别月份
抓取失败或超过 8 秒时保留其余月份，全部失败才返回错误。公开官网/整团 ICS
使用 Cloudflare Cache API 按完整订阅 URL 缓存 15 分钟，避免每位订阅者重复请求官网。

### `/schedule` 日程页面

公开页面 `/schedule` 不维护第二份日程数据库。浏览器通过 Pages Function
`/api/schedule-feed/{nogizaka|sakurazaka|hinatazaka|lottery}` 同源读取上述
official ICS 和三团 lottery ICS，再在前端解析、合并和分类；Pages Function 与
浏览器会分别使用 15 分钟 CDN 缓存和 10 分钟 `sessionStorage` 缓存。

页面的订阅按钮不指向 Pages 部署域名，而是直接使用
`webcal://api.46log.com/api/miguri/calendar/...` 长期地址，因此重新部署前端不会
使用户已经添加到系统日历的订阅失效。详情中的“订阅该团”默认打开整团订阅，
总入口同时提供按需 official / lottery 与 complete 两种方案。

### `/miguri/queue` 排队监控

平台页面内嵌 `https://meets.46log.com/` 的完整排队面板，保留本站导航，提供独立窗口入口；可带 `#eid=e28529&tab=summary` 定位场次。首页快捷入口、Miguri 桌面下拉/手机菜单和页脚均可到达；管理页重复推广链接已移除。无需登录，也不把平台登录凭据传给排队 API。

独立面板由 `fortunemeets-queue/workers/entry/` 的 Worker `meets-entry`（Custom Domain + Static Assets）托管；不是此 Pages 项目的子域名。它复用队列项目的唯一前端源和只读代理，API 仍经 `blog-push.46log.com/fm-queue/api/*` 到 Homeserver。备用入口 `https://meets-9eo.pages.dev/` 保留。旧 `meets.sakamichi-tools.cfd` 不再使用。

```bash
node --test scripts/test-meets-integration.mjs src/components/nav/mobile-nav.test.mjs
npm run build
wrangler pages deploy dist --project-name sakamichi-platform --branch sakamichi-platform
```

发布前从 `origin/sakamichi-platform` 更新，保留圣巡自动同步数据与已上线地图修复，勿用旧配置分支覆盖生产。排队入口只改前端/Worker，不重启 Homeserver 采集器，不修改券数模型。

### 个握历史完售（2026-09-12）

公开入口 `/miguri/history`（可加 `?event=<slug>`），活动总览、Miguri 导航及页脚均可直达；管理页顶部重复推广链接已移除。历史目录由 `sakamichi-miguri` 新只读接口 `/api/miguri/soldout-history` 提供，包含归档记录，缓存5分钟，不依赖当前活动列表，也不读取私人报名。详情仍用 `/api/miguri/soldout?event=...`；无记录/无部次结构均明确降级，不伪造0或100%完售。

历史首发同时部署 `workers/miguri`（保留生产 vars/secrets）与 Pages；后续已修复特殊日期解析/非原子同步，并安全恢复当前活动结构。Worker `d808de1b-be97-4069-94bd-61f62a2db635`；无迁移、无 PM2 重启，44快照/3422格/521私人报名与归档元数据保持不变。不要重复执行修复同步，也不要回滚到旧非原子 Worker；详见 [`docs/miguri-structure-repair.md`](docs/miguri-structure-repair.md)。实现、保留边界、测试、生产数据核查及回滚见 [`docs/miguri-soldout-history.md`](docs/miguri-soldout-history.md)。

### MSG 站内下架与「その他」（2026-09-13）

- `/messages`、`/tools/msg-generator` 及其子路径返回410/noindex/no-store；源码移到 `archive/disabled-pages/` 保留，不进入构建。菜单/首页/SEO/付费权益宣传及 MSG islands 移除，独立推送/采集/归档服务和数据不变。详见 [`docs/msg-withdrawal.md`](docs/msg-withdrawal.md)。
- `/tools` 在日语模式为「その他」；Instagram 移至该分组与「アーカイブ」卡片，保留 `/instagram` 原地址。导航/目录/页脚/Instagram 界面接入统一语言偏好，修复写死中文和 hydration 不一致；平板用抽屉菜单。详见 [`docs/navigation-i18n-instagram-archive.md`](docs/navigation-i18n-instagram-archive.md)。
- 本轮站点改动只部署 Pages，不能因此重启 Homeserver 或改 Worker 数据。
- 已验证生产：Pages `028b056b-9c02-45d4-b530-3cb1f6df17fd`（Git `2b730f1`，功能 `1627fc3`），`https://028b056b.sakamichi-platform-test.pages.dev` / `46log.com`。GitHub 已推送工作分支与生产分支，并保留并行 Repo 修复至 `f1250f6`。124项回归、45页构建及正式域名1440/1280/1024/390px语言/归档测试通过；六种MSG撤下URL仍为410。Miguri Worker保持 `d808de1b-be97-4069-94bd-61f62a2db635`，本轮未重部署/同步。

### 中文博客日语提及分析（2026-09-13，当前 Pages）

`https://46log.com/blog/` →「关系分析」。按实际月份读取日语存档，在浏览器 Web Worker 计算作者→对象提及，提供逐篇原文依据、篇数/出现处数、排行和期别追溯。不是私交评分；缺日语/非名录作者/错误来源明确排除，不再使用旧8月 API/静态 fallback。

- 当前 production `40217ecd-0699-4f94-8e03-9bd7e7468851`，Git `e27a581`，success / clean；保留 Repo 等改动至 `9db090c`。
- 新增同源 Pages Function `/api/blog-relations`；选月加 `group`、`month`、`format=source`。production 增加 `BLOG_RELATIONS_SOURCE` → D1 `9eaf182b-e777-4f14-8330-17af49ca4f7e`；应用只运行固定 `blogs` SELECT，不是数据库级只读权限。不得扩展为任意查询或读取同库的 MSG/config 表。原 secrets、preview、WAF、独立 Workers/PM2/采集器不变，无迁移或数据修复写入。
- 139项回归、45页构建；3916条存档中3741篇可分析日语，3733条摘录自动核对原文一致。桌面/手机真实D1 fixtures 的后台线程计算通过；全仓仍59个类型错误，整页启动期仍有单独记录的 React #418，不声称全站诊断干净。
- 日本匿名/伪造凭据实际401，preview403，六种MSG旧路径继续410。**真实账号或合规非JP浏览器的公开接口200放行链路仍待补验**；未拿 fixture 测试代替，也未放宽原站限制。登录过期只沿用现有会话刷新机制重试一次。

详细口径、数据覆盖、测试边界和回滚见 [`docs/blog-relations-evidence.md`](docs/blog-relations-evidence.md)。搜索、阅读管理、日本新站以及用户暂停的其他页面语言修复均未开展。

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
