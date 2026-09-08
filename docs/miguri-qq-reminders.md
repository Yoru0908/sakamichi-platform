# Miguri 抽选 QQ 提醒

最后验证：2026-09-08 21:25（Asia/Shanghai）。

## 运行链路

- Homeserver 用户 cron：`0 11 * * * /home/srzwyuu/miguri-sync/run.sh`，北京时间 11:00 / JST 12:00。
- 脚本携带本机 `.sync-secret` 调用 `POST https://api.46log.com/api/manage/miguri/sync-from-source`。
- Worker **sakamichi-miguri**（不是已拆分前的 sakamichi-auth）同步 Fortune Music。
- `notifyNewWindows`：发现新受付时通知；`notifyTodayWindows`：受付开始当天通知。
- 中继：`https://blog-push.46log.com/webhook/miguri-alert` → NapCat → QQ 群 **768670254**。
- 该路由沿用三团共用提醒，包含櫻坂；不是仅櫻坂筛选，也不是截止提醒或实时监控。

## 配置

Worker secrets：

- `MIGURI_ALERT_WEBHOOK_URL`：上述中继 URL。
- `MIGURI_ALERT_WEBHOOK_SECRET`：与 Homeserver `blog-push-service` 的实际 `WEBHOOK_SECRET` 对齐，禁止提交值。
- `MIGURI_NEW_WINDOW_NOTIFY_GROUPS`：`768670254`。
- `MIGURI_SYNC_SECRET`：原定时同步鉴权，保持不变。
- `NAPCAT_NOTIFY_GROUPS`：原同步异常告警目标，保持不变。

2026-09-08 通过 `wrangler secret bulk` 重新写入前三项，没有修改 Worker 代码或重启共享 PM2 服务。
旧配置值无法通过 secret list 读取，不能仅凭历史缺少送达日志断言具体故障根因。

部署前版本：`5f922d05-41df-4cf7-ad62-d3ce280a5099`。
配置更新版本：`755fcc51-9242-401c-8215-fd171e13e57a`。

## 实测

1. 中继鉴权探测：认证后空请求返回 `400 Missing message`，未发送消息。
2. 群内服务确认：NapCat `status=ok`、`retcode=0`、`message_id=2087326849`。
3. 执行原 `~/miguri-sync/run.sh`，正式 Worker 链路发现 **櫻坂46 16th《愛MUST BE》** `sakurazaka_202610` 第1～3次受付。
4. 正式新受付通知：群 `768670254`，`status=ok`、`retcode=0`、`message_id=1305526606`。中继 PM2 online、41天运行，error log 为空。
5. `node --test workers/miguri/src/routes/miguri.test.mjs`：17项通过；现有 mock DB 的 sold-out snapshot SQL 缺项会打印非致命警告，不是生产日志异常。

最新受付（北京时间；官方为 JST，晚一小时）：

| 轮次 | 开始 | 截止 |
| --- | --- | --- |
| 第1次 | 2026-09-09 13:00 | 2026-09-10 13:00 |
| 第2次 | 2026-09-16 13:00 | 2026-09-17 13:00 |
| 第3次 | 2026-09-24 17:00 | 2026-09-25 13:00 |

来源：<https://fortunemusic.jp/sakurazaka_202610/>。
重新同步前 API 只有15单已截止轮次；群内服务确认里的旧数据描述早于此次发现，以正式新受付通知为准。
9月9日11:00的当天提醒尚未到执行时间，本次只验证了真实新受付的完整链路。

## 排查与边界

- 同步日志：`/vol1/pm2-logs/miguri-sync.log`。
- 送达日志：`/vol1/pm2-logs/blog-push-out.log`，检索 `Miguri 告警推送完成`（提醒和异常告警共用此日志名）。
- 不能将同步 `success=true` 或 HTTP 200 等同于 QQ 送达；应核对 NapCat `status/retcode/message_id`。
- 当前提醒未实现持久化失败重试；新受付先入库后通知，失败后重跑不一定再次识别为新受付。当天重复手动同步也可能重复发当天提醒，不要无目的重跑。
- Python 默认 User-Agent 的公网探测曾收到 Cloudflare 403/1010；使用明确的 `46log-Miguri/1.0` 可通过。正式 Worker 实测已通过，不需要放宽 WAF。
- 本次没有新增 Homeserver 文件；日志、运行数据和后续排障临时文件必须放 `/vol1/`。
