# 完售生图统计列左移（2026-10-03）

公开 soldout API → `scripts/soldout-image-analysis.mjs`（实际参加枠分母、首次轮次、全完売、上轮增量）→ `scripts/soldout-image-gen.mjs`（Satori→Resvg PNG）→ Homeserver watcher 下一次更新正常生成。

新列顺序：成员姓名（排名／全完売标签）→ 完売／枠（+N）→ 日期×部次。grouped两级表头与flat平铺表头、两个排序全部一致；期生摘要也靠左。图片宽度、算法、输出名及推送流程保持原结构，不重复发送历史图片。

只改生图脚本，本地生产副本SHA256先对比一致并回拉备份后修改。部署 `~/fortune-soldout-watcher/soldout-image-gen.mjs`，SHA256 `24dc1816f118703c749e87f385541bf22e1978667569c3222cc6d1345cc968d5`。远端备份 `/vol1/fortune-soldout-watcher/backup-20261003/soldout-image-gen.mjs`。回滚该文件即可，数据库/Worker/Pages/cron不变，无服务重启。

11项分析/标题测试通过；真实櫻16单816/1056生成两排序×两布局四张图，本地目视确认统计在左并保留未参加-与第3次全完売。远端Node语法和四张PNG生成通过，验证图在 `/vol1/fortune-soldout-watcher/verification-20261003/`。没有调用QQ／微博推送。
