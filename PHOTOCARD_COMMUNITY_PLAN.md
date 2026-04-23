# 生写生成社区 — 详细设计规划

> 最后更新: 2026-03-27

---

## 一、现状分析

### 已有资源

| 资源 | 路径 | 状态 |
|------|------|------|
| 生写生成器 | `/photocard/create` → `PhotocardGenerator.tsx` | ✅ 完全可用 |
| 社区 Tab 组件 | `CommunityTabs.tsx` | ⚠️ Mock 数据 |
| 社区首页 | `/photocard/index.astro` | ⚠️ "赶忙制作中" 占位 |
| 旧路由重定向 | `/tools/photocard` → `/photocard/create` (301) | ✅ |
| Auth Worker | `workers/auth/` → D1 `sakamichi-auth` | ✅ 用户/JWT/角色 |
| Auth Store | `stores/auth.ts` → nanostores | ✅ 前端状态 |

### 缺失部分

| 缺失 | 说明 |
|------|------|
| 后端 API | 无 gallery/community 相关 API 路由 |
| 图片存储 | 无社区图片存储，生成器目前纯客户端导出 |
| D1 表 | 无作品元数据、点赞、收藏等表 |
| 前端 API 层 | 无 `community-api.ts` |

---

## 二、架构方案

### 方案对比

| | 方案 A: 扩展 Auth Worker | 方案 B: 新建 Community Worker |
|---|---|---|
| 优点 | 共享 D1/JWT，无需跨 Worker 鉴权 | 职责分离，独立扩展 |
| 缺点 | Auth Worker 膨胀，混合职责 | 需要在新 Worker 重新验证 JWT |
| 复杂度 | 低 | 中 |
| 推荐度 | ⭐⭐⭐ MVP 首选 | 后期重构时考虑 |

**建议 MVP 采用方案 A**：在现有 `sakamichi-auth` Worker 中新增 `/api/community/*` 路由，共享同一个 D1 数据库和 JWT 鉴权中间件。

### 存储架构 — Alist 方案 (已确认)

**为什么不用 R2**: 图片量增长后 R2 存储费用持续增加，Alist 利用 Homeserver 本地磁盘无额外成本。

**地理限制解决**: `alist.46log.com` 被 geo-auth-worker 保护（JP围栏），
新建 `gallery.46log.com` 指向同一 Alist 后端但不受 geo-auth 保护。
WAF 规则 5 已添加 `gallery.46log.com` 全球放行。

```
┌─────────────────────────────────────────────┐
│  Cloudflare Pages (Astro Static)            │
│  /photocard        → 社区浏览              │
│  /photocard/create → 生成器               │
└────────────┬────────────────────────────────┘
             │ fetch
             ▼
┌─────────────────────────────────────────────┐
│  sakamichi-auth Worker                      │
│  /api/auth/*      → 认证 (已有)             │
│  /api/user/*      → 用户 (已有)             │
│  /api/community/* → 社区 (新增)             │
│                                              │
│  Bindings: DB → D1 sakamichi-auth (已有)   │
│  上传图片 → Alist API (alist.46log.com)    │
└─────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│  Homeserver Alist (Docker :5244)            │
│  /d/community/works/{id}/full.png           │
│  /d/community/works/{id}/thumb.webp         │
│                                              │
│  访问域名 (无geo-auth):                      │
│    gallery.46log.com → Tunnel → :5244       │
│  宿主机: /vol1/community  容器: /mnt/community│
└─────────────────────────────────────────────┘
```

---

## 三、数据库设计 (D1 新增表)

