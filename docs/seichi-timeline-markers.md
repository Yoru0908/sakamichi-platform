# 地图语义图标与作品时间轴

## 使用

全部8张地图共用新版标记：MV/乐曲（场记板）、Vlog（摄像机）、番组（电视）、杂志/写真集（书）、博客/SNS（对话框）、个人PV/签名（人像）、演唱会/舞台（票券）、其他地点（定位针）。白底浅色圆角徽标，不再只以彩色圆点区分；地图左上「アイコンの見方」可展开图例，悬停显示类型与地点名称。

选中点用双框；路线点为深色字母编号，角标保留内容类型；已到访为勾号，当前目的地有外框。路线顺序、Google Maps 导航、已有 localStorage 键均不改变。图标只采用内部常量SVG/颜色，地点名通过DOM文本插入tooltip，不拼接进HTML。

列表顶部「地点の並び順」：通常列表 / 新到旧时间轴 / 旧到新时间轴。日期与作品形成分组标题，未确认日期始终放末尾，返回通常列表恢复原始顺序。

「MV・楽曲」按钮切至乐曲范围与新到旧顺序，支持按单首作品筛选、自动缩放至对应拍摄地点；继续与都道府县、成员、关键词条件取交集。包括MV/乐曲与唱片封面，**不是只收录MV视频**。这不是宣称全网最新MV均已收录，只展示我们已有地标中可确认的作品。

进入时间轴会收起成员/作品筛选面板，可手动重新展开。地图与底图选择器并排，390px手机能直接看到时间轴地点，避免控制区挤掉结果列表。

## 日期定义：不要误报MV公开日期

现有GeoJSON基本没有可靠的MV首播/上传时间，因此本轮使用 **CD发行日**，界面明确标记「CD発売日」，并解释它不是MV公开日、拍摄日或抓取时间。

- `src/components/seichi/release-catalog.json`：从Sony Music公开官方唱片目录217个CD版本中提取347条乐曲名称/发行日事实，按同艺人最早目录日期去重。保留官方记录URL便于维护核对，不复制封面、音频、评论或整页。
- Sony API：`https://www.sonymusic.co.jp/json/v2/artist/{sakurazaka46,hinatazaka46,keyakizaka46}/discography/...`，为官方唱片页面公开加载的数据。
- 8首已核对的平假名欅时代歌曲跨欅坂/日向坂再收录，保留原单曲日期，避免把2018年专辑再发行误当新作品。
- 先匹配明确作品子分类，再匹配企划标题中的引号作品名；位置名称本身不当成歌曲（例如「渋谷川」）。说明中出现多首不同日期作品时不强行取最新。
- 非乐曲条目只认企划标题中明确完整年月日，标「企画タイトルの日付」。不从采集时间、URL数字、地址、正文历史、只有年份或月日推断。
- 无可信对应关系保持「日付未確認」，排序不会删掉这些地点。

样例：`We got your back` 为 `2026-06-10` CD发行日；`二人セゾン` 为 `2016-11-30`。
本轮原快照可判日期：櫻坂763/1439、欅坂113/1300、日向51/4049；覆盖不完整是保守匹配结果，不以猜测补齐。

## 更新与部署

没有改写自动同步的GeoJSON、后台Worker、数据库或六小时采集cron。日期目录是本地构建快照，尚未自动定时刷新；遇到未收录的新曲，地标仍正常出现但日期保持未确认。维护时在本机显式重新生成后测试并双站部署：

```sh
python3 scripts/seichi/build_release_catalog.py \
  --cache-dir /Users/yoru/.cache/seichi-timeline/sony-new-snapshot \
  --output src/components/seichi/release-catalog.json
```

脚本每次最多3并发、请求限时、分页上限、缓存400文件/50MB；缓存命中不重新下载，刷新需另给新缓存目录。不运行于Homeserver，不增加守护任务。原始第三方响应仅在本机缓存，不提交Git。

平台与独立站同步 `SeichiMap.tsx`、`marker-style.ts`、`seichi-markers.css`、`timeline.ts`、`release-catalog.json`。平台脚本 `scripts/test-seichi-timeline.mjs`，独立站为 `scripts/test-timeline.mjs`；UI函数库不依赖平台账户模块。

## 验证

- `node --test src/components/seichi/timeline.test.mjs`：8图形、注入边界、官方日期、旧作再收录、模糊日期/多个作品、未知末尾、真实GeoJSON覆盖且不修改数据。
- 独立站 `npm run typecheck`；双站 `npm run build`。
- 构建后浏览器测试：图例、6种以上真实标记、正反时间排序/恢复原序、MV捷径、单曲+县交集、日期分组、路线保存与选中图标、手机可见列表、无runtime error。
- 支持 `BASE_URL=https://部署域名 node scripts/test-seichi-timeline.mjs` 生产验收。测试账户/路线仅使用浏览器临时上下文。
- 继续跑既有 prefectures 与独立站8地图/数据代理/导航 smoke，避免样式变更破坏旧功能。
