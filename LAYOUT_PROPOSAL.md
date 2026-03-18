# Sakamichi Platform 布局重构方案

> ⚠️ **本文档已合并至** `../CONTENT_PLATFORM_ARCHITECTURE.md` v2，该文档包含更完整的广播三分区设计、共享资源层、前端组件架构等内容。本文件保留供参考。

> 针对入口不合理、MSG前端化、广播三分区的综合方案

---

## 一、现状问题分析

### 1.1 当前入口结构（不合理）
```
博客翻译页 ← 承载了过多入口
├── 博客翻译（核心功能）
├── 数据统计
├── 关系分析
├── 生写生成器（外链）     ← 不属于博客
├── MSG样式生成器（外链）  ← 不属于博客
└── ...

生写生成器页面
├── 生写卡片生成
└── 字幕底图制作          ← 两个独立工具混在一起
```

**问题**：
- 博客翻译页变成了"万能入口"，功能定位模糊
- 生写生成器和字幕底图制作本质是不同工具，不应共享页面
- MSG相关功能散落各处，缺乏统一归档/查看入口
- 广播功能（さくみみ、录制、实时收听）缺少前端展示

### 1.2 MSG推送现状
- `MSG推送/` 是 Node.js 后端，轮询API → 推送到 QQ/TG/Discord
- 核心：`AppApiListenerV3` 类（API轮询、消息处理、翻译、多渠道推送）
- `MSG网页/ARCHITECTURE.md` 已有前端查看器设计（未实现）
- `MSG生成/` 是聊天气泡样式生成器（独立工具）

---

## 二、新布局方案

### 2.1 顶层导航结构

```
Sakamichi Tools 平台
├── 📝 博客翻译    → /blog          （专注博客）
├── 💌 MSG归档     → /messages       （消息查看 + 翻译归档）
├── 📻 广播        → /radio          （三个子分区）
├── 🛠 工具箱      → /tools          （所有独立工具）
├── 🛍 周边商城    → /shop           （代购/拼单）
└── 👤 账户        → /auth/login
```

### 2.2 各模块详细结构

#### 📝 博客翻译 `/blog`（保持纯粹）
```
/blog
├── /blog              → 博客列表（全部/乃木坂/樱坂/日向坂）
├── /blog/stats        → 数据统计（从博客页tab移出为子页面）
├── /blog/interactions → 关系分析
└── #blog/{id}         → 博客详情（hash路由，现有逻辑不变）
```
**变化**：移除"生写生成器""MSG样式生成器"的tab，这些入口回归工具箱

#### 💌 MSG归档 `/messages`（新增核心模块）
```
/messages
├── /messages                    → 成员网格（按团体/期别）
├── /messages/{siteKey}/{member} → 成员消息时间线
└── /messages/generator          → MSG样式生成器（原MSG生成）
```
**数据来源**：复用MSG推送的存储数据 → JSON文件 or Cloudflare D1
**展示风格**：
- 列表页：参考 msg.nogi46.me 的网格卡片
- 详情页：聊天气泡样式（复用MSG生成的CSS）

#### 📻 广播 `/radio`（三分区）
```
/radio
├── /radio                → 广播首页（三分区入口）
├── /radio/sakumimi       → さくみみ（樱耳自动上传的归档）
├── /radio/recordings     → 广播录制归档（Radiko录制的往期节目）
└── /radio/live           → 广播实时收听（MediaMTX转播流）
```

| 分区 | 数据来源 | 功能 |
|------|---------|------|
| さくみみ | `樱耳自动上传/` → B站/YouTube | 播放列表、搜索、外链跳转 |
| 广播录制 | `自动推送广播test/backend/` → 录制文件 | 按节目/日期归档、在线播放 |
| 实时收听 | MediaMTX RTMP/HLS转播 | HLS.js播放器、节目表 |

#### 🛠 工具箱 `/tools`（统一入口）
```
/tools
├── /tools                    → 工具列表页
├── /tools/photocard          → 生写卡片生成器
├── /tools/subtitle-bg        → 字幕底图制作（独立出来）
├── /tools/msg-generator      → MSG样式生成器
└── /tools/ytdlp              → YouTube下载（如果需要）
```
**关键变化**：
- 生写生成器和字幕底图制作**完全分开**，各自独立页面
- MSG样式生成器从博客页移到工具箱（同时在MSG归档也有入口）
- 每个工具可以 iframe 嵌入或原生重写

### 2.3 导航示意

```
桌面端 Header:
┌──────────────────────────────────────────────────────┐
│ Sakamichi Tools    博客翻译  MSG归档  广播  工具箱  周边  │
└──────────────────────────────────────────────────────┘

移动端 Sidebar:
┌─────────────┐
│ 菜单         │
│ ── 核心 ──   │
│ 博客翻译     │
│ MSG归档      │
│ 广播         │
│ ── 工具 ──   │
│ 生写生成器   │
│ 字幕底图     │
│ MSG生成器    │
│ ── 其他 ──   │
│ 周边商城     │
│ 登录/注册    │
└─────────────┘
```

---

## 三、MSG推送前端版本方案

### 3.1 核心提取

从 `MSG推送/src/app-api-listener-v3.js` 提取：

