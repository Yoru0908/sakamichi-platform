# 圣巡定时同步核查 — 2026-10-23 JST

## 修复后验证（00:52–00:59 JST）

下文初次审计的 4,280 点/未部署是历史现场。修复 `959fa15` 已通过 Git bundle 从本地正本部署到 `/vol1/sakamichi-platform`，保持 tracked 工作区干净；备份在 `/vol1/seichi-sync/backups/release-20261023/`。保守增量发布在 00:52 两次正常 runner 执行中分别提交 `0d39673`（4,330 点）、`8b98d75`（4,380 点），实测抓取→质量门→测试→commit→push。

来源差异按固定候选散列逐项审查后，`935f2b0` 发布 4,383 点，详见 `SEICHI_HINATA_REVIEW_20261023.md`。相模川约 4.2km 的移动仍保留旧点待审；不会阻止其他安全新增继续发布。发布文件与 Pages 线上 `/api/seichi-data/hinatazaka` 逐字节相同，SHA-256 `a898fa3a20f2c1e4c9f7b7942196057d70c6e1e1159d05a40ed77fab79af5fc5`。

00:58 再用三个正式 runner 跑完整链路，`shimizu-hinata` / `oversea` / `fumi` 独立 run reports 均为 `status=success, stage=complete, exit_code=0, outcome=unchanged, production_commit=935f2b0`。日向坂业务报告为 `validated-with-pending`，4,382 精确匹配 + 1 保留待审，0 新增/删除/延期新增。手动验证使用 `SEICHI_ALERT_DRY_RUN=1`，没有额外发送测试消息；正常 cron 的通知配置未改。真正失败通知的送达仍需未来实际故障回执，不能由退出码测试冒充。

已核对原 cron 三路均存在、此前正常定时触发。修复后的下一次自然 cron 执行证据将在本轮 RELEASE 中补记。

## 初次只读审计现场

核查窗口：2026-10-23 00:31–00:41 JST。Homeserver、Git、公开 KML、fumi tag 索引和线上 API 均只读检查，未重跑任务、未改 cron、未发布数据、未发通知。以下 trap 修复已在本地完成并测试，审计结束时尚未部署。

## 结论

三路 cron 均在执行。海外与 fumi 最近三轮成功且没有新数据；**清水ひなた抓取成功、发布失败，线上仍停在 4,280 点**。首次失败为 10/12 07:31 JST 的删除数量守卫，至最新轮已有 43 次拒绝。另发现三份 runner 的 EXIT trap 吞掉失败退出码，告警状态错误地保持正常。

## 定时、运行与发布证据

Homeserver `192.168.3.11:619`：时区 `Asia/Shanghai`，根分区 49%，`/vol1` 76%（低于 runner 的 85% 停写线），核查时无同步进程在跑。crontab 的 repo/runtime 与 Map 一致，均在 `/vol1`：

| 任务 | 实际 cron（CST） | 对应 JST | 最近三轮 JST | 最新结果 |
|---|---|---|---|---|
| oversea | `17 */6 * * *` | 01/07/13/19:17 | 10/22 07:17、13:17、19:17 | 141 点，validated，测试通过，no production data changes |
| shimizu-hinata | `31 */6 * * *` | 01/07/13/19:31 | 10/22 07:31、13:31、19:31 | 前两轮拒绝 121 additions，最后拒绝 127 additions，最大值 50 |
| fumi | `43 */6 * * *` | 01/07/13/19:43 | 10/22 07:43、13:43、19:43 | 总 1,486 / fumi 934；19 个候选都已发布，无新增，测试通过 |

日志：`/vol1/seichi-sync/logs/{oversea,shimizu-hinata,fumi}-sync.log`。最新 report：

