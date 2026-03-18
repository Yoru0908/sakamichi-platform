# 认证系统设计文档

> 版本: v1.0 | 日期: 2026-03-15

## 一、概述

为 Sakamichi Platform 实现完整的用户认证系统，支持邮箱密码注册登录和多平台 OAuth 社交登录。

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Astro 6 + React 19 | 登录/注册页面、引导页 |
| 状态 | nanostores | `$auth` store，前端持久化 |
| 后端 | Cloudflare Workers | Auth API |
| 数据库 | Cloudflare D1 | 用户表、收藏表 |
| Session | Cloudflare KV | JWT token 存储 |
| 邮件 | Resend (推荐) / Mailchannels | 验证邮件发送 |

---

## 二、用户角色体系

```
guest → member → verified → translator → admin
  |        |         |           |          |
  |        |         |           |          └─ 全部权限
  |        |         |           └─ 翻译协作系统
  |        |         └─ 广播音视频 (radio)
  |        └─ MSG原文+媒体、INS归档、商品关注
  └─ 公开内容：博客翻译、MSG翻译、工具
```

### 角色升级路径

| 从 | 到 | 条件 |
|----|-----|------|
| guest | member | 注册 + 邮箱验证 |
| member | verified | 管理员手动审核 |
| member | translator | 管理员邀请 |

---

## 三、登录方式

### 3.1 邮箱 + 密码（基础）

- 标准 email/password 注册登录
- 密码使用 bcrypt 哈希 (Cloudflare Workers 支持 Web Crypto API)
- 验证邮件激活账号

### 3.2 Discord OAuth

- 目标用户群常用 Discord，匹配度高
- Discord Developer Portal → OAuth2 Application
- Scopes: `identify`, `email`
- 回调获取 Discord ID、用户名、头像

### 3.3 Google OAuth

- 覆盖国际用户
- Google Cloud Console → OAuth 2.0 Client
- Scopes: `openid`, `email`, `profile`
- 回调获取 Google ID、邮箱、显示名、头像

### 3.4 Twitter/X OAuth（Phase 2）

- 坂道粉丝活跃平台
- X Developer Portal → OAuth 2.0 (PKCE)
- Scopes: `tweet.read`, `users.read`
- 回调获取 X ID、用户名、头像

---

## 四、注册流程

```
┌─────────────────────────────────────────────────────┐
│                    注册页面                           │
│                                                     │
│  ┌─── 邮箱注册 ───────────────────────────────────┐  │
│  │  邮箱: [____________]                          │  │
│  │  密码: [____________]                          │  │
│  │  确认: [____________]                          │  │
│  │  昵称: [____________] (可选，默认邮箱前缀)      │  │
│  │           [ 注册 ]                             │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  ─────────── 或使用社交账号 ───────────               │
│                                                     │
│  [ Discord 登录 ] [ Google 登录 ]                    │
│                                                     │
│  已有账号？ 立即登录                                  │
└─────────────────────────────────────────────────────┘
```

### 邮箱注册流程

```
用户填写表单 → POST /api/auth/register
  → 验证邮箱格式、密码强度
  → D1 写入用户 (email_verified = false)
  → 生成验证 token (存 KV, TTL 24h)
  → 发送验证邮件 (含验证链接)
  → 返回 "请查收验证邮件"

用户点击验证链接 → GET /api/auth/verify?token=xxx
  → 验证 token 有效性 (KV 查找)
  → D1 更新 email_verified = true, role = 'member'
  → 删除 KV 中的 token
  → 重定向到登录页 (带 ?verified=true)
```

### OAuth 注册/登录流程

```
用户点击 [Discord 登录]
  → GET /api/auth/discord
  → 302 重定向到 Discord 授权页
  → 用户授权
  → Discord 回调 → GET /api/auth/callback/discord?code=xxx
  → Workers 用 code 换取 access_token
  → 用 access_token 获取用户信息
  → D1 查找 oauth_provider='discord' AND oauth_id=xxx
    → 存在: 更新 last_login, 签发 JWT
    → 不存在: 创建新用户 (role='member', email_verified=true)
  → 设置 HttpOnly cookie (JWT)
  → 重定向到首页或引导页（首次登录）
```

---

## 五、首次登录引导页

用户首次登录后（无论邮箱还是 OAuth），跳转到引导页：

```
┌─────────────────────────────────────────────────────┐
│              欢迎来到 Sakamichi Tools!                │
│                                                     │
│  告诉我们你喜欢谁，我们会为你个性化推荐                │
│                                                     │
│  推しメン（最喜欢的成员）                              │
│  ┌────────────────────────────────────────────────┐  │
│  │  [搜索成员...]                                 │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐                   │  │
│  │  │ 头像 │ │ 头像 │ │ 头像 │  ...              │  │
│  │  │ 名前 │ │ 名前 │ │ 名前 │                   │  │
│  │  └──────┘ └──────┘ └──────┘                   │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  気になるメンバー（关注的成员）                        │
│  ┌────────────────────────────────────────────────┐  │
│  │  乃木坂 | 櫻坂 | 日向坂                        │  │
│  │  ☐ 成员A  ☐ 成员B  ☐ 成员C  ☐ 成员D          │  │
│  │  ☐ 成员E  ☐ 成员F  ☐ 成员G  ☐ 成员H          │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  [ 跳过 ]                    [ 完成设置 → ]          │
│                                                     │
│  * 推しメン和気になるメンバー会自动加入你的收藏夹       │
└─────────────────────────────────────────────────────┘
```

