# 中文博客站：可追溯的日语提及分析

## 范围

入口 `https://46log.com/blog/` →「关系分析」。本轮只完善现有中文站关系分析，不开发日本新站，也不改全文搜索、阅读管理、博客翻译、其他业务页的语言设置。

旧 React 组件调用 `/api/interactions/all`，失败回退 `/data/interactions.json`，生产仅有 2026-08；旧后台按译文和宽松昵称汇总，缺少逐篇依据。新组件不再调用上述两条数据路径。旧后端、历史静态文件保留，**本轮未修复或重部署旧后端分析 API**。

## 数据与统计口径 `ja-evidence-v1`

- 使用既有 `blogs.original_content`；没有独立原文时仅解析 `bilingual_content` 中显式 `lang="ja"` 的日语段落。没有日语不回退中文译文，也不识别图片中的人。
- parse5 解码 HTML 实体，排除脚本、样式、导航、隐藏内容、属性、URL；规范化 Unicode 与空白，正文仍以文本渲染，不插入源 HTML。
- 方向严格为 **博客作者 → 被提及成员**。不会因 A 同时写到 B/C，就生成 B↔C，也不生成“亲密度”或好坏关系评分。
- 全名优先，先遮蔽全部团体/作者自己的完整姓名，再处理简称；例如“小田倉麗奈”不能变成“守屋麗奈”，“松田好花”不能变成“松田里奈”。
- 简称须带敬称且在名录中唯一，或同一文本行内存在唯一可消歧的全名。跨团重名、毕业成员也参与消歧；姓名中的更短子串、未知第三方姓名前的汉字前缀、裸单字和不确定昵称不推断。这是保守规则，会漏计，不是完整自然语言理解。
- 名录来自共享头像数据，明确姓名分隔才生成姓/名简称，补充历史成员；分析独立修正林瑠奈、松尾美佑、佐藤璃果的四期生元数据，不改共享头像文件。名录内毕业成员可作为对象。
- 当前只生成同团关系；非成员作者（如ポカ）、“未知成员”、尚未归属个人的接力作者，明确列为未纳入，不擅自分配作者。
- 同一官方原文 URL 去掉跟踪参数/规范化同站域名后去重，采用最新保存版本。旧存档真实 `/s/.../diary/detail/...` 相对路径可解析；商品/直播链接、虚构恢复 URL 不合成官方博客地址。
- 每个作者→对象组合记录独立博客篇数、文字出现处数；一篇重复写 N 次是 **1 篇 / N 处**。最多列该篇 3 处摘录，其余通过原文核对，每处含日语文本、识别方式。
- 依据提供官方原文和 `/blog/#blog/{id}` 站内链接、日期、日语来源类型；标题为空显示“无标题博客”。官方删文/毕业归档失效不意味着摘录是实时官网内容，来源是本站已存档正文。
- 被提及排行按独立博客数；期别矩阵按「作者×对象×博客」记录数，不能冒充去重博客数。
- 覆盖范围分开列源记录、去重、日语可分析数、缺正文、非名录作者、来源/日期异常、大小超限；无可分析正文与“已分析但没匹配到”不同。不是官网全量，当月尚未结束。

## API / 运维边界

- Pages Function `GET /api/blog-relations`：只返回实际存档的团体/月份目录和源记录数。
- `GET /api/blog-relations?group=sakurazaka&month=2026-09&format=source`：只返回所选月份的固定博客字段（`ja-source-v1`）。受保护的源记录包含既有双语 HTML，但分析线程只识别其中日语段落；不读取独立 `translated_content` 或后台状态/密钥等字段。支持 HEAD；其他方法 405；未知/重复参数、原型键、非法月份拒绝。
- **解析/匹配运行于浏览器独立 Web Worker** `relationship-analysis.worker.ts`，与离线核验共用同一引擎；不把整月 HTML 解析放进 Cloudflare 请求 CPU 预算。无需新增套餐、服务器进程或 cron；切换月份会取消请求、终止旧线程，30秒未完成明确报错。原始 HTML 绝不插入 DOM。
- 短暂发布的第一版服务端计算客户端没有 `format=source`，现在返回明确 426 刷新提示，不能把源记录误当成已计算统计。未更改统计口径版本。
- Pages production 必须增加 `BLOG_RELATIONS_SOURCE` → 现有 D1 `9eaf182b-e777-4f14-8330-17af49ca4f7e`。**不绑定 auth/Miguri 数据库，不改 schema，不导入/改写任何博客、队列或用户数据。**
- D1 binding 本身具有写权限且该库还包含其他后端表，**不是数据库级只读授权**。安全边界是固定表/列 SELECT、参数化筛选、完整源码审查；不得扩展为任意 SQL/表代理，也不得读取 `msg_messages`、`system_config` 等无关表。
- 每次读取 HTML 前检查最多 800 条 / 600 万源码字符；单篇最多 60 万字符、识别候选上限 5000、整月依据上限 15000。超过容量失败关闭，不偷偷截断成完整统计。
- 内部 Cache API TTL 600 秒，键含源码接口版本/团体/月；对浏览器始终 `no-store`，不开放跨域 CORS。缓存命中流式转发，不重复解析整个 JSON；未命中只序列化一次。缓存失效回到真实 D1，读取失败显示错误，不回退旧静态数据。源数据读取时间由服务器提供；另列浏览器本机计算时间。
- 安全检查在任何缓存读取之前：只允许主站 `46log.com`；Pages 预览/未审核别名返回 403。日本来源还必须有 access_token，经固定 `https://api.46log.com/api/auth/me` 查询有效签名及当前用户认证/admin 状态；只转发必要的 access_token，不读取付款/OAuth 链接，不信任伪造 geo_pass。不动既有 WAF、原站访问限制或独立 MSG 服务。
- 没有定时任务。按需计算仅表示读取**已有**正文；不会补抓缺失文章/日语，也不意味着整站采集完整。
- 后端工作区存在其他未提交修改，本轮不部署该目录；不重启 Homeserver/PM2/采集器，不重复 Miguri 同步。

## 验证方法

```bash
node --test src/utils/blog-relations/analyze.test.mjs
npm run build
wrangler pages functions build functions --outdir /outside/repository/functions-build
NODE_PATH=/path/to/playwright/node_modules \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/test-blog-relations-browser.mjs
# 对已保存的只读导出审计（不访问/写入生产库）：
node scripts/audit-blog-relations.mjs /outside/repository/source-snapshot.json
```

浏览器覆盖 1440px/390px、按月懒加载并由真实 Web Worker 解析原始 HTML、日语高亮/链接、每页10篇依据、排行/期别追溯、缺正文和零匹配的差别、快速切换请求取消、错误不显示旧数值、重试、不请求旧 API/静态 fallback。该套浏览器用 API fixtures；不能替代部署后的真实 D1/API 验收。

全仓 Astro 诊断基线仍有 59 个错误，不声称全仓类型检查通过；本轮新文件另行核查。

## 发布记录

待生产验收后填入部署编号、数据覆盖/自动核验结果及实际请求结果。回滚仅回滚本轮 Pages 代码/专用 binding 配置，不回滚旧非原子 Miguri Worker，不删除原始博客或任何独立服务。