```sql
-- 作品表
CREATE TABLE IF NOT EXISTS community_works (
  id TEXT PRIMARY KEY,                    -- nanoid
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 作品内容
  image_key TEXT NOT NULL,                -- Alist 文件路径 (works/{id}/full.png)
  thumbnail_key TEXT,                     -- Alist 缩略图路径 (works/{id}/thumb.webp)
  
  -- 元数据（生成器参数快照）
  member_name TEXT NOT NULL,              -- 成员名
  romaji_name TEXT,                       -- 罗马字
  group_style TEXT NOT NULL,              -- '櫻坂46' | '日向坂46' | '乃木坂46' | '乃木坂46②'
  theme TEXT,                             -- 主题文字
  
  -- 下载权限
  allow_download INTEGER NOT NULL DEFAULT 1, -- 1=允许下载, 0=禁止
  
  -- 统计
  like_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'published', -- 'published' | 'hidden' | 'deleted'
  
  -- 时间
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 点赞表
CREATE TABLE IF NOT EXISTS community_likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES community_works(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, work_id)
);

-- 收藏表 (Phase 2)
CREATE TABLE IF NOT EXISTS community_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES community_works(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, work_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_works_user ON community_works(user_id);
CREATE INDEX IF NOT EXISTS idx_works_group ON community_works(group_style);
CREATE INDEX IF NOT EXISTS idx_works_member ON community_works(member_name);
CREATE INDEX IF NOT EXISTS idx_works_status ON community_works(status);
CREATE INDEX IF NOT EXISTS idx_works_likes ON community_works(like_count DESC);
CREATE INDEX IF NOT EXISTS idx_works_created ON community_works(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_work ON community_likes(work_id);
```

### Alist 存储结构

```
/vol1/community/              (Homeserver 宿主机)
  works/
    {work_id}/
      full.png                -- 原始导出 (3x 高清)
      thumb.webp               -- 缩略图 (400px宽, WebP, 客户端生成)

对外 URL:
  缩略图: https://gallery.46log.com/d/community/works/{id}/thumb.webp
  原图:   https://gallery.46log.com/d/community/works/{id}/full.png
```

---

## 四、API 设计

### 路由表

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET` | `/api/community/works` | public | 浏览作品列表 |
| `GET` | `/api/community/works/:id` | public | 作品详情 |
| `POST` | `/api/community/works` | 所有人 | 发布作品 |
| `DELETE` | `/api/community/works/:id` | 作者/admin | 删除作品 |
| `POST` | `/api/community/works/:id/like` | 所有人 | 点赞/取消 |
| `GET` | `/api/community/my-works` | 登录用户 | 我的作品列表 |

### API 详细设计

#### `GET /api/community/works`

```
Query params:
  ?group=sakurazaka|hinatazaka|nogizaka  -- 团体筛选（可选）
  ?member=山﨑天                          -- 成员筛选（可选）
  ?sort=latest|popular                   -- 排序方式（latest=按created_at DESC，popular=按like_count DESC + created_at DESC）
  -- 注：popular 目前使用总 like_count 排序，非时间窗口热度。
  --     社区规模扩大后可升级为近7天 like 数（需给 community_likes 加索引并用子查询统计）
  ?page=1&limit=20                       -- 分页
  
Response 200:
{
  "success": true,
  "data": {
    "works": [
      {
        "id": "abc123",
        "imageUrl": "https://gallery.46log.com/d/community/works/abc123/thumb.webp",
        "memberName": "山﨑天",
        "groupStyle": "櫻坂46",
        "theme": "夏の近く",
        "likeCount": 42,
        "liked": false,         // 当前用户是否已赞（未登录=false）
        "author": {
          "id": "user123",
          "displayName": "srzwyuu",
          "avatarUrl": "..."
        },
        "createdAt": "2025-03-27T..."
      }
    ],
    "total": 156,
    "page": 1,
    "hasMore": true
  }
}
```

#### `POST /api/community/works`

```
Request: multipart/form-data
  image: File (PNG blob)
  memberName: "山﨑天"
  romajiName: "YAMASAKI TEN"
  groupStyle: "櫻坂46"
  theme: "夏の近く"
  
