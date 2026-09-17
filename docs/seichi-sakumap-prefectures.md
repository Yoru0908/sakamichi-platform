# SakuMap 补充与都道府县筛选

## 来源与比对

公开来源：https://buddies46.stars.ne.jp/satellite/sakumap/

只读取访客页面使用的 `api.php?action=spots_list`，本次 407 条公开地点；没有登录、访问管理接口、复制访客记录、用户账号数据、图片或网站代码。

对比基线：原平台 production Git `9874244` 中的 8 份 GeoJSON。比较全部地图，使用 Unicode/空格/标点规范化名称和球面距离；**距离近不等于重复、距离远也不证明是新地点**。

结果见 `docs/seichi-sakumap-comparison.json`：
- 84 条同名且位置接近；
- 83 条距已有点≤50m（疑似已有，保留复核）；
- 65 条距已有点≤250m（邻近复核）；
- 22 条同名但坐标差异>200m（坐标冲突，不导入）；
- 153 条其余候选，其中本轮选择 20 个明确公共场所补充。

例如「森の畑」「毛無峠」已有同名地点但坐标不同，不应盲目增加或覆盖原坐标。地址、坐标、成员与节目关系仍以出典为参考，不将公开投稿升级为官方认证。

## 本次新增 20 点（櫻坂综合图）

- 栃木：岩下の新生姜ミュージアム
- 静冈：三島スカイウォーク、掛川花鳥園
- 群马：群馬サファリパーク
- 山梨：金櫻神社
- 埼玉：金笛しょうゆパーク
- 山口：秋吉台自然動物公園サファリランド
- 大分：大分マリーンパレス水族館「うみたまご」
- 新潟：佐渡乳業直売所 みるく・ぽっと、佐渡西三川ゴールドパーク、あしゆ湯足美、月岡ドーナツ、源泉の杜、新潟月岡温泉 白玉の湯 華鳳
- 德岛：大塚国際美術館、大鳴門橋遊歩道 渦の道
- 香川：四国水族館
- 福冈：宗像大社辺津宮、一蘭 一蘭之森 糸島店
- 滋贺：岩魚の里 永源寺グリーンランド

只核对公开场所、现有名称/距离和坐标县归属；**未逐帧独立核验全部节目或视频**。地点说明保留这一限制，`classification.status=source-referenced`，不标为 verified。按用户后续要求，前台不再单列 SakuMap 分类，也不显示这20点的来源标签/链接；public GeoJSON 的 sourceLabel/sourceUrl/referenceUrl 置空、source 对象移除。溯源仅留在维护比对报告中，其他既有地点的来源信息不动。

## 数据部署与同步保护

`public/seichi/sakumap-supplement.geojson` 独立补充层，稳定 ID `sakumap:<id>`。只在 `/seichi/sakurazaka` 加载，与已有动态图合并；按实际内容并入「Vlog・企画」「番組・イベント」「Blog・MSG」，不按采集来源分组。未改写现有 sakurazaka/hinatazaka/oversea managed 数据，不会被 fumi/My Maps 六小时 cron 覆盖。

补充层请求失败只显示提示，仍显示原图。主数据请求失败继续回退原静态快照。只新增前端静态资源，无新 Worker、数据库、cron 或 Homeserver 部署。

这是本次人工挑选的一次性导入，不自动批量采集来源网站。以后重新导入前应重新比对最新主图，避免新增点被其他来源收录后重复。脚本不修改原地图，也不会自动把全部 candidate 发布：

```sh
python3 scripts/seichi/import_sakumap.py \
  --snapshot /path/to/public-spots-snapshot.json \
  --maps-dir public/seichi \
  --report docs/seichi-sakumap-comparison.json \
  --output public/seichi/sakumap-supplement.geojson
```

采集原始缓存仅在本地 `~/.cache/sakumap-review/`，未推送第三方用户字段/原始网页。

## 都道府县筛选

所有 8 张地图共用「都道府県」下拉，按 JIS 顺序显示实际有数据的县与数量。与大分类/企划/成员/搜索取交集，分类计数跟随县范围；切县不删除已保存路线。手机点「リスト」后可筛选，返回地图自动定位县内地点范围。

- 优先 point-in-polygon 地理归属；支持 MultiPolygon、岛屿和洞，预计算 polygon bounds 后批量判定。
- 无边界命中时回退明确 `prefecture` 或 `address`/`住所:` 信息；不拿店名、成员出身地、最近县中心猜测。
- 境外/无法判定统一保留「未判定・海外」；简化海岸线、县界附近、填海地和离岛仅供参考。
- 本轮原数据判定覆盖：日向坂 3458/4047（46县）、櫻坂 1344/1439（38县）、山川99/99、東京十社210/210；20补充点全部坐标与所标12县一致。未判定不等于错误，包含国外地点。
- 边界加载失败降级地址判定，不阻断地图。

地理文件是 geoBoundaries JPN ADM1（47县，2017年地理表示、2023构建、简化版），源 OSM/Wambacher、ODbL1.0；原文件单独原样发布于 `public/seichi/boundaries/`，出处/许可/固定源哈希见该目录 README.txt，界面提供来源链接。不复制 SakuMap 的县分类代码。

## 原站 + 独立站

原站与 `/Users/yoru/Documents/SA/项目/sakamichi-seichi/` 独立站同步组件、prefectures helper、综合图/门户页面、补充层与边界。独立站额外刷新三份已有静态快照，仍复用原动态 GitHub 数据源。两者保留各自布局和图片代理，没把平台登录依赖带入独立站。

## 验证

```sh
node --test src/components/seichi/prefectures.test.mjs
npm run build
node scripts/test-seichi-prefectures.mjs
# 独立站对应 scripts/test-prefectures.mjs，支持 BASE_URL=https://部署域名
```

纯函数：47县、6个城市基准点、境外点、Tokyo府中≠京都、洞/离岛、20补充点来源/无照片复制/县归属验证。
浏览器：补充20点、县/关键词/分类交集、归零与清除恢复、路线保留、390px手机版；动态失败静态回退，补充/边界失败不影响原图；无 runtime error。
