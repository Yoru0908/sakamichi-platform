# 个握历史完售（2026-09-12）

> 2026-09-13 后续修复：已查明缺结构来自特殊日期解析与非原子同步，并恢复当前矩阵；详见 [日期结构修复](miguri-structure-repair.md)。下方带首发版本的测试/发布数据为历史记录。

## 入口与行为

- 页面：`https://46log.com/miguri/history`，无需登录。
- 活动直达：`/miguri/history?event=hinatazaka_202605` 等已存在的 slug。
- 入口：桌面/手机活动总览、Miguri 导航下拉、手机菜单及页脚；管理页顶部两个重复推广链接已按用户要求移除。
- 默认目录包含已有记录的活动，已归档优先；按团体/单曲搜索，可切换「已归档记录」「全部活动」。
- 有结构的活动复用 `SoldOutMatrix`，支持期别/完售排序、按轮次累计回看。切换活动重置轮次，浏览器前进/后退与活动 URL 同步。
- 无采集记录明确显示缺失，不生成0部完售。目录只先加载元数据，选择活动后才读取该活动的完售格。

## 原因、保留边界

原 `/api/miguri/events` 使用 `WHERE status != 'archived'`，上游下架后归档的活动不出现在管理目录；D1 中的完售快照和单元格并未因此删除。`/soldout?event=...` 原本即可读取归档记录。

新增公开只读 `GET /api/miguri/soldout-history` 查询全部活动（包括归档和未采集）。不修改现有活动 KV 缓存、不读取用户报名/账号数据；Cloudflare Cache API 缓存5分钟。日期优先读取已保存部次，缺少部次时回退到 `raw_payload.dates`，不依赖上游网页仍然可访问。实际生产查询读取176行、写入0行。

**本次不迁移/删除数据库、不修改同步或完售计算算法，不补造缺失轮次。** 现有归档逻辑只标记活动，保留历史快照；后续归档自动进入此目录，不设置按活动结束时间淘汰的前端条件。

只读核查结果（2026-09-12）：8个活动、5个有记录，其中2个已归档且有记录：

| 活动 | 保存轮次数 | 保存完售格 |
|---|---:|---:|
| 日向坂17单 `hinatazaka_202605` | 9 | 941 |
| 乃木坂41单 `nogizaka_202604` | 2 | 197 |

櫻坂14单、乃木坂 `My respect` 没有历史快照/完售格，不代表完售数为0。保存轮次数不等于最后轮次编号，也不保证采集过所有受付。

另外发现当前櫻坂15单、乃木坂42单、日向坂18单保存有完售格，但 `miguri_event_slots` 已为空。原画面会失去日期/部次维度，仅用已完售格作分母可能误示100%。本次为详情 API 添加 `structureAvailable` 标记；无部次或成员结构时，只展示已记录格列表，支持轮次/成员筛选及100条分页，不显示总部数、完售率、全完售判定。**首发没有推测重建部次；后续已使用核对后的官方日期结构修复同步并恢复矩阵，真正缺结构时仍保留该降级显示。**

## 测试

```bash
node --test workers/miguri/src/**/*.test.mjs
node --test src/components/meguri/{soldout-history-helpers,MeguriPrototype.page,MeguriPrototype.layout}.test.mjs src/components/nav/mobile-nav.test.mjs scripts/test-meets-integration.mjs
npm run build
NODE_PATH=/path/to/playwright/node_modules CHROME_PATH=/path/to/chrome node scripts/test-miguri-history-browser.cjs
```

- Worker：50项通过，新增真实 SQLite SQL/归档/空记录/日期回退/CORS/缓存故障/只读测试。
- 前端辅助函数、页面和导航：13项通过。
- Chromium 1440px/390px：目录懒加载、搜索/筛选、归档矩阵、切换轮次重置、后退、直达/未知链接、空记录、缺结构降级、错误重试、无当前活动时入口；无运行时错误/页面横向溢出。
- `tsc -p workers/miguri/tsconfig.json`（使用匹配的 Cloudflare workers-types）通过。
- Astro build 47页通过；预渲染 `request.headers` 等既有警告仍在。全仓 `astro check` 有72项既有错误，在未修改的生产基线 `336224b` 复测同为72项；本次前端文件无新诊断。

## 首发发布记录

后续修复后，不应回滚到旧的非原子同步 Worker；参见结构修复文档的回滚限制。

基于 `origin/sakamichi-platform` 的独立 worktree `.worktrees/miguri-history`，保留既有地图修复、最新圣巡数据、Meets 入口。原配置工作区和无关备份不动。

```bash
wrangler deploy --config workers/miguri/wrangler.toml --keep-vars
wrangler pages deploy dist --project-name sakamichi-platform --branch sakamichi-platform
```

- 发布前已核对实际 Worker 代码、版本、D1/KV bindings、非密钥变量均匹配基线。`--keep-vars` 保留生产变量，密钥不修改。
- Worker 旧版本（回滚）：`755fcc51-9242-401c-8215-fd171e13e57a`。
- Pages 旧部署（回滚）：`a90b61ef-91c8-43aa-a32f-4a8a3584c1fe`，Git `336224b`。
- 不部署/重启 Homeserver PM2，不触碰队列采集器及券数模型，不调用写入型同步接口来做测试。

### 已验证发布

- 功能 Git：`f9562ad`。
- Worker：`ceaa8226-ac7e-4d38-94c3-70cb32af7be2`（100%）。
- Pages：`898b907f-1c45-400d-a18e-9382c55556ac`，production / Git `f9562ad`；部署预览 `https://898b907f.sakamichi-platform-test.pages.dev`。
- 正式域名 `46log.com/miguri/history` 的 `/_astro/SoldOutHistory.CeEqg1ob.js` SHA-256 与本地构建一致。
- 正式 API：目录8个活动，当前管理目录仍为4个；日向坂17单9轮/941格/27成员，乃木坂41单2轮/197格/29成员，均有已保存部次结构。櫻坂15单16轮/916格，缺结构标记为 false。
- 正式域名桌面/手机 Chromium 实测：上述两个归档矩阵可读，无采集的櫻坂14单明确缺失，櫻坂15单显示100条分页记录且不显示100%或全完售；分页、管理页入口均正常，无浏览器运行时错误或整页横向溢出。
- 部署地图同步更新了平台历史入口与 `sakamichi-miguri` Worker 清单。
