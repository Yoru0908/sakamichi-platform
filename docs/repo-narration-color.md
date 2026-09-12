# Repo 旁白配色（2026-09-11 JST）

## 先备份

修改前干净生产基线 `2b730f1` 已建立并推送 annotated tag：

`backup/repo-before-narration-color-20260911`

不要直接以该旧快照覆盖之后其他功能；回退配色优先 revert 本功能提交，或仅还原对应组件。Git tag 用于精确对照原始导出效果。

## 功能与兼容性

- 模板选择下方新增「ト書き · 旁白颜色」：原样、浅橙、浅粉、浅蓝、灰色、自定义 HTML color picker。
- 默认原样：不改变旧模板/旧草稿颜色、间距或换行行为。
- 整张统一，深色文字 + 92% 白色混合的淡色背景；仅接受 `#rrggbb`，渲染为不透明六位 hex，避免在导出路径引入 alpha/filter/CSS 新色彩函数。
- 彩色旁白使用正常文档流，无固定高度/行数/截断；保留换行和 emoji，长连续字符自动折行。
- 同一配色适用于 Meguri/LINE/応援色预览和导出；编辑区自身的黄色旁白框不改变。
- `Message.narrationColor?: string` 在已有 messages JSON 中携带统一配色（包括普通对话行，以便暂时没有旁白的草稿也保留设置）。Worker 原样保存/返回 messages JSON，不新增数据库列、不迁移 DB、不部署 Worker。
- 本地 SavedRepo data 另保留可选配色字段以兼容空列表；账号读取映射、保存/发布 payload 保留并规范化消息配色。新建 Repo 重置原样，原样保存删除颜色字段；老客户端若重新保存可能丢掉新增颜色字段，但不会丢消息正文。
- `repo-image-export.ts` / `html2canvas-patch.ts` 均未修改；依旧 modern-screenshot、3x PNG、原 iOS 下载路径。

## 验证

```sh
node --test src/components/repo/narration-color.test.mjs
node scripts/test-repo-narration.mjs
node scripts/test-repo-export.mjs
node scripts/test-repo-chat-editor.mjs
node scripts/test-repo-preferences.mjs
npm run build
```

测试依赖现有 Vite/Tailwind、Playwright Chromium、sharp；fixture 放在 tests，不进入生产页面。导出测试从上述 Git tag 虚拟加载旧模板，以真实 `exportRepoElementAsPng` 触发并解析 PNG，不仅检查 DOM 截图。

已验证：

- 3 项纯函数回归：颜色白名单、JSON 往返/复原/不改正文图片ID、黑白/预设/亮绿配色对比度 ≥4.5。
- 账号 API **全部模拟拦截**：预设/自定义、选色后新旁白继承、保存与重载、切换三个模板、重置原样及旧草稿读取。不写真实账号。
- 三个模板的原样 PNG 与 Git 备份逐像素相同。
- 48 条消息的粉色长图：Meguri `1140×13521`、LINE `1140×13480`、応援色 `1140×13444`；尺寸与 DOM 3x 对应、底部标记完整、首尾旁白背景颜色正确、每个内嵌图/头像在相应位置像素可见，长旁白/多行/emoji/长连续文字无横向溢出。
- 原输入光标、排序、插入、长列表自动滚动和偏好目录回归通过。

验证范围为 Chromium 实际 PNG 下载；没有声称验证 iOS/WebKit 原生下载，也没有改变其既有实现。浏览器极端长图 Canvas 尺寸上限仍受原导出库/设备限制。