| 核心模块 | 原文件 | 前端用途 |
|---------|--------|---------|
| API认证 | `getToken()`, `refreshToken()` | 获取坂道API access_token |
| 消息获取 | `getGroups()`, `getTimeline()` | 拉取成员列表和消息时间线 |
| 消息格式化 | `handleNewMessage()` 中的格式逻辑 | 展示消息内容 |
| 翻译 | `translator.js` | 消息翻译（可选，或直接显示已翻译内容） |
| R2存储 | `r2-storage.js` | 媒体文件URL |
| 成员配置 | `push-config.js` 中的成员列表 | 展示订阅的成员 |

**不需要提取的**（QQ/TG/Discord推送专用）：
- `sendToQQGroup()`, `sendToDiscord()`, `sendToTelegram()`
- `GroupChatHandler`（群聊回复）
- NapCat/Lagrange 相关代码

### 3.2 前端版本架构

```
msg-web-viewer/
├── src/
│   ├── api/
│   │   ├── auth.js           ← 从 app-api-listener-v3.js 提取认证逻辑
│   │   ├── messages.js       ← 从 getTimeline() 提取消息获取
│   │   └── members.js        ← 成员列表获取
│   ├── components/
│   │   ├── MemberGrid.jsx    ← 成员网格（按团体/期别）
│   │   ├── MessageTimeline.jsx ← 消息时间线（聊天气泡）
│   │   ├── MessageBubble.jsx ← 单条消息气泡（复用MSG生成CSS）
│   │   └── MediaViewer.jsx   ← 图片/视频/语音查看器
│   ├── utils/
│   │   ├── translator.js     ← 翻译模块（简化版）
│   │   └── date-format.js    ← 日期格式化
│   └── styles/
│       └── chat-bubble.css   ← 从 MSG生成 复用
├── package.json
└── README.md
```

### 3.3 数据流方案（两种可选）

**方案A：后端代理模式（推荐）**
```
浏览器 → Cloudflare Worker API → 坂道官方API
                              → D1 存储历史消息
                              → R2 缓存媒体
```
- 优点：不暴露 API 密钥、可缓存、可持久化
- 需要：Cloudflare Worker 做代理

**方案B：纯前端 + JSON归档**
```
MSG推送（后端）→ 每条消息存JSON → R2/GitHub Pages → 前端直接读取
```
- 优点：简单、无需额外后端
- 缺点：不能实时获取新消息，依赖后端定期导出
- 符合 `MSG网页/ARCHITECTURE.md` 的原始设计

**建议**：先用方案B快速实现（JSON归档 + 静态前端），后续升级到方案A。

### 3.4 实现步骤

1. 在 `MSG推送/src/` 中添加 `storage.js` 模块
   - 在 `handleNewMessage` 后追加存储到 JSON
   - 按成员分文件：`data/messages/{siteKey}_{memberName}.json`
2. 新建 `msg-web-viewer/` 文件夹
   - 提取认证和消息获取的核心代码
   - 创建 React 组件（MemberGrid + MessageTimeline）
   - 复用 MSG生成 的聊天气泡样式
3. 集成到 Astro 平台的 `/messages` 路由

---

## 四、广播三分区详细设计

### 4.1 さくみみ `/radio/sakumimi`

**数据来源**：`樱耳自动上传/` 项目
- `radio_mapping.json` 包含所有节目元数据
- 自动上传到 B站/YouTube

**功能**：
- 节目列表（按日期、按成员筛选）
- 外链跳转到 B站/YouTube 播放
- 节目搜索

### 4.2 广播录制 `/radio/recordings`

**数据来源**：`自动推送广播test/backend/` 的录制文件
- 录制存储在服务器上
- 可提供 HTTP 直接播放

**功能**：
- 录制列表（按节目名、日期）
- 在线 audio 播放器
- 下载链接

### 4.3 实时收听 `/radio/live`

**数据来源**：MediaMTX RTMP→HLS 转播
- 已有 `mediamtx_gui.html` 和 `schedule_viewer.html`

**功能**：
- HLS.js 播放器（嵌入或重写）
- 当前正在播放的节目信息
- 节目时间表
- 收听人数（如果可获取）

---

## 五、实施优先级

| 优先级 | 任务 | 工作量 |
|--------|------|--------|
| P0 | 重构顶层导航和布局 | 小（修改 BaseLayout + 页面路由） |
| P0 | 博客页移除非博客入口 | 小（删除tab） |
| P1 | 创建 MSG 存储模块 + JSON归档 | 中（修改MSG推送后端） |
| P1 | 创建 MSG 前端查看器 | 中（新建组件） |
| P1 | 工具箱拆分（生写/字幕/MSG生成各自独立） | 小 |
| P2 | 广播首页 + さくみみ归档 | 中 |
| P2 | 广播录制归档 | 中 |
| P3 | 广播实时收听 | 大（需要 HLS 集成） |
| P3 | 周边商城完善 | 待定 |

---

## 六、待确认问题

1. **MSG数据方案**：先用方案B（JSON归档）还是直接做方案A（Worker代理）？
2. **广播录制文件访问**：录制文件是否有公开的 HTTP 访问路径？
3. **さくみみ数据**：`radio_mapping.json` 中是否有B站/YouTube链接可直接使用？
4. **工具箱嵌入方式**：字幕底图制作是继续 iframe 嵌入还是迁移到 Astro 组件？
5. **实时收听**：MediaMTX 的 HLS 流地址是什么？是否对外可访问？