- oversea `reports/latest.json`：10/22 19:17:02 JST，141→141，added/removed 均 0。
- fumi `reports/fumi-crawl-latest.json`：10/22 19:43:13 JST，基点 articleId `60086133` 之后 6 篇文章、19 个地点，`fetchFailures=[]`、`jevFailed=false`、`locateDeferred=0`；`fumi-latest.json` 19:43:14，19 个已发布，新增 0。未在本审计重抓所有历史文章。
- shimizu raw/candidate/state：10/22 19:31:03–04 JST，4,379 点；`reports/shimizu-hinata-latest.json` 及 promoted 文件却仍是 **10/12 01:31:05 JST 的 4,280 点**。失败时 promoter 不写 report，所以旧 `status=validated` 不能作为最近成功证据。

Homeserver 任务仓库 `/vol1/sakamichi-platform` 核查时干净；HEAD 与本地 origin 缓存均为 `6b57329cd5cd457ab8dff2e530efdc6fad512e94`，实时 `git ls-remote` 为 `1190e616f58a731b9658c7b62b0e31d76efa2678`。后者是当晚人工页面发布，晚于最近一次 cron；不能仅据此判定 cron 拉取失败。

| 数据文件 | 最后数据提交 | 提交时间 JST / 发布证据 |
|---|---|---|
| hinatazaka-all.geojson | `1ab461a7508ea68c576c6c1ea298cc35d78f2f0f` | 10/11 19:31:06，日志 19:31:08 committed and pushed；最后成功无变更轮为 10/12 01:31:05 |
| oversea.geojson | `bb037b34f221ca2a4c59b58433df035a5988ddae` | 08/27 07:17:03；日志 07:17:05 committed and pushed；当前实时源/API 语义相同，旧提交日期不代表抓取停了 |
| sakurazaka-all.geojson | `6b57329cd5cd457ab8dff2e530efdc6fad512e94` | 10/20 01:43:15；日志 01:43:17 committed and pushed；当前 Git Raw/API 逐字节一致 |

## 清水源与线上逐层比对