### 引导页逻辑

1. 用户选择推しメン → `PUT /api/user/preferences` 保存
2. 用户选择気になるメンバー → 同上
3. 选中的成员自动调用 `addFavorite()` 加入收藏
4. **即时同步到前端 nanostores**：选完后直接更新 `$auth` 和 `$favorites` store，跳转首页时无需额外网络请求即可渲染个性化内容（零延迟体验）
5. 点击「完成设置」→ 标记 `is_first_login = false` → 跳转到首页
6. 点击「跳过」→ 同上，后续可在账号设置中修改

---

## 六、后端 API 设计

### 6.1 认证相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 邮箱注册 | 无 |
| POST | `/api/auth/login` | 邮箱登录 | 无 |
| POST | `/api/auth/logout` | 登出 | 需要 |
| GET | `/api/auth/me` | 获取当前用户 | 需要 |
| GET | `/api/auth/verify` | 邮箱验证 | 无 (token) |
| GET | `/api/auth/discord` | Discord OAuth 入口 | 无 |
| GET | `/api/auth/google` | Google OAuth 入口 | 无 |
| GET | `/api/auth/callback/:provider` | OAuth 回调 | 无 (code) |

### 6.2 用户偏好

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/user/preferences` | 获取偏好（推し、收藏等） | 需要 |
| PUT | `/api/user/preferences` | 更新偏好 | 需要 |
| GET | `/api/user/favorites` | 获取收藏列表 | 需要 |
| PUT | `/api/user/favorites` | 同步收藏列表 | 需要 |

### 6.3 请求/响应示例

**注册：**
```json
// POST /api/auth/register
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "displayName": "ファン太郎"  // 可选
}

// Response 201
{
  "success": true,
  "message": "验证邮件已发送至 user@example.com"
}
```

**登录：**
```json
// POST /api/auth/login
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123"
}

// Response 200 + Set-Cookie: auth_token=xxx; HttpOnly; Secure; SameSite=Lax
{
  "success": true,
  "user": {
    "id": "uuid-xxx",
    "email": "user@example.com",
    "displayName": "ファン太郎",
    "avatarUrl": null,
    "role": "member",
    "isFirstLogin": false
  }
}
```

**获取当前用户：**
```json
// GET /api/auth/me  (Cookie: auth_token=xxx)
// Response 200
{
  "success": true,
  "user": {
    "id": "uuid-xxx",
    "email": "user@example.com",
    "displayName": "ファン太郎",
    "avatarUrl": null,
    "role": "member"
  }
}

// Response 401 (未登录)
{
  "success": false,
  "error": "unauthorized"
}
```

---

## 七、数据库设计 (D1)

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,                    -- UUID v4
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,                     -- NULL for OAuth-only users
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member',    -- guest/member/verified/translator/admin
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_first_login BOOLEAN NOT NULL DEFAULT TRUE,
  verification_status TEXT NOT NULL DEFAULT 'none',  -- none/pending/approved/rejected
  oshi_member TEXT,                       -- 推しメン名
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

-- OAuth 关联表（支持一个用户绑定多个 OAuth）
CREATE TABLE user_oauth (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                 -- 'discord' / 'google' / 'twitter'
  provider_id TEXT NOT NULL,              -- 该平台的用户 ID
  provider_email TEXT,
  provider_name TEXT,
  provider_avatar TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id)
);

-- 用户收藏表（Phase 2: 云端同步）
CREATE TABLE user_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  member_group TEXT,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, member_name)
);

-- 気になるメンバー表
CREATE TABLE user_followed_members (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  member_group TEXT,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, member_name)
);

-- 索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_oauth_provider ON user_oauth(provider, provider_id);
CREATE INDEX idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX idx_user_followed_user ON user_followed_members(user_id);
```

---

## 八、Session 管理

### 双令牌机制 (Access Token + Refresh Token)

> **为什么不用单 JWT + KV 黑名单？**
> Cloudflare KV 属于「最终一致性」存储，数据同步到全球边缘节点存在数秒到数十秒延迟。
> 登出后旧 Token 在部分节点可能仍然有效。采用短效 Access Token + D1 存储 Refresh Token 更严谨。

#### Access Token (JWT)

```
Header: { alg: "HS256", typ: "JWT" }
Payload: {
  sub: "user-uuid",          // 用户 ID
  role: "member",            // 角色
  iat: 1711000000,           // 签发时间
  exp: 1711000900            // 过期时间 (15分钟)
}
Signature: HMACSHA256(header + payload, JWT_SECRET)
```

- 有效期: **15 分钟**（短效）
- 存储: HttpOnly Cookie `access_token`
- 校验: 仅验证签名 + 过期时间，无需查库

