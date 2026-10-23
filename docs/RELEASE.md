# 46log release record

## 2026-10-23 — 活动记录、附近圣地与同步修复

工作正本 `.worktrees/events-page`，分支 `feat/events-page`，生产代码分支 `sakamichi-platform`。本轮目标与验收清单见 `46LOG_TASKS_20261023.md`。

### 已部署修复与数据

- 活动参与保存：`59b722a` → miguri Worker `bafd6d73-2cc7-4726-b33f-f2ae88bf0530`。樱坂真实 ID `12161_18:2026-10-18` 的下划线不再被错误拒绝；在真实登录浏览器验证保存、刷新后保留、取消恢复初始无记录。生产测试记录已清理。
- 地图质量门/运行报告：`959fa15`，再经 `0d39673` / `8b98d75` 自动提交安全新增，`935f2b0` 处理已审核作者变化。日向坂 4,280→4,383；线上 API 与发布文件 SHA 一致。樱坂综合 1,486 / 海外 141 的三个正常 runner 全链路也已运行并核对报告。1 处相模川移动保留旧点待审。详细来源、数量、边界及备份见 `SEICHI_SYNC_AUDIT_20261023.md`。
- 迁移 015：先导出 miguri D1 到本机私有缓存 `~/.cache/46log-release-20261023-miguri-before015.sql`（mode 600），再对 `969491b9-4960-4e5a-ab2d-37fa8e457b67` 执行四条 additive statements。书签 `000048d6-0000000a-0000510c-7aca901662e826c283587ef7cfbb4283`；两个新表、两个索引已核实，迁移后 marks/memos/profiles 均为 0。没有改动 auth 或 saka46log 数据库。

### 页面与私人记录功能

活动页只在 `.events-view` 内使用日期层级、轻量虚线票根和三团色，沿用全站字体、背景和导航。独立「活动记录」菜单含活动一览/我的履历/参与排名。`EVENT_HISTORY.md` 记录迁移、接口、默认私密、明确公开、空费用与零费用区别和可供 saka46log 适配的共享业务契约。

地图主动定位与半径筛选的纯计算模块为 `src/components/seichi/nearby.ts`；位置只在浏览器内存。底图建议及官方依据见 `MAP_BASEMAP_DECISION_20261023.md`；本轮没有新增 Google 计费 API，也没有替换全站底图。

### 回滚

- 本轮之前 Pages：`6c174b7f-e517-47b2-a365-38f440c74373`，source `1190e61`。
- 保存修复前 miguri：`99221a32-b3f0-4401-9fd8-ef892fedbccb`。仅需撤回后续私人记录功能时应退到保留保存修复的 `bafd6d73`。
- schema 015 为 additive；回退代码时保留新表，避免清除用户已保存的感想/花费/公开偏好。
- 不能用旧源码重新发布去回滚地图数据；当前 Git Raw 与 Pages 内置静态快照分别记录。远端同步备份位于 `/vol1/seichi-sync/backups/release-20261023/`，审查前 GeoJSON 位于 `/vol1/seichi-sync/reviews/20261023/`。

### 历史部署补记

此前漏记的只读 token `03703ea1` / code `58528c5`、miguri `67f0c890` 与 `99221a32`、saka46log `598c03c2`、Pages `d186b024` 与 `6c174b7f`、014 目标库、会场合并及备份，已在 `saka46log/docs/RELEASE.md` 与部署地图回写。token 是部署版本标识，不在文档写入密钥值。

前端与第二期 Worker 的最终版本、自然 cron、乃木坂回填及会场修补验收在完成后追加到本节。

### 已完成的发布前验证

- 页面构建成功，56页；Chrome/WebKit320/390/1440活动保存、刷新、失败/重试和布局通过。履历与感想浏览器流程、默认私密/公开/退出通过；导航在light/dark、reload、快速登录与SPA切换下无React水合错误。
- 旧workers:smoke已修正JSON请求及JSON响应校验，当前api.46log.com为8/8通过；过期旧域名的HTML200单列diagnostic，不计API成功。没有修改auth/community部署或WAF。
- 手动会场76条已按精确原ID/date/title更新并逐条回读，未新增日期；明细与备份见saka46log的manual-venues-20261023记录。

- 旧WebKit `/schedule` React hydration错误已复现并修：Intl中文日期空格在Node/WebKit不同，改确定格式；Astro序列化initialDate，mount后更新JST今日，避免静态构建跨日不一致。Chrome/WebKit×light/dark、跨日、reload严格零pageerror。
- 01:17 JST自然cron已完成oversea（started16:17:02Z/finished16:17:04Z），status=success、stage=complete、unchanged、commit935f2b0；不是手动触发。