Response 201:
{
  "success": true,
  "data": { "id": "abc123", "imageUrl": "..." }
}
```

#### `POST /api/community/works/:id/like`

```
Response 200:
{
  "success": true,
  "data": { "liked": true, "likeCount": 43 }
}
```

---

## 五、前端组件设计

### 页面路由

```
/photocard              → 社区首页（热门 + 我的作品）
/photocard/create       → 生成器（已有）
/photocard/:id          → 作品详情页（Phase 2，MVP 可用灯箱替代）
```

### 组件树

```
/photocard (index.astro)
├── CommunityHeader         -- 标题 + "去创作"按钮
├── CommunityTabs           -- 改造现有组件
│   ├── Tab: 热门作品
│   │   ├── GroupFilter     -- 全部 / 乃木坂 / 櫻坂 / 日向坂
│   │   ├── SortToggle      -- 最新 / 最热
│   │   └── WorkGrid        -- 瀑布流网格
│   │       └── WorkCard[]  -- 单张作品卡片
│   └── Tab: 我的作品
│       ├── (登录) MyWorkGrid
│       └── (未登录) LoginPrompt
└── WorkLightbox (模态)     -- 点击卡片打开大图
```

### WorkCard 组件

```
┌────────────────┐
│                │
│  [缩略图]       │  ← 点击打开灯箱/详情
│                │
│  ── 团体色条 ──│  ← 1px 底色条
├────────────────┤
│ 山﨑天          │  成员名
│ 夏の近く       │  主题
├────────────────┤
│ ♡ 42   by user │  点赞数 + 作者
└────────────────┘
```

### WorkLightbox 模态框（MVP 版本）

```
┌──────────────────────────────────────────┐
│  (半透明黑色背景)            ✕ 关闭      │
│                                          │
│  ◀    ┌────────────────────┐    ▶       │
│       │                    │            │
│       │   [高清生写卡片]    │            │
│       │                    │            │
│       │                    │            │
│       └────────────────────┘            │
│                                          │
│  山﨑天 · 櫻坂46 · 夏の近く              │
│  by srzwyuu · 2025/03/27               │
│                                          │
│  [♡ 点赞 42]  [⬇ 下载]                  │
└──────────────────────────────────────────┘
```

---

## 六、发布流程

### 用户视角

```
1. 用户在 /photocard/create 制作卡片
2. 点击 "生成并下载图片" → 本地导出 (现有功能)
3. 点击 "发布到社区" → 确认弹窗
   ├── 预览缩略图 + 确认信息
   ├── 勾选"允许他人下载"(默认勾选)
   └── 点击"发布"
4. 上传 → POST /api/community/works (multipart)
5. Worker 端处理:
   a. 验证 JWT
   b. 接收图片 → 生成缩略图 (400px WebP)
   c. 上传 full.png + thumb.webp 到 Alist (/community/works/{id}/)
   d. 写入 community_works 记录
   e. 返回 { id, imageUrl }
