# 46log 地图底图选择 — 2026-10-23

本轮保留现有 Leaflet 底图和 Google Maps 导航，完成主动定位与附近地点。推荐后续在 Leaflet 内增加日本国土地理院淡色图选项；没有把所有地图换成 Google，也没有新增 Google API 计费项目。

## 为什么

- 浏览器定位、距离计算、附近筛选与底图供应商独立。已实现的 `nearby.ts` 是纯坐标计算，`SeichiMap.tsx` 只在用户主动点击后请求定位，位置不落库。
- Leaflet 是交互库；OpenStreetMap、国土地理院是底图/数据来源，不能把三个名字当作三个同类产品。现有分类、成员、作品时间轴、路线、来源说明可以继续复用。
- 国土地理院淡色图适合日本地点阅读。官方详细图覆盖日本及周边、缩放 5–18；海外仍需要现有全球底图。实时瓦片需显示国土地理院署名并链接瓦片目录。不是所有瓦片使用条件都相同。
- Google Maps 的地点搜索、交通、营业信息适合外部导航。完整替换网站交互地图需要 Google Maps Platform 的 API、计费与现有交互重构；仅为了「看看我附近有什么」没有必要承担这些改动。Maps、Routes、Places 分别按 SKU 计费，不能把 My Maps 的分享嵌入等同于完整平台 API。

## 用户提供的来源

`https://hinatamap.pages.dev/source-map` 的嵌入指向 My Maps `14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ`，与用户另贴的 My Maps 链接相同。因此它们是同一份作者地点源，不计作两个独立证据。作者修改不等同于我们独立核实拍摄坐标；抓取、来源变更审核和网站底图也分别处理。

## 可复用边界

```text
作者 KML / 官方地点证据 → 质量门与审核 → GeoJSON
                                           ↓
浏览器位置 → nearby.ts 距离/半径 → 地图与列表筛选
                                           ↓
                       Leaflet 画点 / 底图可替换 / Google 导航
```

后续添加国土地理院时应保留全球底图、明确署名、限制支持的缩放级别，并在日本/海外、浅色/深色、瓦片失败时验证。GeoJSON、来源、地点 ID 和路线存储不因底图更换而重写。

官方参考（2026-10-23 查看）：

- [国土地理院瓦片目录与实时引用规则](https://maps.gsi.go.jp/development/ichiran.html)
- [Google Maps Platform 官方价格与 SKU](https://developers.google.com/maps/billing-and-pricing/pricing)

同步修复证据见 `SEICHI_SYNC_AUDIT_20261023.md` 与 `SEICHI_HINATA_REVIEW_20261023.md`。
