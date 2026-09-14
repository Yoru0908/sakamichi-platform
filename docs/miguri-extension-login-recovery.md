# Miguri 扩展 v1.1.16：Meets 登录恢复

## 状态

修复及自动化测试完成，网站发布包已更新至 v1.1.16，待真实账号验证和 Chrome Web Store 上传审核。Dashboard 推荐版本、支持页及 `public/downloads/46log-miguri-sync.zip` 同步更新；下载链接增加 `?v=1.1.16`。网站明确区分 ZIP v1.1.16 与商店 v1.1.15，现有安装仍需手动更新。本扩展运行在浏览器，不需要 SCP 或 PM2 重启。

本次发布在 `.worktrees/miguri-login-release/` 基于最新生产分支 `83df033`（发布前线上 Pages `be1db8da`）构建，保留同期 Repo 导出/图片旋转等线上改动，不从旧工作区整站覆盖。

2026-09-15 JST 正式部署完成：Pages `f3ad3971`，源码 `9f6051d`，生产分支 `sakamichi-platform`。18 项自动化测试及 Astro 生产构建通过（构建保留既有静态页面 request.headers 警告）。

使用 Playwright Chromium 在 `https://46log.com` 实测：支持页 HTTP 200，显示 ZIP v1.1.16、商店 v1.1.15 与手动安装步骤；`/miguri` HTTP 200，加载 `/_astro/MeguriPrototype.VgGu3t29.js`，内含新版本说明及带版本号的下载链接；带/不带 query 的公开 ZIP 均 HTTP 200，与本地修复包逐字节一致。ZIP SHA256：`0dedc0009b03099ca2aa0f1a90949e78c4313cde0e0a60f7586ccc3ff8bbfbec`。普通 curl/urllib 会触发 Cloudflare challenge，未调整站点防护。此次未使用实际官方账号验证同步入库。

## 问题

用户截图显示官方「ログアウト」但扩展仍显示「等待官方登录」。截图不能唯一确定触发原因；代码确认存在以下等待问题：

- Meets API 返回 `LOGIN_REQUIRED` 后，旧逻辑只在 `lscache-id` 与上一次不同才继续；相同值即使已恢复登录也不会再验证 API。
- 等待 10 分钟后静默返回，用户无法知道任务已停止。
- 团体入口的活动链接若在 `document_idle` 后才由 SPA 渲染，旧逻辑不会再次检测。

## 修复

- 手动登录恢复每 5 秒重新读取当前 ID 并通过官方 API 验证，不以 ID 变化作为恢复条件。
- 仍需 API 成功才发送履历；非登录错误正常上报，不无限重试。
- 最多等待 10 分钟，超时通过现有 JOB_ERROR 流程释放任务并显示重试提示。
- 等待期间继续检测异步出现的活动入口。
- 自动同步保留登录失效即暂停的行为，不进入手动登录轮询。
- 没有增加权限，也不读取密码或 Cookie。

## 验证

```sh
node --test src/components/meguri/miguri-extension{,-login}.test.mjs
```

新增用完整 `official.js` 和模拟 Chrome / DOM / 时钟运行的 6 项回归：相同 ID 恢复、超时、自动同步暂停、非认证错误、SPA 无导航登录、延迟活动链接；连同现有测试共 18 项通过。

实际验收：关闭旧自动同步，更新扩展到 v1.1.16，刷新 Dashboard 和官方标签页后重新点击「仅同步 Meets（三坂）」，用反馈者自己的账号确认恢复及履历入库。若仍失败，需提供卡住页 URL 和扩展后台 API 的状态码（不要提供密码、Cookie 或请求头中的会话密钥）。
