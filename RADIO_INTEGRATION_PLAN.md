# 广播页接入方案研究

> 研究如何将 `自动推送广播test v4.1` 和 `樱耳自动上传` 接入到 sakamichi-platform 的广播页

---

## 现状分析

### sakamichi-platform 广播页 (`/radio`)

4 个 tab，目前只有"实时收听"有基础 UI（无后端），其余 3 个 tab 都是占位 stub：

| Tab | 状态 | 说明 |
|-----|------|------|
| 实时收听 | UI 框架 | 播放器 + 节目表（静态数据，无后端） |
| 录制回放 | 占位 | "HomeServer 录制的广播将在此处归档" |
| さくみみ | 占位 | "后端接入后可浏览历史期数" |
| Radiko | 占位 | "需要 Radiko Premium 账号" |

### 自动推送广播 v4.1（Homeserver 运行中）

**核心能力**：Radiko → FFmpeg → MediaMTX → HLS/RTMP 实时推流

| 组件 | 端口 | 用途 |
|------|------|------|
| FastAPI 后端 | :8000 | API（推流控制、任务管理、状态查询） |
| MediaMTX | :8888 (HLS), :1935 (RTMP) | 流媒体服务器 |
| Svelte 前端 | :5173 | 管理面板（仅内网） |

**已有 API（可直接复用）**：
- `GET /api/status` — 当前推流状态 + 正在播放的节目
- `GET /api/schedule` — 节目表（从 Radiko 抓取）
- `GET /api/tasks` — 预约任务列表
- `POST /api/streaming/start` — 启动推流
- `POST /api/streaming/stop` — 停止推流
- `GET /api/recordings` — 录制列表（如果有）

### 樱耳自动上传（Homeserver cron 运行）

**核心能力**：自动爬取 → 下载音频(Brightcove) → 合成视频 → 上传 B 站

| 步骤 | 说明 |
|------|------|
| 爬取 | 登录 sakurazaka46.com → 获取 radio 列表 |
| 下载 | yt-dlp 下载 Brightcove 音频 + 封面图 |
| 合成 | FFmpeg 图片+音频 → MP4 |
| 上传 | biliup → B 站 |
| 通知 | Discord + QQ |

**数据来源**：
- `sakuradio_state.json` — 已处理期数状态
- `radio_mapping.json` — 期数 → 元数据映射（139KB，包含历史数据）
- 本地文件：`radio_audio/`, `radio_cover/`, `radio_video/`

---

## 接入方案

### 方案总览

```
sakamichi-platform (Cloudflare Pages, 静态前端)
       │
       │ fetch API
       ▼
Homeserver (192.168.3.11)
├── 广播后端 FastAPI :8000  ← 推流控制 + 状态
├── MediaMTX :8888          ← HLS 实时流
└── 樱耳数据 (本地文件)     ← さくみみ 历史数据
```

**关键问题**：Homeserver 在内网，前端在公网。需要一个 **API 代理层** 来桥接。

### 选项 A：Cloudflare Tunnel（推荐）

在 Homeserver 上部署 `cloudflared` tunnel，将指定端口暴露到公网：

```
radio-api.srzwyuu.workers.dev → tunnel → 192.168.3.11:8000 (FastAPI)
radio-hls.srzwyuu.workers.dev → tunnel → 192.168.3.11:8888 (MediaMTX HLS)
```

- 优点：零端口暴露，Cloudflare 自动 HTTPS/CORS
- 缺点：需要 Cloudflare Tunnel 服务常驻

### 选项 B：Cloudflare Worker 代理

新建一个 Worker 代理请求到 Homeserver（需要 Homeserver 端口转发或已有公网 IP）：

