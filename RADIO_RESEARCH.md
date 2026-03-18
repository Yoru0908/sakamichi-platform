# 广播接入研究报告

> 基于对 v4.1 后端、樱耳自动上传、现有 radio 页面的代码分析

---

## 你提出的问题与我的回答

### Q1: 实时放送 — 用 v4.1 做后端自动预约推送？

**结论：是的，v4.1 是唯一合理选择。**

v4.1 已有完整的推流链路：
- `api/schedule` — 从 Radiko 抓节目表（today/week/full）
- `api/scheduled-tasks` — 预约任务 CRUD
- `api/streaming/status` — 推流状态查询
- `api/stations` — 电台列表
- MediaMTX :8888 — HLS 输出

Platform 前端只需要：
1. 轮询 `/api/streaming/status` 显示当前播放状态
2. 接入 HLS.js 播放 MediaMTX 的 HLS 流
3. 从 `/api/schedule/week` 获取节目表（替代当前硬编码的 5 条）

**核心瓶颈**：网络层。v4.1 在内网 192.168.3.11:8000/8888，Platform 在 Cloudflare Pages（公网）。需要 Cloudflare Tunnel 或端口转发才能从公网访问 HLS 流和 API。这是所有实时功能的前提。

### Q2: 录制 — 要不要单独拿出来做后端？

**我的判断：暂时不需要独立后端，但建议将录制结果独立存储。**

v4.1 的录制逻辑在 `streaming.py` 中（`/api/record`），和推流共用 FFmpeg 进程管理。你提到"录制和推流同时进行时总感觉有问题"，这可能是：

1. **FFmpeg 资源竞争** — 推流和录制同时占用 CPU/IO（Homeserver 性能？）
2. **Radiko auth 冲突** — 同一 token 同时被推流和录制使用
3. **进程管理** — v4.1 的 Orchestrator 在双路径切换时可能影响录制进程

**建议的解法**：
- **短期**：录制完成后，自动将 MP3/M4A 复制到一个独立目录（如 `/vol1/radio-recordings/`），和推流进程解耦
- **中期**：如果录制 bug 持续，可以把录制拆成一个独立的 cron 脚本（直接用 radiko-rec + FFmpeg），完全绕过 v4.1 的推流逻辑
- **长期**：录制结果上传到 R2 或 AList，前端从那里读取播放

**不建议**为录制专门写一个新的 FastAPI 后端，因为：
- 录制本质上是"定时执行 FFmpeg 命令 → 保存文件"，一个 shell 脚本 + cron 就够
- 独立后端增加维护成本，而收益不大

### Q3: さくみみ — 仿制官网页面

**这是最容易落地的部分。** 我完全同意仿制官网的设计。

#### 已有数据

`radio_mapping.json` 有 467 期数据（EP1 ~ EP467+），每条：
```json
{
  "image": ["https://sakurazaka46.com/images/..."],
  "video_id": "6372509709112",
  "account_id": "4504957038001",
  "detail_url": "https://sakurazaka46.com/s/s46/diary/detail/59969"
}
```

**缺失的数据**：
- ❌ **出演成员** — `radio_mapping.json` 里没有，需要从 detail_url 爬取（`sakuradio_auto.py` 的 `get_episode_summary()` + `extract_members()` 已有此逻辑）
- ❌ **简介文本** — 同上，需要爬取
- ❌ **发布日期** — JSON 里没有，但可以从 EP 号 + 已知的每周二更新规律推算，或爬取
- ❌ **音频时长** — 需要从 Brightcove API 获取，或下载后提取

#### 仿官网的 UI 方案

参考你发的截图（官网 sakurazaka46.com/s/s46/diary/radio）：

```
┌──────────────────────────────────────────┐
│ メンバーで絞り込み                          │ ← 成员筛选
│ [遠藤光莉] [大園玲] [大沼晶保] ...         │
│                                          │
│ 決定する →                                │
├──────────────────────────────────────────┤
│ #556            2026.3.13 UP             │
│ ┌──────────┐                             │
│ │  封面图   │                             │
│ │ #556     │                             │
│ └──────────┘                             │
│ ▶ 0:00 ──────── 19:51                    │ ← 音频播放器
│                                          │
│ 引き続き、田村保乃・藤吉夏鈴・的野美青が...  │ ← 简介
│ #田村保乃 #藤吉夏鈴 #的野美青              │ ← 成员标签
│                          ♡  𝕏            │ ← 收藏/分享
└──────────────────────────────────────────┘
```

