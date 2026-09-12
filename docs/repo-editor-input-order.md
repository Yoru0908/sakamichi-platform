# Repo 对话编辑器：输入光标与顺序（2026-09-11 JST）

入口 `/repo/create`，组件 `src/components/repo/ChatEditor.tsx`。

## 改动

- 移除 Enter 结束编辑的 keydown 拦截。Enter / Shift+Enter 使用 textarea 原生换行；IME 回车确认不再误关闭编辑器。
- 仅进入编辑时聚焦并将光标设在末尾；文字更新/中间编辑不强制修改光标。点击外部继续即时保存并结束编辑。
- 旁白输入框按换行数扩展 rows。
- 每条消息（含图片）提供上移/下移；边界按钮禁用。基于稳定 ID 重排原消息对象，不删除/重建消息内容；鼠标移动编辑中条目不夺走输入焦点。
- 「上に挿入」可在当前消息前直接插入成员/自己/旁白，自动聚焦。底部按钮继续追加至末尾。文字、speaker、imageUrl 等字段及原条目 ID 均保留。
- 新增文字消息检查已有 ID，避免打开旧草稿后序号冲突。

## 验证

```sh
node scripts/test-repo-chat-editor.mjs
npm run build
```

测试需要 Playwright + Chromium；可使用环境已装依赖，或 `npm install --no-save playwright && npx playwright install chromium`。Vite/React 复用项目依赖。

`tests/repo-chat-editor/` 是隔离 fixture，不在 Astro pages/public 下，不部署测试页面。测试不调用生产写接口。

通过：三类话者 Enter/Shift+Enter、模拟 IME composition/Enter 事件契约、中间文字编辑光标、失焦保存/重新编辑、追加焦点、上下移边界/内容与图片元数据完整、编辑中重排焦点、390px 视口三类话者前插与取消、无浏览器 runtime error。IME 测试验证事件处理契约，不替代 macOS/手机原生输入法人工验收。

## 部署边界

基于 `origin/sakamichi-platform` 的 `31ff1f6` 创建独立工作区 `sakamichi-tools项目统合/.worktrees/repo-editor`、分支 `fix/repo-editor-caret-order`，避免旧开发目录覆盖新版 Meets/Miguri 历史功能。

仅 Cloudflare Pages 前端部署，`wrangler pages deploy dist --project-name sakamichi-platform --branch=sakamichi-platform`。无需 Worker/D1/PM2 变更，不改圣巡独立站。部署前生产版本 `898b907f`（source `f9562ad`）可用于 Pages 回滚。
