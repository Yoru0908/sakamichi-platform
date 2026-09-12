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
- 安全检查在任何缓存读取之前：只允许主站 `46log.com`；Pages 预览/未审核别名返回 403。日本来源还必须有 access_token，经固定 `https://api.46log.com/api/auth/me` 查询有效签名及当前用户认证/admin 状态；只转发必要的 access_token，不读取付款/OAuth 链接，不信任伪造 geo_pass。缺失/过期登录返回401，未认证或非主站返回403，验证服务故障返回503；均在缓存读取前拒绝。客户端仅对401复用既有 `/api/auth/refresh` 续期并重试一次，避免15分钟 access_token 过期后已认证用户一直报错；403不刷新、不循环重试。不动既有 WAF、原站访问限制或独立 MSG 服务。
- 没有定时任务。按需计算仅表示读取**已有**正文；不会补抓缺失文章/日语，也不意味着整站采集完整。分析数据访问只有 SELECT；登录续期属于既有 Auth 服务的正常会话流程，不是分析服务写入认证库。本轮未用真实账号执行续期。
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

浏览器覆盖 1440px/390px、按月懒加载并由真实 Web Worker 解析原始 HTML、日语高亮/链接、每页10篇依据、排行/期别追溯、缺正文和零匹配的差别、快速切换请求取消、错误不显示旧数值、重试、401会话续期一次、不请求旧 API/静态 fallback。该套浏览器用 API fixtures；不能替代部署后的真实账号/API 放行验收。

可用 `RELATIONS_REAL_SOURCE_FIXTURES=/outside/repository/live-d1-source-fixtures.json` 额外传入真实 SELECT 结果，验证浏览器线程和离线引擎一致。`RELATIONS_BASE_URL=https://46log.com` 测正式页面资源；此时仍拦截数据 API，不会读写真实账号。

整页启动期仍偶发可恢复 React #418（本地和线上都观察到，发生在进入关系分析前；既有 Repo 文档也记录过此类早期认证 hydration 问题）。默认测试严格失败；明确设置 `RELATIONS_ALLOW_STARTUP_418=1` 时只把**进入关系分析前**的该警告单独输出，其他错误以及进入关系分析后的全部错误仍失败。发布验收使用此显式范围，不声称整站没有 hydration 问题，也未开展用户暂停的全站语言/认证界面修复。

全仓 Astro 诊断基线仍有 59 个错误，不声称全仓类型检查通过；本轮新文件另行核查。

## 发布记录

### 2026-09-13

- 当前 Pages production：`40217ecd-0699-4f94-8e03-9bd7e7468851`，Git `e27a581342d1a995a1c92330aa059cf3bc49350e`；production branch `sakamichi-platform`，部署状态 success，`commit_dirty:false`。
- 主站 `https://46log.com/blog/`；部署预览 `https://40217ecd.sakamichi-platform-test.pages.dev` 的受保护数据接口故意返回403。
- 初始服务端版本 `368ffd1`，浏览器线程 `68f3b2d`，登录续期 `8742bed`，随后完善边缘原生 fetch 兼容（保留 receiver、AbortController、manual 重定向并拒绝3xx），最终删除临时诊断。旧部署编号不是当前推荐回滚目标。
- 保留生产 Repo 旁白颜色/导出等改动至 `9db090c`，也保留 Miguri 原子修复、MSG 410、Instagram 归档导航；没有部署脏的博客后端工作区。
- 只增加 production `BLOG_RELATIONS_SOURCE` binding；原 `GEO_PASS_SECRET`、其他 Pages 配置和 preview 均逐项比较未变。未改 WAF/套餐/CPU配置、独立 Workers/采集器/PM2，也没有创建新日本站。
- **139 项回归通过，45 页 Astro 构建与 Pages Functions 编译通过。** 全仓 Astro check 仍为59 errors / 0 warnings / 139 hints，本轮相关源文件没有新增错误。
- 本地和正式页面的桌面/手机业务流程通过（显式记录上述启动警告）。真实 D1 的5组/月数据另外送入正式页面的 Web Worker：櫻坂2026-09、日向坂2025-12及2026-09、乃木坂2026-09及缺正文的2024-10，结果与离线引擎一致；较大月份228条正常分析，缺正文不显示伪造零关系结论。
- 直接调用真实 D1 的固定 SQL + 本地 handler 集成测试：51个团体/月目录，5个月份；**21,666 rows read / 0 writes**。这是“真实D1＋本地授权上下文”测试，不伪称是公开接口认证放行测试。
- 真实 HTTP 验证：日本匿名、伪造 geo_pass、无效 access_token 和伪造 `CF-IPCountry: US` 均被拒绝（401）；preview403；无效 token 确认经过真实 Auth 服务返回401，不再落入先前的边缘 fetch 503。最终按专用请求头过滤的短时 tail 捕获2条自己的拒绝请求，均 outcome=ok、logs/exceptions 为空；不把它扩称为授权放行路径日志验收。六种 MSG 撤下 URL 仍410/noindex/no-store。
- **仍待补验：使用已有已认证账号，或合规非日本真实浏览器，完整走公开数据接口的200放行链路。** 现有测试出口均识别为日本；美国普通 HTTP 探针被原 WAF challenge 拦截。未放宽安全规则，也未使用用户真实登录态。不能把 fixture 或拒绝路径验收写成此项已通过。

只读全量存档核验（51个团体/月，原始数据 SHA-256 `c9cdde157533965de29cfe962de6c7befcd06b3d53f05e930cf183dbc13d8b83`）：

| 团体 | 源记录 | 可分析日语 | 缺日语 | 非名录作者 | 无有效官方来源 |
|---|---:|---:|---:|---:|---:|
| 乃木坂 | 862 | 800 | 61 | 1 | 0 |
| 櫻坂 | 1134 | 1112 | 21 | 1 | 0 |
| 日向坂 | 1920 | 1829 | 27 | 52 | 12 |
| 合计 | 3916 | 3741 | 109 | 54 | 12 |

自动逐条验证 **3733 条展示摘录**均存在于对应博客的规范化日语正文中、作者/原文链接一致、博客数/出现处数可对账；不是声称所有自然语言指代都经人工确认。12条无有效来源包括误存的商品/直播链接与旧恢复占位地址，只排除、不改写。另有2条真实相对官方博客路径已正确解析。

2026-09 可分析数/关系组合：乃木坂16篇/3组、櫻坂30篇/13组、日向坂81篇/52组。例：山川宇衣→小田倉麗奈的旅行博客 `sakurazaka-70916` 保留2处日语依据，不再凭译文猜测。

生产资源与本地构建哈希一致：

- `BlogInteractions.CbWDQO31.js`：`98626dd24bf0577772c7ed21381625431c4f0b00d9086566fca99eab7f8ffefd`
- `relationship-analysis.worker-B37WPLFJ.js`：`aba53a88a3afbea745c11bed3d015721e7b3dceeeb5d6b9a3221bd9977f99611`

审计文件和截图在 `/Users/yoru/.cache/blog-relations/`，原始源导出、配置备份和诊断 tail 为本地受限文件，不进入 Git/生产资源。没有向 Homeserver 根分区写下载或日志。

回滚仅回滚本轮 Pages 代码/专用 binding 配置（保留其他 secrets/bindings），不回滚旧非原子 Miguri Worker，不删除原始博客或任何独立服务。