#### 具体实现路线

**Phase 1（数据准备，~1h）**：
1. 增强 `radio_mapping.json`：批量爬取所有 467 期的 detail 页，提取成员名+简介
2. 输出为 `radio_enriched.json`，格式：
   ```json
   {
     "556": {
       "ep": 556,
       "date": "2026-03-13",
       "members": ["田村保乃", "藤吉夏鈴", "的野美青"],
       "summary": "引き続き、田村保乃・藤吉夏鈴...",
       "image": "https://sakurazaka46.com/images/...",
       "detail_url": "https://sakurazaka46.com/...",
       "bilibili_url": "https://www.bilibili.com/video/BVxxx"
     }
   }
   ```

**Phase 2（前端 UI，~2h）**：
1. 新建 `SakumimiArchive.tsx` React Island 组件
2. 成员筛选栏（仿官网的网格布局）
3. 期数卡片列表（封面图 + EP号 + 日期 + 成员标签 + 简介）
4. 分页/无限滚动
5. 点击卡片展开 → 显示详情 + B站外链按钮

**Phase 3（音频播放，可选）**：
- 选项 A：仅提供 B 站外链（零成本，最简单）
- 选项 B：封面图直接链接到 sakurazaka46.com 的 detail 页
- 选项 C：自托管音频到 R2（~15MB/集 × 467 = ~7GB，R2 免费 10GB 够用但紧张）

### Q4: おたより

**同意你的判断 — 直接跳转官网。**

```
おたよりを送る → window.open("https://sakurazaka46.com/s/s46/diary/radio?cd=radio&ima=0000")
```

无需任何后端或额外功能。可以在さくみみ页面底部放一个链接按钮。

---

## 集成到 Platform 的整体方案

### 不需要 Tunnel 就能做的（先做）

| 功能 | 数据源 | 方式 |
|------|--------|------|
| さくみみ归档 | `radio_enriched.json` | 静态 JSON（R2 或直接打包到前端） |
| さくみみ封面图 | sakurazaka46.com 图片 CDN | 直链（跨域没问题，是公开图片） |
| B 站链接 | `sakuradio_state.json` | 从 BV 号拼接 |
| おたより | 官网链接 | 直接跳转 |
| 节目表（静态版） | v4.1 schedule JSON | 定时同步到 R2（cron 每天一次） |

### 需要 Tunnel 才能做的（后做）

| 功能 | 依赖 |
|------|------|
| HLS 实时播放 | MediaMTX :8888 需公网可达 |
| 推流状态实时查询 | FastAPI :8000 需公网可达 |
| 录制文件播放 | 文件在 Homeserver |
| Radiko timefree | Radiko auth 在 Homeserver |

### 建议的执行顺序

```
1. さくみみ归档页（不需要任何网络层变更，纯前端+静态JSON）
   ├── 1a. 爬取+增强 radio_mapping.json
   ├── 1b. SakumimiArchive.tsx 组件
   └── 1c. 修改 sakuradio_auto.py → 新期自动更新 JSON

2. 节目表动态化（轻量改动）
   ├── 2a. Homeserver cron 每天推 schedule.json 到 R2
   └── 2b. 前端从 R2 读取替代硬编码

3. Cloudflare Tunnel（决定是否做实时功能的前提）
   ├── 3a. 安装 cloudflared
   ├── 3b. 配置 tunnel → radio-api / radio-hls
   └── 3c. 前端接入 HLS.js + 状态轮询

4. 录制回放（依赖 Tunnel 或 R2 同步）

5. Radiko（最低优先级）
```

---

## 关于录制 bug 的排查建议

如果要排查"录制+推流同时进行时的问题"，建议：

1. SSH 进服务器，手动同时启动推流+录制，观察：
   - `htop` 看 FFmpeg 进程 CPU/内存
   - `ls -la /vol1/radio-recordings/` 看录制文件是否正常增长
   - `tail -f backend.log` 看有无错误

2. 关键检查点：
   - Radiko auth token 是否被两个 FFmpeg 进程共享（如果是，可能会 403）
   - MediaMTX 的双路径（backup/primary）切换是否影响录制流
   - 磁盘 IO 是否成为瓶颈

这些需要在 Homeserver 上实际操作才能确认，建议我们先把さくみみ落地，录制问题后续排查。
