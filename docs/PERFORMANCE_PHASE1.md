# 性能优化第一阶段 · 2026-09-06

## 版本与发布边界

- GitHub: https://github.com/Yoru0908/sakamichi-platform
- 原工作区基线：`baseline/pre-perf-20260906`（7b58399）。包含用户原有日程修改与扩展发布源码。
- 优化分支：`perf/phase1-20260906`。
- 本地独立 worktree：`sakamichi-tools项目统合/.perf-worktrees/platform/`。
- 基线已使用 tag 推送，未更新生产分支。未部署 Pages/Workers，没有改动生产 D1。
- 当前分支基于本地基线，不应不经核对就整体合并到远端生产分支；既有 Radiko/日程改动也在基线中。
- 继续使用 npm。基线中的 pnpm 配置尚未完成（含 allowBuilds 占位值），本次不做包管理器迁移。

## 本次完成

1. 认证初始化：跨 island 合并进行中请求，成功状态短暂复用 30 秒；显式 `initAuth(true)` 可重新验证。
2. 认证 revision 防止旧初始化结果覆盖登录、退出或个人资料编辑；失败不缓存。
3. refresh token rotation 请求 single-flight；API 请求增加超时，GET 不再无条件携带 JSON Content-Type。
4. 博客列表只由一个 effect 驱动；成员与页码原子更新，按 group remount；旧列表/搜索响应不覆盖新查询。
5. 博客同查询请求合并，缓存保留 total/hasMore/pagination 和合法空页；缓存数量有上限。
6. 新增并发、401 重试、初始化竞争、分页缓存回归测试。没有改登录/访问权限策略。

## 验证

使用 Node 24、当前 package-lock 对应依赖：

```sh
npm ci
npm run test:unit
npm --prefix workers/auth ci
npm run workers:typecheck
node --test workers/miguri/src/routes/official-schedule.test.mjs
npm run build
```

本地结果：93 个 src 单元测试通过、8 个日程测试通过、三个 Worker typecheck 通过、45 页构建成功。
使用本机无痕 headless Chrome + 完全拦截的假 API 做离线浏览器回归：单团博客首屏只发一次列表请求、一次 auth/me，切团数据正确，无 pageerror。

既有构建警告仍存在：大 HLS chunk、静态页面读取 request.headers、未使用图标 import。
全仓 `astro check` 仍有 **72 个类型错误**；另建完全相同依赖的基线 tag worktree 对照，基线同样 72 个错误，本次变更文件没有新增类型错误。全仓类型债务未解决，不能将“构建成功”描述成“全部类型检查通过”。本次也没有线上 LCP/INP 改善实测。

## 下一阶段

- 首页统一首屏数据与预加载图片，图片缩略规格与摘要接口。
- Miguri 公共 metadata/个人状态分离、冷查询缩小到有效活动；按 rows_read 决定复合索引。
- HLS.js 按需加载、非播放状态轮询降频；后台播放 heartbeat 必须保留。
- MSG 切成员取消请求、AList 播放 URL 按需解析。
- 前端硬编码 AList 凭据需要单独的移除/有效凭据 rotation；不要将原凭据写进 issue 或报告。

发布前先确认源站版本与依赖，保存上一份 Pages 部署作为回滚点；不要把 GitHub 分支提交误当成生产已发布。
