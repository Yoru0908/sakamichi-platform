# MSG 生成器单独恢复（2026-09-16）

用户明确要求：只恢复 MSG 生成器，MSG 消息归档仍保持下架。

- 将 `archive/disabled-pages/tools/msg-generator.astro` 移回 `src/pages/tools/`，删除生成器专用的两个410 Functions。原 `MsgGenerator.tsx` 编辑/导出实现不变。
- 恢复桌面「更多/その他」下拉、手机同组、工具目录创作分组及页脚入口；入口、页面标题和介绍支持中英日。
- `/messages` 根/斜杠/query/子路径仍走原410/noindex/no-store Functions。归档页面仍在禁用目录，不恢复首页 TrendingMSG、消息请求或付费宣传。
- 只部署 Pages，不改独立 MSG 推送/采集/归档服务、Auth Worker、D1/R2 数据、账号、PM2、secrets或绑定。

## 验证

```bash
npm run build
node --test scripts/test-msg-withdrawal.mjs scripts/test-navigation-i18n.mjs
node scripts/test-msg-generator-restored.mjs
node scripts/test-repo-form-display.mjs
BASE_URL=https://46log.com node scripts/test-msg-generator-restored.mjs
```

浏览器测试覆盖1440/390px日语菜单与目录、选成员、编辑文字、上传图片及实际下载1000px宽PNG，验证图片区域与文本像素，不只检查DOM。所有账户API和成员头像资源模拟，不写真实用户数据；监控禁止归档API请求。正式域名模式额外检查四种 `/messages` 路径410/noindex。测试产物位于 `~/.cache/msg-generator-restored/`，不进Git或部署目录。保持此前Repo数字清空与语言弹层回归通过。

## 生产结果

Pages production `af78f4e2-24e4-46ca-a09e-c6e70c8622cc`，代码 `265d598`。正式域名1440/390px生成器全流程（模拟API）与实际PNG通过；四种归档URL均410/noindex。正式域名Repo数字与语言弹层两种宽度回归也通过。中央 `PROJECT_DEPLOYMENT_MAP.md` 已更新生成器恢复/归档持续下架边界。