6. 前端显示成功 → 跳转到社区或作品详情
```

### 技术细节：图片处理

**已确认方案 — 客户端双导出**：
- 客户端同时导出 full.png (3x 高清) 和 thumb.webp (1x, 400px宽)
- 上传两个文件到 Worker，Worker 转发到 Alist
- 优点：Worker 无需图片处理能力，简单可靠

---

## 七、权限矩阵

| 操作 | guest | member | verified | admin |
|------|-------|--------|----------|-------|
| 浏览作品列表 | ✅ | ✅ | ✅ | ✅ |
| 查看作品详情 | ✅ | ✅ | ✅ | ✅ |
| 下载高清图 | ✅(作者允许时) | ✅(作者允许时) | ✅(作者允许时) | ✅ |
| 发布作品 | ✅ | ✅ | ✅ | ✅ |
| 点赞 | ✅ | ✅ | ✅ | ✅ |
| 删除自己的作品 | — | ✅ | ✅ | ✅ |
| 删除任何作品 | — | — | — | ✅ |

---

## 八、实施阶段

### Phase 1 — MVP (当前目标)

**基础设施 (已完成)：**
1. ✅ Homeserver `/vol1/community` 目录
2. ✅ Alist Docker 重建 + `/mnt/community` 挂载
3. ✅ Alist 存储配置 `/community` → `/mnt/community`
4. ✅ Cloudflare Tunnel `gallery.46log.com` → `:5244`
5. ⏳ WAF 规则 5 添加 `gallery.46log.com`

**后端：**
1. ✅ D1 新增 `community_works` + `community_likes` 表
2. ✅ 新增路由: `GET/POST /api/community/works`, `POST .../like`, `DELETE`, `GET /my-works`
3. ✅ Worker → Alist API 上传图片逻辑

**前端：**
1. ✅ 改造 `CommunityTabs.tsx` → 接入真实 API
2. ✅ 改造 `/photocard/index.astro` → 移除 "coming soon"，挂载社区组件
3. ✅ 新增 `community-api.ts` — API 调用层
4. ✅ 新增 `WorkCard.tsx` — 真实作品卡片
5. ✅ 新增 `WorkLightbox.tsx` — 灯箱查看
6. ✅ `PhotocardGenerator.tsx` — "发布到社区"按钮接入真实上传

**待完成：**
- ⬜ 开放给所有用户（移除 `AdminCommunityGate`，等 Phase 3 完成后开放）

### Phase 2 — 增强 (✅ 2026-04-11 完成)

- ✅ 收藏功能 (`community_bookmarks` 表 + API + 前端)
- ✅ 灯箱左右切换导航 + 键盘快捷键 (Esc/←/→)
- ✅ 搜索（按成员名、主题，LIKE 模糊搜索）
- ✅ 无限滚动 (IntersectionObserver 替代"加载更多"按钮)
- ✅ 骨架屏加载占位
- ✅ 分享链接指向具体作品 (?id=xxx)
- ✅ 未登录点赞/收藏引导提示
- ✅ Bug修复: handleGetWork likeCount 错误+1、handleListWorks 冗余查询
- ⬜ 作品详情页 `/photocard/:id` (目前用灯箱替代)
- ⬜ 用户主页 → 查看他人作品

### Phase 3 — 进阶

- 评论系统
- 举报/审核
- 排行榜 (周/月/总)
- 模板市场 (`/photocard/templates`)

---

## 九、已确认的决策

| 问题 | 决策 |
|------|------|
| Q1: 存储方案 | ✅ Alist（Homeserver 本地磁盘，经 `gallery.46log.com` 访问） |
| Q2: 缩略图生成 | ✅ 客户端双导出（full.png 3x + thumb.webp 1x） |
| Q3: 权限 | ✅ 所有人可浏览/发布/点赞，作者控制下载权限 |
| Q4: 审核 | ✅ 直接发布，管理员事后删除 |
| Q5: 路由 | ✅ 保持现有路由不变 |

---

## 十、实施顺序

| # | 任务 | 状态 |
|---|------|------|
| 1 | 基础设施（Alist/Tunnel/存储） | ✅ 完成 |
| 2 | WAF 规则 5 添加 gallery.46log.com | ⏳ 用户手动 |
| 3 | D1 schema 创建（community_works + community_likes + community_bookmarks） | ✅ |
| 4 | Worker API routes (`/api/community/*`) | ✅ |
| 5 | `community-api.ts` 前端 API 层 | ✅ |
| 6 | `WorkCard.tsx` + `WorkLightbox.tsx` 组件 | ✅ |
| 7 | 改造 `CommunityTabs.tsx` + `index.astro` | ✅ |
| 8 | `PhotocardGenerator.tsx` "发布到社区"按钮 | ✅ |
| 9 | Phase 2 增强（收藏/搜索/无限滚动/灯箱导航/骨架屏） | ✅ |
| 10 | 开放给所有用户（移除 AdminCommunityGate） | ⬜ Phase 3 后 |
| 11 | 测试 + 部署 | ⬜ |
