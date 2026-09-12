# MSG 站内功能下架（2026-09-13）

按用户要求，MSG 相关内容暂不在 Sakamichi Platform 上线。

## 下架范围

- 移除 `/messages` 和 `/tools/msg-generator` 的 Astro 页面；源码原样移至 `archive/disabled-pages/`，不进入构建。
- Pages Functions 对上述根路径、带参数/末尾斜杠/子路径统一返回 HTTP **410**，`noindex, nofollow`、`no-store`，不是只隐藏菜单。
- 删除桌面/手机菜单、页脚、首页快捷入口、工具箱入口、画廊「MSG截图」筛选。
- 删除首页 TrendingMSG island 与归档 API preconnect，首页不再抓取或展示 MSG 消息。
- 清理主页 SEO、三语言页脚、关于、登录/注册、权限说明及用户中心的 MSG 宣传/付费解锁承诺。
- 构建中不包含 MsgArchive / MsgGenerator / TrendingMSG 客户端 bundle。

## 保留内容与边界

本次是 **46log 平台网站下架**，不删除 D1/R2 消息存档、账号或订阅记录，不停独立 MSG 推送/采集/归档服务，也不修改独立旧生成器域名。QQ 中继、博客、广播、INS、共享头像工具继续工作。共享头像模块虽位于 `components/messages/msg-styles.ts`，仍由用户中心/Repo 使用，不应因目录名而删除。

旧源代码、组件均保留在 Git；`archive/disabled-pages/` 不应复制到 `public/` 或作为发布目录。不可通过直接部署旧构建恢复功能。

## 恢复方式（需用户重新确认）

1. 在独立分支恢复 `archive/disabled-pages` 页面到 `src/pages`，移除相应410路由。
2. 按需要恢复导航、首页和文案；重新核对内容权限与开放范围，不能只恢复付费宣传。
3. build + 测试 + Pages 部署；再提交、推送生产分支。

## 验证

```bash
npm run build
node --test scripts/test-msg-withdrawal.mjs
```

测试覆盖源码保留/路由移除、根/子路径410及禁止索引、各入口/宣传清理、生成物无 MSG 页面与消息 island。
