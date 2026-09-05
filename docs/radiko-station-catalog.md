# 日本电台目录扩充（2026-09-05 已部署）

旧版 v4.1 和广播后端的 `config.json.station_mapping` 都有 36 台，
但直播接口仅开放 14 台。本次配套后端扩至 36 台，前端只更新分组逻辑。

## 前端约束

- 目录及可选台由 `/api/radio/live/stations` 决定，不硬编码一份客户端电台名单。
- `radiko-stations.ts` 按関東、山梨、甲信越、関西、東海、北海道、九州、全国、NHK
  展示，之后若后端增加新地区则追加显示，不静默丢弃。
- 不改变选台 POST、API 域名、HLS URL 拼接、Hls.js 配置、心跳或播放器。
- 兼容尚未升级的 14 台接口；本次不改广播其他分区。

```bash
node --test src/components/radio/radiko-stations.test.mjs
npm run build
```

分组 4 项测试通过；隔离 worktree 构建通过。浏览器以配套目录 fixture 验证
1280px 和 390px：36 台均显示一次、9 个分组、无横向溢出，NACK5/FM802/ZIP-FM/
RKB/NIKKEI 第1/NHK-FM 仍请求原来的 `/api/radio/live/tune/{id}`（POST）。
此浏览器测试不是生产真实串流验证。

## 状态

前端 `716ee9e` 与广播后端 `26445fa` 已配套部署。
部署地址：`https://69334406.sakamichi-platform-test.pages.dev`；生产：`https://46log.com/radio/`。

真实线上浏览器确认 36 台、9 个分组；NACK5、RKB、NIKKEI 第1 经现有接口/HLS
实际播放，播放时间持续前进，测试流已关闭。并非已逐台验收全部 36 台。

Homeserver Tailscale 节点密钥已过期，本次经 M1 Air `100.76.114.34` 跳转到
Homeserver LAN 完成部署，没有修改 VPN 登录配置；节点直连仍需重新授权。
后端变更、日志/缓存迁至 `/vol1/` 的记录及部署注意事项见
[广播后端说明](../../坂道广播platform/docs/live-station-catalog.md)。
