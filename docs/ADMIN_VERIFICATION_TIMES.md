# GeoPass 审核时间与队列（2026-10-03）

## 问题与行为

旧卡片显示 `users.created_at`，没有标明它是账号注册时间；列表却按 `updated_at` 排序。修改昵称、偏好、密码、付款等操作也会更新该字段，所以五月注册的账号可能刚更新后出现在前面。这两项都不能证明申请何时提交。

现在卡片分别显示申请提交、审核处理、账号注册时间，统一使用日本时间 JST，手机也完整显示。

- 待审核按申请提交时间倒序。
- 已批准、已拒绝按审核处理时间倒序。
- 全部优先显示待审核，其余按处理时间合并排序。
- 同组没有动作时间的历史记录排在末尾，用注册时间及 ID 保持稳定，不受账号修改影响。
- 历史没有记录的申请/处理时间明确显示“未记录（历史申请/历史审核）”，不从注册或更新时间推算。
- GeoPass 待审核卡片、菜单角标使用 `pending_users`，付款菜单继续使用 `unmatched_pending`。审批后刷新列表及统计。

## 架构与文件

```text
用户提交申请 / 管理员批准或拒绝
  → sakamichi-auth Worker（身份及数据库角色校验、条件更新）
  → D1 sakamichi-auth.users（UTC 动作时间）
  → GET /api/manage/verifications（按动作时间排序，private/no-store）
  → AdminDashboard（区分三种时间、转为 JST、筛选及错误提示）
```

| 文件 | 作用 |
| --- | --- |
| `workers/auth/src/db/migrations/013_verification_timestamps.sql` | 两个可空时间字段和索引；不回填历史数据 |
| `workers/auth/src/db/schema.sql`、`types.ts` | 新安装 schema 和用户类型同步 |
| `workers/auth/src/routes/admin-verification.ts` | 提交/处理时间写入、队列排序、状态校验、防止重复审批覆盖 |
| `src/utils/auth-api.ts` | 接收新字段；审核列表请求禁缓存 |
| `src/utils/admin-verification-time.ts` | 将 D1 无时区 UTC 字符串明确转为 JST |
| `src/components/admin/AdminDashboard.tsx` | 日期标签、手机布局、请求竞态保护、错误展示、待审核计数 |

新增 `verification_requested_at` 和 `verification_resolved_at` 均为 nullable TEXT，由 Worker 在动作发生时用 `datetime('now')` 写 UTC。`created_at` 保持注册语义，`updated_at` 继续服务原账号功能。

首次申请/拒绝后再申请写新提交时间并清空处理时间；重复提交待审核申请保持原提交时间和说明。批准/拒绝仅允许 `pending`，SQL 条件更新保证同时审批只成功一次；过期操作返回 409，前端保留错误提示，不伪装成功。审批成功仍沿用原 GeoPass 授权行为。

前端加载用递增请求序号忽略旧筛选响应，审批完成时刷新当前筛选。加载失败显示错误而不是“无数据”；审批按钮有执行中防重复保护和 44px 触控尺寸。

## 验证

- `node scripts/test-admin-verification.mjs`：14 项通过。真实 Worker 在临时 Miniflare D1 中执行旧 schema → 新迁移，覆盖历史数据不变、权限、排序、账号更新、重新申请、重复与竞争审批、JST 转换。
- `npx tsc -p workers/auth/tsconfig.json --noEmit`：通过。
- `node scripts/test-auth-email.mjs` 及 refresh-token 测试：邮件与令牌回归通过。
- `npm run build`：54 页面构建通过。
- `node scripts/test-admin-verification-browser.mjs`：真实后台组件的独立 CSR 测试，Chrome/WebKit × 320/390/1440px 共 6 组通过，零 JS 错误。接口、账号、审批均使用隔离 fixture。
- `BASE_URL=http://127.0.0.1:4338 VERIFICATION_BASELINE_418=1 node scripts/test-admin-verification-browser.mjs`：整页 6 组通过，覆盖美国浏览器时区、旧记录、切换竞态、接口失败、审批中切换、角标刷新和页面无溢出。已查看手机/桌面截图。
- 整站 `astro check` 有 60 个原有错误，与同依赖、同环境下生产分支基线 `8cbdfe7` 的错误签名逐项一致，无新增错误。
- 原站整页 Navbar 在 WebKit 瞬时 fixture 登录时可产生 React #418 hydration 警告；发布前生产页已复现。独立组件测试不允许忽略任何错误，整页只单独记录此基线警告。

## 发布顺序与回退

工作区基于生产分支 `origin/sakamichi-platform` 的 `8cbdfe7`，保留 SEO 和最新地图数据。发布前已下载 Auth Worker 生产 bundle、配置元数据、Pages 项目元数据，生产 bundle 与本地基线 dry-run 逐字节一致。

1. 记录 D1 Time Travel bookmark 和状态人数。
2. 只执行 `013_verification_timestamps.sql`，不要对 Auth 库批量应用这个目录里的其他服务迁移。
3. 检查新增字段、历史时间仍 NULL；部署 Auth Worker。
4. 部署 Pages，必须指定 `--project-name sakamichi-platform --branch=sakamichi-platform`，否则 worktree 分支会发到 preview。
5. 验证生产版本、匿名接口权限、公开页面和生产页面 fixture 交互。

迁移只增列和索引，兼容旧 Worker/前端。回退时保留新增列和已记录的动作时间，回滚代码即可；不需要恢复整个数据库或丢失新申请。

发布前 Auth 版本：`c56351e2-16a7-490b-b333-286da54b7fa5`。
发布前 Pages：`7075a7f7-479c-4ab2-b136-b17c65ce27bf`（SEO 提交 `db1ced3`）。

私有发布证据在工作区忽略目录 `.tmp/verification-before/` 和 `.tmp/verification-*.log`。证据中不保存实际密钥。

上线版本及生产验收会在发布完成后记录于本文件和部署 Map。