```js
// radio-proxy worker
fetch(`http://HOMESERVER_IP:8000${path}`)
```

- 优点：复用已有 Worker 基础设施
- 缺点：需要 Homeserver 公网可达

### 选项 C：定期同步到 R2/D1

不实时连接 Homeserver，而是定时将数据推送到 Cloudflare：
- 节目表 → D1 数据库或 R2 JSON
- 录制文件 → R2 存储
- さくみみ 音频 → R2 存储

- 优点：完全无需 Homeserver 公网暴露，前端完全静态
- 缺点：非实时，无法做直播推流控制

---

## 各 Tab 具体接入

### Tab 1: 实时收听

**数据需求**：
1. 当前播放状态（节目名、电台、时间）
2. HLS 流地址（用于浏览器播放）
3. 周间节目表

**接入步骤**：
1. 前端用 HLS.js 接入 MediaMTX 的 HLS 流
2. 定时轮询 `/api/status` 获取当前播放状态
3. 节目表从 `/api/schedule` 获取（替代当前硬编码数据）

**前端改造**：
- 安装 `hls.js`
- 播放器组件改为 React Island（需要 JS 交互）
- 添加 WebSocket 或轮询获取实时状态

### Tab 2: 录制回放

**数据需求**：
1. 录制文件列表（名称、日期、时长、大小）
2. 录制文件播放 URL

**接入步骤（推荐方案 C）**：
1. Homeserver 录制完成后，上传 MP3/M4A 到 R2（`radio-recordings/` prefix）
2. 创建一个 Worker API 列出 R2 中的录制文件
3. 前端展示列表 + 内嵌音频播放器

**或者方案 A**：直接通过 Tunnel 暴露 Homeserver 上的录制文件。

### Tab 3: さくみみ

**数据需求**：
1. 期数列表（EP号、出演成员、封面图、日期）
2. 音频播放 URL
3. B 站链接

**接入步骤（推荐混合方案）**：
1. **元数据**：将 `radio_mapping.json` 转换为 API
   - 选项 1: 上传到 R2 作为静态 JSON（简单）
   - 选项 2: 导入 D1 数据库（可搜索/分页）
2. **封面图**：上传到 R2（`sakumimi-covers/` prefix）
3. **音频**：
   - 选项 1: 上传到 R2（每集 ~15-30MB，需要容量规划）
   - 选项 2: 通过 Tunnel 从 Homeserver 流式播放
   - 选项 3: 仅提供 B 站链接，不自托管音频
4. **自动化**：在 `sakuradio_auto.py` 处理完成后，自动将元数据和封面推送到 R2

**前端改造**：
- 期数列表展示（封面图 + 成员标签 + 日期）
- 内嵌音频播放器
- B 站外链按钮
- 搜索/筛选（按成员名）

### Tab 4: Radiko

**数据需求**：
1. Radiko timefree 节目列表
2. Radiko 播放代理

**接入步骤**：
1. 广播后端已有 Radiko auth + proxy 模块
2. 通过 Tunnel 或 Worker 代理暴露 `/api/radiko/timefree` 端口
3. 前端展示 timefree 节目列表 + 播放

**注意**：Radiko timefree 有 7 天限制，且需要 Premium 账号。

---

## 优先级建议

| 优先级 | Tab | 难度 | 原因 |
|--------|-----|------|------|
| **P0** | さくみみ | 中 | 数据已有（radio_mapping.json），用户最关心 |
| **P1** | 实时收听 | 高 | 需要网络层（Tunnel/代理），但核心功能 |
| **P2** | 录制回放 | 中 | 依赖实时收听的网络层 |
| **P3** | Radiko | 高 | 需要 Premium + 认证代理，使用频率低 |

---

## 第一步：さくみみ 接入（P0）

最小可行方案：

1. **将 `radio_mapping.json` 上传到 R2** → `sakumimi/radio_mapping.json`
2. **将封面图上传到 R2** → `sakumimi-covers/EP{nnn}.jpg`
3. **前端读取 JSON + 展示列表**（分页、成员筛选）
4. **音频暂用 B 站外链**（避免存储成本）
5. **修改 `sakuradio_auto.py`**：处理完新期后自动更新 R2 上的 JSON + 封面

预估工作量：~2-3h

---

## 网络层决策（影响后续所有 Tab）

实时收听和 Radiko 都需要 Homeserver 公网可达。核心决策：

| 方案 | 成本 | 复杂度 | 适合场景 |
|------|------|--------|----------|
| Cloudflare Tunnel | 免费 | 中 | 长期方案 |
| 端口转发 + Worker 代理 | 免费 | 低 | 已有公网 IP |
| 仅 R2 同步 | 免费 | 低 | 非实时即可 |

**建议**：先走 R2 同步路线完成さくみみ和录制回放，再评估是否需要 Tunnel 做实时收听。