配置文件、运行脚本与实时 KML 均指向用户指定 My Maps **`14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ`**：[公开源](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)，[KML](https://www.google.com/maps/d/kml?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ&forcekml=1)。`hinatamap.pages.dev/source-map` 的页面核查由主任务另行完成；本记录验证此 mid 的实际数据链。

00:33:40 JST 实时 KML：**4,383 点、6 个非 Point placemarks**。相对最近 cron 的 4,379 点又增加 4 点、修改 1 个 fingerprint，删除 0。说明源仍在更新，不能把 4,379 写成永久当前值。

| 层 | 点数 | SHA-256 |
|---|---:|---|
| 实时 KML 00:33:40 | 4,383 | `01d8cac504fed36f1de7933d270bc6554750cad1bfbdea6a1a19420a5efb4beb` |
| Homeserver 最新 candidate | 4,379 | `6e9994dd09a06e9bcf43c5c0e80b406bcca11abbff39abd22b484061ed397c80` |
| Homeserver production GeoJSON | 4,280 | `ec8eed594191e875426bec842fdfe47d2f2c458f60146870a02e06becd5983e5` |
| Git Raw / `sakamichi-platform` 分支 | 4,280 | 与上行逐字节一致 |
| [线上 API](https://6c174b7f.sakamichi-platform-test.pages.dev/api/seichi-data/hinatazaka) | 4,280 | 与上行逐字节一致；HTTP 200，缓存 300s |

4,280 个 production features 全部属于该 mid，无人工非来源行。Git blob 为 `6c8ee245631afcc0abdd6aa815a19c844b049a08`。页面取数链正常，停滞发生在 promoter，重新部署 Pages 本身不会补齐。

海外实时 KML 为 141 Point / 112 非 Point；与 API 的名称、坐标、图层、说明、图片数量逐项语义相同（Google 图片 URL 本来会轮换）。海外 API SHA-256 `e605d991d3c41689c6ec360eb1e9aee529fcf18f887fbf9559f971721bb07f43`。櫻坂 API/Git Raw 都为 1,486 点、934 个 `fumi-article:`，SHA-256 `ef8350df496cdf483fedafccf2f38243a6e480839441fe762d7fad9d1702c6d9`。

## 櫻坂 / 海外全链路

以下 canonical 均是 `Yoru0908/sakamichi-platform` 的 **`sakamichi-platform` 分支**。Homeserver `/vol1/sakamichi-platform` 在每轮抓取前 fetch/fast-forward；三个 runner 共用 `git-publish.lock`，测试/质量门失败均不能进入 git commit/push。

| 数据 | source → fetch/validate/promote | Git 文件 → Pages 动态端点 | 当前链路状态 |
|---|---|---|---|
| 櫻坂综合图增量 | [fumi Diary 2号店](https://fumichen2.livedoor.blog/) 的櫻坂46及四期成员 tag → `sync_fumi_articles.py`（基点 60086133、每次刷新 tag，正文缓存）→ `place_extract.py` / `fumi_locate.py` → `fumi_review.py` → `promote_fumi_articles.py` | `public/seichi/sakurazaka-all.geojson` → `/api/seichi-data/sakurazaka` → `/seichi/sakurazaka` | 最新 crawl/review 19点都已在库；promoted/current/Git Raw/API 完全一致 |
| 櫻坂海外图 | [My Maps 16UuI7FsZ44eye0vxkXhEnBNu44I2NqE](https://www.google.com/maps/d/viewer?mid=16UuI7FsZ44eye0vxkXhEnBNu44I2NqE) → `sync_mymaps_sources.py` → `promote_oversea_mymaps.py`（最低100点、新增≤50/删除≤10、坐标/唯一键/图片策略） | `public/seichi/oversea.geojson` → `/api/seichi-data/oversea` → `/seichi/oversea` | 最新141点，与实时源语义一致；promoted/current/API同SHA |
| 日向坂综合图 | 用户指定 My Maps → `sync_mymaps_sources.py` → `promote_shimizu_hinata.py`（最低3500点、新增≤50/删除≤10） | `public/seichi/hinatazaka-all.geojson` → `/api/seichi-data/hinatazaka` → `/seichi/hinatazaka` | fetch正常、promote拒绝；API仍忠实提供最后已发布4280点 |

櫻坂综合图的 934 个 fumi 点之外还有 552 个历史/人工点。fumi promoter **只追加、不改不删已发布点**，不会把这 552 个当成待清理的源外数据。`/seichi/sakurazaka` 另加载独立静态 `sakumap-supplement.geojson`，不是 fumi runner 的写入目标；成员专用图 `yamakawa-ui.geojson` 由 `append_member_spots.py` 追加对应成员的新 fumi 点，本次最新成功 push 日志显示无新增，保留104点。

00:40:25 JST 额外实时读取 10 个配置 tag 的 12 个索引页面，全部 HTTP 200，旧 `blog.livedoor.jp/fumichen2` 正常重定向到 `fumichen2.livedoor.blog`。基点后的文章 ID 为 **60088090 / 60090966 / 60097924 / 60098837 / 60098860 / 60109745**，与 Homeserver 19 点候选所属的 6 篇文章完全一致。新近条目包括「元凶」PV、「16thシングルヒット祈願」、「夏の近道」Dance Practice。本次核验了实时发现目录的覆盖，未重新定位全部历史文章地点。

| runtime artifact | 数量 | SHA-256 | mtime JST |
|---|---:|---|---|
| oversea candidate | 141 | `342c022d174ca336fc551cde8719e4a8cd6bbfbcf0986fe0e07c507560eadb45` | 10/22 19:17:02 |
| oversea promoted/current/API | 141 | `e605d991d3c41689c6ec360eb1e9aee529fcf18f887fbf9559f971721bb07f43` | promoted 10/22 19:17:02 |
| fumi candidate/reviewed | 19 | `1ec194cec8eae8b3300307818e2de4de661f96d1b1307997421fac9223876d59` | 10/22 19:43:13–14 |
| sakurazaka promoted/current/Git Raw/API | 1,486 | `ef8350df496cdf483fedafccf2f38243a6e480839441fe762d7fad9d1702c6d9` | promoted 10/22 19:43:14 |
| yamakawa-ui current | 104 | `cf17616b486f91836a65523701fbcabf4bbd0cab4f0a3475c8cfdca7502361db` | 10/07 19:43:14 |

候选与 production 散列不同本身不表示失败：My Maps promoter 会正规化字段、保留原 R2/proxy 图片并删除 fingerprint，所以海外以 promoted/current/API 同SHA及实时源语义比对为准。

**自动上线机制是 Git Raw 动态取数，不是每轮重新构建 Pages。** Cloudflare project API 已核实 `name=sakamichi-platform`、`production_branch=sakamichi-platform`、`source=null`，当前部署 `6c174b7f-e517-47b2-a365-38f440c74373`，域名 `46log.com` 与 `sakamichi-platform-test.pages.dev`。这是 Wrangler 直传项目。`functions/api/seichi-data/[map].ts` 固定读取上述分支三份 GeoJSON（5分钟缓存）；`SeichiMap.tsx` 优先此 API，失败才读随 Pages 发布的静态快照。因此成功的 Git 数据 push 会自动进入动态地图，**静态 fallback、地图门户卡片的构建时点数和静态 guide 页面仍需下一次 Pages 部署才更新**。不能把动态已更新等同所有静态页面都已重建。

## 为什么不能直接把 127 当作全新地点

promoter 按 **名称 + 坐标（6 位小数）** 匹配旧点；sourceKey 自身也含名称、图层、坐标。因此源作者挪点或改名，会被记为删除旧点 + 新增点，并非解析器随机换键。

- 最近 cron：4,280→4,379，匹配 4,252，**added 127 / removed 28，净增 99**。
- 00:33:40 实时源：4,280→4,383，匹配仍 4,252，**added 131 / removed 28，净增 103**。
- 匹配的 4,252 中：17 条说明变化、8 条图片数量变化、1 条图层变化（也导致 1 个 sourceKey 变化）；这些计数可重叠。
- 对 28 个旧 unmatched 项：19 个在新增集合中找到同名同图层但不同坐标的候选；8 个找到同坐标不同名称候选；另 1 个 `Palms 22(3)` 通过相同说明对应 `Palms 22(5)`（名称/坐标均变）。这是来源改动的对应证据，不等于独立证明每个新坐标正确。
- 存在一旧点拆成两个作品场景的情况，如ロングウッドステーション、白鵬女子高等学校；不要按名字自动合并这些行。

代表变化：フリーマンカフェ移动约 11.6m；レアールつくの约 160m；旧 NTT 名称在原坐标改为 NTT日比谷ビル。**相模川自転車道線从 `[139.3733889,35.4190491]` 移到 `[139.3775097,35.3814132]`，约 4.2km**，仍写同一「窓ガラスが汚れてる」MV；本审计只证明新坐标来自实时源，地点正确性待独立核对，不能当普通微调自动放行。

实时源的 131 个 unmatched 新行分层：MV/单曲 26、写真集 2、Live/舞台 1、日向ちゃんねる 23、Blog/SNS 33、影视/电视/杂志 46。确有近期内容新增，例如 10/17「しずおかごはんが食べたい」沼津港等点、10/19「キョコロヒー」鮨・大山/シャポー小岩、10/18 森本茉莉公开博客的台場浦公園；这些是源地图记录，不冒充本次逐帧验证。

第一次被挡是 **10/12 07:31 JST：added 27 / changed 5 / removed 17，删除上限 10**；继续抓取后，未发布差异逐轮累积，最终也突破新增上限 50。抓取 state 在 promote 前更新，所以日志的 `added=0` 仅说明相对上次抓取无新增，不能说明与 production 相同。

## 本地修复：保留真实退出码

三份 runner 原 EXIT trap 先展开 `$(dirname ...)`，然后才展开 `"$?"`；dirname 成功令传给 `job_alert.py` 的退出码变成 0。线上 `job-alerts.json` 的三项均为 `failing=false, failures=0`，与清水的 43 次失败不符。没有可用的成功通知回执，不能声称曾发出失败提醒。

trap 先 `seichi_exit_status=$?`，再调用 helper 并传该变量。未改抓取/分类/阈值/通知对象/数据文件。新回归 `scripts/seichi/test_runner_exit_status.py` 提取实际 trap，用 mock python 检查三任务 × 退出码 0/1/7 × helper 退出码 0/9（18 个组合），同时验证任务名称、report/alert 参数、日志路径与原进程退出码；不运行同步、不接触通知 API。修前 12 个失败组合复现错误，修后全部通过。

另加 `job_run_report.py`，三个 runner 在取得锁后开始记录，并在 preflight / git-sync / fetch / review（fumi）/ promote / tests / publish / complete 各阶段更新独立 `reports/{oversea,shimizu-hinata,fumi}-run-latest.json`。字段为 `job, started_at, finished_at, status, stage, exit_code, outcome, production_commit, production_branch`；start/progress 为 running，失败为 failed，成功明确 published 或 unchanged，fumi Jev/lookup 暂不可用为 deferred。报告以同目录临时文件原子替换，不覆盖 crawler/promoter 业务报告；即使 fetch 阶段早失败也不会继续显示旧成功。仅成功且完成 push/无变更验证时记录当前生产分支提交。未取得锁的 skipped run 不覆盖实际运行者的状态。helper 没有通知调用。

oversea 与 shimizu runner 也按 fumi 既有方式包进 `main()`：bash 在执行 git fast-forward 前先解析完整函数，避免更新正在执行的脚本后，从旧文件偏移继续读取新文件。

验证命令：

```sh
python3 -B scripts/seichi/test_runner_exit_status.py
python3 -B scripts/seichi/test_job_run_report.py
python3 -B scripts/seichi/test_job_alert.py
bash -n scripts/seichi/run_oversea_sync.sh scripts/seichi/run_shimizu_hinata_sync.sh scripts/seichi/run_fumi_sync.sh
```

远端原文件已拉回本机 `/Users/yoru/.cache/seichi-sync-audit-20261023/remote-before/`，修改前与 canonical 逐字节相同，没有需要保留的远端适配差异。

| 文件 | 修改前 SHA-256 | 本地修复后 SHA-256 |
|---|---|---|
| run_oversea_sync.sh | `85b08dfd1afd4181ea0391808b6acf34e24940fb45067598b14134d860deed4d` | `7c47ee9fede13932845d98dc66f155b0bd255a6ac1bd9494853caf22006b8765` |
| run_shimizu_hinata_sync.sh | `066334d17cca8cd610f30403f7553e0e86dec7974aa8da1152e08cc6f837fd5e` | `bfcb0d1c7b6d0960654ba7008750ffcad3d77ecb1e59c0c7e5aab5dfee4052b0` |
| run_fumi_sync.sh | `a2e9666ec06fa689920389622b3d23880f66d82c4d6317d446f4c852117bd91a` | `50b11a64ac47c62fb2b8202d647dfdbb3d46d950bceec52905653d465edbc622` |
| job_run_report.py | 新文件 | `36fab7ff46e625a0f6c1993f6de9d27fe90d7b897b34d092d08c6eaea123e661` |

建议部署路径：`srzwyuu@192.168.3.11:/vol1/sakamichi-platform/scripts/seichi/`，SCP 端口 619；同步上述三份 runner **及 job_run_report.py**。发布前需将修复推入 `sakamichi-platform` 分支并按现有 Git 工作区规则同步，避免单纯覆盖留下 tracked dirty，使后续 cron 自我拒绝。需在任务空闲且持有发布锁时同步；本次三份 runner 已都有 main 函数自更新保护。无需重启服务。真实告警效果需后续失败/恢复运行及回执验证，单测不能代替送达证据。

## 数据恢复候选（尚未实施）

保留默认新增 50 / 删除 10 守卫。先固定并备份源 KML、当前 production 与候选快照，保存可审查的 28 个删除对应关系和近期新增清单；独立核对 4.2km 变化及一对多场景，再执行一次明确限定到该快照的补差发布。不要长期提高阈值，也不要让日期更新的后续 KML 自动复用一次性批准。

本次独立 last-run report 已解决失败阶段与时间不明、旧成功状态残留的问题；待发布 added/removed 及逐条对应关系继续属于 promoter 业务报告。数据恢复与阈值逻辑由另外的修复任务处理，不在本审计的 runner 修改中。
