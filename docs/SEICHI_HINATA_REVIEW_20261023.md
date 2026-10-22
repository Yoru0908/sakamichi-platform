# 日向坂 My Maps 待审变更复核（2026-10-23）

本文件是只读核查与处置建议，未修改代码、源地图、候选或生产数据。基线4280点，公开来源最新4383点；安全增量完成后候选4380点，仍有22个旧点/25个候选修改端隔离。**作者图源的身份关联已复核，不等于所有摄影机位独立验证。**

## 证据边界

- [作者公开地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)；[公开KML](https://www.google.com/maps/d/kml?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ&forcekml=1)。作者身份入口来自 https://hinatamap.pages.dev/source-map 。这是第三方作者地图，不是日向坂官方位置数据库。
- 固定本地证据：`/Users/yoru/.cache/seichi-sync-audit-20261023/hinata-current.geojson`、`hinata-live.geojson`、`hinata-live-report-1.json`、`raw/shimizu-hinata-main.kml`。
- KML SHA256：`2f8f73831d6c45bb9ac5c954f7c98c3b2c9798c7b6e73a3ed3d1204ee8e6061c`。4383点+6非点，Placemark无稳定id。
- 经纬度顺序为 **longitude, latitude**。距离为haversine地表近似距离；小距离本身不证明新点更准确。
- 下列“作者源小移点”允许选择按原作者更新同步，但发布依据必须标source/作者地图，不能改成独立reviewed定位。没有任何一条被本审计认定为已独立证实的精确地址坐标修正。

## 结论与发布边界

- 2条可按原位置接受文字/名称编辑：NTT、サンリオ。
- 2条可按作品拆成2条：ロングウッド、白鵬。须一次替换旧的合并记录，不能只追加新端导致三个重复条目；原公开id保留给旧主要作品，第二作品用其源key。
- 17条其他旧记录可建议采用作者源细化/微移，不能称独立定位已验证；其中Palms编号变更仍是同一场景。所有更新须按下方精确old→new sourceKey映射一对一替换，保留公开id与兼容图片，不按同名泛化合并。
- 相模川1条继续hold：新端禁入、旧端保留；当前无法判断哪一端对应MV机位。
- 另1条三崎漁港是新增场景候选，见末节，不能拿它替换三崎公園/三上写真館/丸山。
- 若全部接受上述来源级建议并新增三崎漁港：4380 - 21旧 + 23替换新 + 1新增 = **4383**；仍保留相模川旧坐标，故“总数等于源”绝不代表每点已与源一致或全部独立验证。此计算是候选方案，非已执行结果。

## 22个旧点逐项复核

### 01. ロングウッドステーション — シングル・アルバム（ロケ地）

建议：**作者源拆分，可按两作品原子替换**。旧描述同时含キツネ和世界にはThank you！；新作者记录各保留一曲且各带其MV链接。两条是不同作品场景，非重复地点。没有独立核对两个摄影机位。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:810e2ddedc4edac8a1a0`；坐标 `140.205354, 35.4717031`。

新：**ロングウッドステーション**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:c669f1cb1b280e78f10e`；坐标 `140.205246, 35.471649`；位移约 **11.5 m**。

新：**ロングウッドステーション**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:e013347877fceeea0f79`；坐标 `140.2059669, 35.4722877`；位移约 **85.5 m**。

旧场景：2nd キツネ 5th 世界にはThank you！が溢れている https://www.youtube.com/watch?v=13yytDs4TeQ 題名: 2ndシングル

新场景：2nd キツネ https://www.youtube.com/watch?v=13yytDs4TeQ 題名: 2ndシングル

新场景：5th 世界にはThank you！が溢れている https://youtu.be/Tl51xNHeP4g 題名: 5th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[场地经营方撮影设施介绍](https://loca-station.jp/loca/263)列有旋转木马等设施；不证明新点位。

防重复：旧1条与新2条必须同批处理；不能保留合并旧场景后再追加两条。

### 02. 白鵬女子高等学校 — シングル・アルバム（ロケ地）

建议：**作者源拆分，可按两作品原子替换**。旧描述同时含一番好きだとみんなに言っていた小説のタイトルを思い出せない、声の足跡；新作者各分一条。不能与同MV的レアールつくの合并。校方首页确认学校，但未找到校方对这两个精确机位的证明。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:1bf24905d24990a7fca2`；坐标 `139.6577975, 35.5158118`。

新：**白鵬女子高等学校**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:b940b6b7aa4a6deb21ef`；坐标 `139.6583152, 35.5160956`；位移约 **56.5 m**。

新：**白鵬女子高等学校**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:5d65f1f3d271e9bbd239`；坐标 `139.6586771, 35.5159017`；位移约 **80.2 m**。

旧场景：2nd 一番好きだとみんなに言っていた小説のタイトルを思い出せない https://www.youtube.com/watch?v=kAK9dQtzBno 5th 声の足跡 題名: 2ndシングル

新场景：2nd 一番好きだとみんなに言っていた小説のタイトルを思い出せない https://www.youtube.com/watch?v=kAK9dQtzBno 題名: 2ndシングル

新场景：5th 声の足跡 https://youtu.be/YClzk5GpaHM 題名: 5th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[白鵬女子官网](https://www.hakuhojoshi-h.ed.jp/)；仅学校身份。

防重复：旧1条与新2条必须同批处理；不能保留合并旧场景后再追加两条。

### 03. レアールつくの — シングル・アルバム（ロケ地）

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:fbcdd0c2a24f4036419e`；坐标 `139.6740121, 35.513838`。

新：**レアールつくの**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:08961d255460f873c120`；坐标 `139.6727374, 35.5148325`；位移约 **159.8 m**。

旧场景：2nd 一番好きだとみんなに言っていた小説のタイトルを思い出せない https://www.youtube.com/watch?v=kAK9dQtzBno 題名: 2ndシングル

新场景：2nd 一番好きだとみんなに言っていた小説のタイトルを思い出せない https://www.youtube.com/watch?v=kAK9dQtzBno 題名: 2ndシングル

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 04. NTT東日本 霞ヶ関電話交換所（霞ヶ関ビル本館） — シングル・アルバム（ロケ地）

建议：**允许名称/说明更新；不移坐标**。同坐标、同MV链接；作者把旧建筑名改NTT日比谷ビル并补已拆除。NTT官方2025-12-08开发新闻提及原NTT日比谷ビル历史，支持历史建筑名称/已由开发替代，不独立证明MV及点坐标。源将青春の馬标3rd仍原样保留，不能据此宣称发行归属已核实。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:41388250b45918971127`；坐标 `139.7573879, 35.6713378`。

新：**NTT日比谷ビル**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:203aec7af92077e46a93`；坐标 `139.7573879, 35.6713378`；位移约 **0.0 m**。

旧场景：3rd 青春の馬 https://www.youtube.com/watch?v=hZQzmzXjJB0 題名: 3rd

新场景：3rd 青春の馬 すでに解体 https://www.youtube.com/watch?v=hZQzmzXjJB0 題名: 3rd

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[NTT都市开发原场地重建公告](https://nttud.co.jp/news/detail/id/n27935.html)。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 05. フリーマンカフェ — シングル・アルバム（ロケ地）

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:f3ccd6e52c55b4bf6b27`；坐标 `139.702355, 35.661512`。

新：**フリーマンカフェ**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:f7651bac10ff0f1b7cc1`；坐标 `139.7024697, 35.6615583`；位移约 **11.6 m**。

旧场景：4th ソンナコトナイヨ 金村美玖 https://www.youtube.com/watch?v=7njC5lgL61c 題名: 4th

新场景：4th ソンナコトナイヨ 金村美玖 https://www.youtube.com/watch?v=7njC5lgL61c 題名: 4th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 06. 幕張メッセ 国際展示場 9-11ホール — シングル・アルバム（ロケ地）

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:a21f3de8456608faca52`；坐标 `140.0364218, 35.6499047`。

新：**幕張メッセ 国際展示場 9-11ホール**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:ebd7f4b07ec12a2d04fb`；坐标 `140.0364781, 35.6498742`；位移约 **6.1 m**。

旧场景：5th 君しか勝たん https://www.youtube.com/watch?v=Z59HsgPVbWY 題名: 5th

新场景：5th 君しか勝たん https://www.youtube.com/watch?v=Z59HsgPVbWY 題名: 5th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[幕张官方9–11馆介绍](https://www.m-messe.co.jp/organizers/guide/exhibitionhall/guide_exibition9-11)确认设施；不证明MV机位。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 07. 刑部岬 — シングル・アルバム（ロケ地）

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:a8f0811d09892c224677`；坐标 `140.7391291, 35.6923639`。

新：**刑部岬**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:2c82bf37767d1dd3c165`；坐标 `140.7380562, 35.6921243`；位移约 **100.5 m**。

旧场景：6th 何度でも何度でも https://www.youtube.com/watch?v=iKa0B66oQAQ 題名: 6th

新场景：6th 何度でも何度でも https://www.youtube.com/watch?v=iKa0B66oQAQ 題名: 6th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 08. 三崎公園(三浦市) — シングル・アルバム（ロケ地）

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:34204674df56337e487a`；坐标 `139.6179341, 35.1413962`。

新：**三崎公園(三浦市)**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:366ef590f5535dc424ab`；坐标 `139.6181245, 35.1413633`；位移约 **17.7 m**。

旧场景：6th 酸っぱい自己嫌悪 https://www.youtube.com/watch?v=eDupOQ6Dc9g 題名: 6th

新场景：6th 酸っぱい自己嫌悪 https://www.youtube.com/watch?v=eDupOQ6Dc9g 題名: 6th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 09. 三上写真館 — シングル・アルバム（ロケ地）

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:fc6e3913272b6d8c637c`；坐标 `139.618423, 35.141707`。

新：**三上写真館**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:e91bba00f43016d566b5`；坐标 `139.6185162, 35.1417662`；位移约 **10.7 m**。

旧场景：6th 酸っぱい自己嫌悪 https://www.youtube.com/watch?v=eDupOQ6Dc9g 題名: 6th

新场景：6th 酸っぱい自己嫌悪 https://www.youtube.com/watch?v=eDupOQ6Dc9g 題名: 6th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 10. 丸山クリーニング店 — シングル・アルバム（ロケ地）

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:7e864184d50dfcfa3799`；坐标 `139.6166692, 35.1415956`。

新：**丸山クリーニング店**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:747a17584a1c6913e119`；坐标 `139.6166994, 35.1416502`；位移约 **6.7 m**。

旧场景：6th 酸っぱい自己嫌悪 https://www.youtube.com/watch?v=eDupOQ6Dc9g 題名: 6th

新场景：6th 酸っぱい自己嫌悪 https://www.youtube.com/watch?v=eDupOQ6Dc9g 題名: 6th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 11. 茨城県立カシマサッカースタジアム — シングル・アルバム（ロケ地）

建议：**作者源小移点；说明删减须显式保留记录**。同友よ一番星だ作品，删去松尾桜另一个视频关联。新源没有说明该关联错误，不能把删减等同事实否定；接受源同步时保留旧说明在审计，必要时另建场景，禁止无证恢复在新源字段里。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:2359ef26abcc3b10b049`；坐标 `140.6403396, 35.9919605`。

新：**茨城県立カシマサッカースタジアム**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:9d0eb86ec67541d5ed93`；坐标 `140.640522, 35.9919909`；位移约 **16.8 m**。

旧场景：9th 友よ一番星だ https://www.youtube.com/watch?v=uV_Caa5Z_Bs 松尾桜が鹿島アントラーズ公式YOUTUBEでも登場 https://www.youtube.com/watch?v=y0mPEh_tLT0 題名: 9th

新场景：9th 友よ一番星だ https://www.youtube.com/watch?v=uV_Caa5Z_Bs 題名: 9th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 12. 相模川自転車道線 — シングル・アルバム（ロケ地）

建议：**继续保留旧点；不得上线新端**。位移约4.2km；同道路名和同MV只证明作者更新，不能确认同一拍摄段。官方材料说明该自行车道全长约21km，因此道路名尤其不能用作精确定位证据。需MV画面/桥梁/道路标记对应证据或作者公开解释。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:92450f76c78f3d11dd51`；坐标 `139.3733889, 35.4190491`。

新：**相模川自転車道線**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:0e4fb208b63c41faea85`；坐标 `139.3775097, 35.3814132`；位移约 **4201.6 m**。

旧场景：10th 窓ガラスが汚れてる https://www.youtube.com/watch?v=wS5GxB_JGag 題名: 10th

新场景：10th 窓ガラスが汚れてる https://www.youtube.com/watch?v=wS5GxB_JGag 題名: 10th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[神奈川县道路位置图](https://www.pref.kanagawa.jp/documents/10757/sagamijitensha.pdf)、[海老名市官方规划PDF](https://www.city.ebina.kanagawa.jp/_res/projects/default_project/_page_/001/017/977/honnpenn.pdf)。

防重复：旧点保留；新点保持隔离，不作为新增发布。

### 13. （財）日本自動車研究所城里テストセンター — シングル・アルバム（ロケ地）

建议：**作者源场内细化，可按11th作品对应替换**。作者追加低μ路，须对应旧11th僕に続け，不是13th另一条。JARI官方目录确有低μ路；设施名称可独立确认，MV与本次经纬度未独立核实。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:998bd156326475ce8683`；坐标 `140.3213465, 36.4777969`。

新：**（財）日本自動車研究所城里テストセンター**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:2a4b5585a63b78723a21`；坐标 `140.3205096, 36.4773828`；位移约 **87.9 m**。

旧场景：11thシングル 僕に続け https://www.youtube.com/watch?v=-Uz4KJb2ies 題名: 11th

新场景：11thシングル 僕に続け 低μ路 https://www.youtube.com/watch?v=-Uz4KJb2ies 題名: 11th

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[JARI官方城里设施目录](https://www.jari.or.jp/test-courses/stc/)。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 14. ハンマーヘッドデッキ — シングル・アルバム（ロケ地）

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:b9cf0f70a0a2e4e3e25a`；坐标 `139.6423751, 35.4568125`。

新：**ハンマーヘッドデッキ**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:e38eed6e5879ed803f02`；坐标 `139.6419996, 35.4570485`；位移约 **43.0 m**。

旧场景：12thシングルで富田鈴carが爆走してた場所 https://youtu.be/qUZagu-NL_s?si=15Y2WiJQnQsONaJK&t=29 題名: 12thシングル

新场景：12thシングルで富田鈴carが爆走してた場所 https://youtu.be/qUZagu-NL_s?si=15Y2WiJQnQsONaJK&t=29 題名: 12thシングル

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[横滨官方设施介绍](https://www.hammerhead.co.jp/facility/)确认园区设施，不证明富田鈴car拍摄机位。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 15. （財）日本自動車研究所城里テストセンター — シングル・アルバム（ロケ地）

建议：**作者源场内细化，可按13th作品对应替换**。作者追加NV・多用途試験路，须对应旧卒業写真だけが知ってる，不是11th另一条。JARI官方目录确有此设施；MV与本次经纬度未独立核实。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:cac67011ba99f21ce665`；坐标 `140.3257667, 36.4738975`。

新：**（財）日本自動車研究所城里テストセンター**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:60bd96faa38865aeaad2`；坐标 `140.3263031, 36.4744151`；位移约 **74.9 m**。

旧场景：卒業写真だけが知ってるの撮影地 https://youtu.be/I1qSilZNvFs?si=wDBmPXFekq6SyuPQ 題名: 13thシングル

新场景：卒業写真だけが知ってるの撮影地 NV・多用途試験路 https://youtu.be/I1qSilZNvFs?si=wDBmPXFekq6SyuPQ 題名: 13thシングル

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[JARI官方城里设施目录](https://www.jari.or.jp/test-courses/stc/)。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 16. Palms 22(3) — シングル・アルバム（ロケ地）

建议：**作者源编号+微移，可一对一替换**。Palms22(3)→(5)，场景说明和两个博客URL完全相同，微移约2m。编号不是场景身份，不应作为新地点追加。未独立图像定位。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:95a0a746254403dd1fc4`；坐标 `139.869957, 35.2214054`。

新：**Palms 22(5)**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:59391f45c8c0163bfe4f`；坐标 `139.8699593, 35.2214218`；位移约 **1.8 m**。

旧场景：17thシングル Kind of loveのジャケット写真タイプBの撮影地 タイプDのメンバーもここが待機場所だった模様 https://www.hinatazaka46.com/s/official/diary/detail/68955 https://www.hinatazaka46.com/s/official/diary/detail/68965 題名: 17thシングル

新场景：17thシングル Kind of loveのジャケット写真タイプBの撮影地 タイプDのメンバーもここが待機場所だった模様 https://www.hinatazaka46.com/s/official/diary/detail/68955 https://www.hinatazaka46.com/s/official/diary/detail/68965 題名: 17thシングル

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 17. 東京国立博物館 — 写真集関連

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:fbcbc7d5213e3d2903ce`；坐标 `139.7765215, 35.7188351`。

新：**東京国立博物館**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:4ec0174fb0e76ff6ba1f`；坐标 `139.7763659, 35.7189091`；位移约 **16.3 m**。

旧场景：影山優佳写真集 https://twitter.com/kageyama_JAPAN/status/1643544005643489280

新场景：影山優佳写真集 https://twitter.com/kageyama_JAPAN/status/1643544005643489280

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[东京国立博物馆官方访问页](https://www.tnm.jp/modules/r_free_page/index.php?id=113-0)仅设施定位，不证明写真集机位。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 18. 幕張メッセ 国際展示場 9-11ホール — ライブ会場・舞台

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:ca9c78b047bf6ced6d71`；坐标 `140.0364218, 35.6499047`。

新：**幕張メッセ 国際展示場 9-11ホール**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:efd940160f23ef984a1e`；坐标 `140.0363521, 35.6499614`；位移约 **8.9 m**。

旧场景：（空；只能按场馆图层识别，不能推断具体演出）

新场景：（空）

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。[幕张官方9–11馆介绍](https://www.m-messe.co.jp/organizers/guide/exhibitionhall/guide_exibition9-11)确认设施，不证明数米偏移精度。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 19. 近江町市場 — メンバーブログ・SNS・その他

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:82f5d9cb5c884105346d`；坐标 `136.6558651, 36.5717335`。

新：**近江町市場**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:120f83bc07cd0f53a3d1`；坐标 `136.6558678, 36.5717098`；位移约 **2.6 m**。

旧场景：渡邉美穂のブログ「歩くの大好き、走るのはもっと好き。」2019年12月30日より https://www.hinatazaka46.com/s/official/diary/detail/32083 題名:

新场景：渡邉美穂のブログ「歩くの大好き、走るのはもっと好き。」2019年12月30日より https://www.hinatazaka46.com/s/official/diary/detail/32083 題名:

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 20. サンリオピューロランド — メンバーブログ・SNS・その他

建议：**允许编号/称谓编辑；不移坐标**。同坐标，2022-07-29同一次游园；旧昵称ミホ・ワタナベ/こさかな改为渡邉美穂/小坂菜緒，名称加(1)。这是源文本编辑，不是新场景；没有据此重新证明历史访问。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:f8b03c5f8053663ea8da`；坐标 `139.429293, 35.624512`。

新：**サンリオピューロランド(1)**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:f539e23fa0331886c669`；坐标 `139.429293, 35.624512`；位移约 **0.0 m**。

旧场景：ミホ・ワタナベとこさかなが遊びに行った場所。(2022.7.29のミホの当時のブログより) 題名:

新场景：渡邉美穂と小坂菜緒が遊びに行ったテーマパーク。(2022.07.29の渡邉美穂の当時のブログより) 題名:

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 21. Palms 22(2) — メンバーブログ・SNS・その他

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:8420dfc8351d4a0cf0a3`；坐标 `139.8699573, 35.2214274`。

新：**Palms 22(2)**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:37df932c9644c1148ddc`；坐标 `139.8699757, 35.2214551`；位移约 **3.5 m**。

旧场景：2023.7.31創刊グラビアチャンピオン創刊号で表紙を飾った齊藤京子ソログラビアの撮影場所。Right?のPV撮影やKind of Loveのジャケット撮影でも使用された。https://www.instagram.com/p/CvWIIRDPKWO/?img_index=2 題名:

新场景：2023.7.31創刊グラビアチャンピオン創刊号で表紙を飾った齊藤京子ソログラビアの撮影場所。Right?のPV撮影やKind of Loveのジャケット撮影でも使用された。https://www.instagram.com/p/CvWIIRDPKWO/?img_index=2 題名:

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

### 22. 近江町市場 — 映画・ドラマ・TV番組・雑誌・新聞

建议：**作者源小移点，可按同场景一对一替换**。名称、图层及场景描述相同；新经纬度由作者公开KML提供。没有独立画面对照或精确测绘证据，不能声称本次定位比旧点更准确。

旧：`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:0db4fd86729cd93b49d6`；坐标 `136.6558866, 36.5717077`。

新：**近江町市場**；`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:b064cdf91b67a35d6006`；坐标 `136.6559537, 36.5716926`；位移约 **6.2 m**。

旧场景：河田陽菜が一人旅行に行った場所 https://youtu.be/x-O68uCtvrA?t=211

新场景：河田陽菜が一人旅行に行った場所 https://youtu.be/x-O68uCtvrA?t=211

证据：[本次作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)。本次未取得独立场地证据；以上仅比对作者源与已发布快照。

防重复：只替换本条列明的sourceKey；相同地点的其他作品/图层保持独立。

## 额外候选：三崎漁港(本港)

`mymaps:14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ:9a28a5a8ab58dad7e37e`，坐标 `139.617801, 35.1406409`；场景为「酸っぱい自己嫌悪」，与三崎公園、三上写真館、丸山クリーニング店共用同一MV描述。原始报告因为描述相同把它连接到3个旧点；这只是保守隔离关系，**不是三个地点同一身份的证据**。

作者新源同时保留了上述3个不同名称的新坐标条目，并另外列出三崎漁港。因此建议可作为作者补充的新场景单独接受，不能替换任何旧记录；也未独立验证拍摄机位。来源：[作者地图](https://www.google.com/maps/d/viewer?mid=14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ)；源关联MV：https://www.youtube.com/watch?v=eDupOQ6Dc9g （本轮未逐帧核验）。

## 执行建议与未解决项

本文件不自动授权脚本忽略守卫。后续若采纳来源级同步，应将每一项显式记录为old sourceKey→new sourceKey（拆分为1→2），并验证所有旧端只消费一次、所有新端只消费一次。新场景在无替代关系的情况下才算新增，不能只增加全局阈值。相模川继续隔离；所有方案仍应保留原始快照和本报告以便回滚。

证据分层：公开KML可以证实“作者目前如此记录”；场地方官网可以证实“场地/子设施存在”；MV或照片画面与地标对应才可以支持“精确拍摄点”。本次仅对前两层取得部分证据，未对22项完成逐帧定位。

## 固定快照审查应用（本地已验证，尚未生产应用）

Root已接受上文21个旧端的来源级更新及三崎漁港新增，明确相模川继续hold。审批固化在 `scripts/seichi/hinata_review_20261023.json`，不能作为未来源变更的通用放行规则。

- `candidateFileSha256` 锁定原始GeoJSON字节；`candidateSnapshotFingerprint` 锁定规范化完整内容；每个源feature、旧feature、预期输出feature也有独立SHA256指纹。
- 每个old/new端只能消费一次；部分应用、新端已存在、旧端变化、源快照变化、重复公开id或sourceKey均拒绝。支持当前生产多出无关新增，但该源快照本身必须固定。
- 1→1与拆分首个作品继承旧公开id；拆分第二个作品使用其真实sourceKey作公开id。映射写入review report。未标独立verified；normalise后的classification维持source。
- 普通promoter的3500最小点数、90%连续性、来源身份、图片、坐标校验仍执行。没有增大全局guard阈值。
- 全部输出原子写入指定新文件，禁止覆盖输入；脚本不负责Git、上传、部署、通知。相模川旧feature逐字段一致；下一次普通promoter输出结构完全一致，仅剩1点hold。
- 本地完整输入4380→4383，二次应用返回`already-applied`；7项专用测试通过，覆盖拆分、id映射、hold、指纹拒绝、部分应用拒绝、重复id与无关后续新增保留。

本地候选：`/Users/yoru/.cache/seichi-sync-audit-20261023/hinata-reviewed-4383.geojson`；报告：同目录`hinata-reviewed-report.json`。以下命令只产生独立输出，正式发布须由root沿现有发布锁流程执行：

```bash
python3 scripts/seichi/apply_hinata_review.py \
  --current public/seichi/hinatazaka-all.geojson \
  --candidate /vol1/seichi-sync/reviews/20261023/hinata-live.geojson \
  --manifest scripts/seichi/hinata_review_20261023.json \
  --output /vol1/seichi-sync/reviews/20261023/hinata-reviewed.geojson \
  --report /vol1/seichi-sync/reviews/20261023/hinata-reviewed-report.json
python3 scripts/seichi/test_apply_hinata_review.py
```

远端`--candidate`须为本次本地已固定的`hinata-live.geojson`原样复制；不可临时重新抓取后假定旧审批仍有效。审批应用后的常规抓取继续从原作者实时源运行，新变更重新走普通守卫。