#### Refresh Token

- 随机生成的不透明字符串 (crypto.randomUUID)
- 有效期: **7 天**
- 存储: **D1 数据库** `refresh_tokens` 表（强一致性）
- Cookie: `refresh_token=<token>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/api/auth/refresh`

#### D1 Refresh Token 表

```sql
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,                    -- refresh token 值
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

#### 请求流程

```
请求 → 检查 access_token Cookie
  → 有效 → 正常响应
  → 过期/无效 → 自动调用 /api/auth/refresh
    → 检查 refresh_token Cookie → D1 查找 → 未撤销且未过期
      → 签发新 access_token + 新 refresh_token（旋转）
      → 撤销旧 refresh_token
    → refresh_token 无效 → 401, 需重新登录
```

#### 登出流程

```
POST /api/auth/logout
  → D1 撤销该用户的所有 refresh_token (revoked = true)
  → 清除 access_token + refresh_token Cookie
  → access_token 最多 15 分钟内自然过期（可接受的安全窗口）
```

---

## 九、前端改动清单

### 9.1 新建页面

| 文件 | 说明 |
|------|------|
| `src/pages/auth/register.astro` | 注册页 |
| `src/pages/auth/callback.astro` | OAuth 回调中转页 |
| `src/pages/auth/verify.astro` | 邮箱验证结果页 |
| `src/pages/auth/onboarding.astro` | 首次登录引导页 |

### 9.2 新建组件

| 文件 | 说明 |
|------|------|
| `src/components/auth/LoginForm.tsx` | 登录表单 (React) |
| `src/components/auth/RegisterForm.tsx` | 注册表单 (React) |
| `src/components/auth/OAuthButtons.tsx` | 社交登录按钮组 |
| `src/components/auth/OnboardingWizard.tsx` | 引导向导 (React) |

### 9.3 修改文件

| 文件 | 改动 |
|------|------|
| `src/stores/auth.ts` | 增加 `initAuth()`, `fetchUser()`, 自动从 cookie 恢复登录状态 |
| `src/stores/favorites.ts` | Phase 2: 登录时从服务端拉取收藏，merge localStorage |
| `src/components/nav/` | 显示用户头像/登录按钮 |
| `src/pages/auth/login.astro` | 替换为使用 `LoginForm.tsx` |

### 9.4 环境变量 (.env)

```env
# Auth
JWT_SECRET=your_jwt_secret_here
AUTH_COOKIE_DOMAIN=.sakamichi-tools.cn

# Discord OAuth
DISCORD_CLIENT_ID=xxx
DISCORD_CLIENT_SECRET=xxx
DISCORD_REDIRECT_URI=https://sakamichi-tools.cn/api/auth/callback/discord

# Google OAuth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://sakamichi-tools.cn/api/auth/callback/google

# Email (Resend)
RESEND_API_KEY=xxx
EMAIL_FROM=noreply@sakamichi-tools.cn
```

---

## 十、实施计划

### Step 1: 后端 Auth API (Workers)
- D1 建表
- 邮箱注册 / 登录 / 验证 / me 端点
- JWT 签发与校验中间件

### Step 2: 前端登录/注册页面
- LoginForm.tsx + RegisterForm.tsx
- 接通后端 API
- auth store 增加 initAuth / fetchUser

### Step 3: Discord + Google OAuth
- Workers 端 OAuth 流程
- 前端 OAuthButtons.tsx
- callback 页面

### Step 4: 首次登录引导页
- OnboardingWizard.tsx
- 推しメン / 気になるメンバー 选择
- 自动加入收藏

### Step 5: 导航栏用户状态
- 已登录: 显示头像 + 下拉菜单
- 未登录: 显示登录按钮

---

## 十一、安全注意事项

- 密码 bcrypt 哈希，salt rounds ≥ 10
- JWT 存 HttpOnly cookie，前端 JS 不可读
- OAuth state 参数防 CSRF
- Refresh Token 旋转：每次刷新签发新 token，旧 token 立即撤销
- 验证邮件 token 一次性，24h 过期

### 限流策略

> **不在 Worker 代码中用 KV 做计数器**（浪费读写额度 + 增加延迟）。
> 使用 **Cloudflare WAF Rate Limiting Rules**，在 CDN 边缘直接拦截，Worker 无感知。

在 Cloudflare Dashboard → Security → WAF → Rate limiting rules 中配置：

| 规则 | 匹配条件 | 限制 |
|------|---------|------|
| 注册限流 | `URI Path = /api/auth/register` | 同 IP 每小时最多 5 次请求 |
| 登录限流 | `URI Path = /api/auth/login` | 同 IP 每分钟最多 10 次请求 |
| OAuth 限流 | `URI Path contains /api/auth/callback` | 同 IP 每分钟最多 10 次请求 |
| 全局 API 限流 | `URI Path begins with /api/` | 同 IP 每分钟最多 60 次请求 |

动作：超限后返回 429 Too Many Requests，持续时间 10 秒 ~ 1 分钟。
