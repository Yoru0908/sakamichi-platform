# 「その他」与 Instagram 归档（2026-09-13）

## 改动

- 日语导航及 `/tools` 改称「その他」（中文「更多」，英文「More」）。Instagram 不再作为桌面顶栏、手机「内容」组或首页快捷项；改放「その他」下拉/手机分组、页面「アーカイブ」分类及页脚的社区/更多列。
- 保留 `/instagram` 原地址、收藏、内容、下载链路与原有权限检查。页面名称统一为「Instagram アーカイブ」，不搬迁后台、不删除归档。
- 修复 `NavPill` 写死中文、静态页脚写死中文的问题。截图中的工具页标题、分组、卡片说明、导航、页脚，以及 Instagram 界面按钮/空状态/搜索文案均支持三语言切换。修正「収藏」为「お気に入り」。
- React 使用统一 `useLanguage()`：静态中文服务端快照与首轮 hydration 一致，再应用已保存的语言。Astro 静态节点用 `data-i18n`，在语言变化及 ClientRouter 页面替换后更新；标题和页面 description 同步。保留原 `localStorage.lang` 偏好、默认中文；无效值或不可用 storage 安全回退，支持跨标签页同步。
- 滑动选中背景随译文宽度/字体/窗口尺寸重新测量，Instagram 路由正确选中「その他」；悬停其他菜单时原选中项不会留白字。
- 1280px 以下使用抽屉导航，避免日语导航、站点名称和登录按钮被挤成两行；桌面保持单行。

## 边界

本次是截图所涉导航/工具目录与 Instagram 界面的语言及分类调整，不宣称已翻译全站所有业务表单或用户原始内容；地域限制规则和原有双语验证提示不变。MSG 下架仍保留，未恢复页面、推广、消息请求或 bundle。无 Worker/D1/PM2/采集/券数模型改动。

## 验证

```bash
node --test scripts/test-navigation-i18n.mjs scripts/test-msg-withdrawal.mjs scripts/test-meets-integration.mjs src/components/nav/mobile-nav.test.mjs
npm run build
NODE_PATH=/path/to/playwright/node_modules CHROME_PATH=/path/to/chrome node scripts/test-navigation-i18n-browser.cjs
```

- 与 Miguri parser/Worker/矩阵回归合跑：123 项通过；Worker 独立类型检查通过。
- Chromium 1440 / 1280 / 1024 / 390px：日语偏好冷启动、切换中英日并刷新保留、跨标签页同步、工具目录→Instagram→前进后退、手机归档分组、选中背景宽度与悬停字色、页脚、无效语言安全回退均通过。
- 页面有静态标题不等于 React 已完成 hydration。浏览器回归等待 island 加载与 View Transition 完成后再连续前进/后退，避免测试脚本立即取消尚未完成的 hydration（React #424）。正常交互回归无 hydration/运行时错误、无 MSG 归档请求。
- Astro build 45 页通过。全仓 Astro check 仍有既有诊断；本次修改文件没有新增 error，不以 build 成功代替全仓类型检查通过。

发布使用基于生产分支的 `.worktrees/miguri-structure`，合并保留并行 Repo 编辑器修复，不从旧配置分支构建；测试图片和日志留在本机 `.cache/miguri-structure/`，不混入生产目录。
