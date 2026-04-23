# 付费门控方案 — MSG 归档

## 目标

完成 **付费 → 解锁权限** 的完整链路，以 MSG 归档为首个门控对象。
- 当前 MSG **暂时对所有人开放**（feature flag 控制）
- 正式启用时只需翻一个开关
- 其他内容（博客、广播、视频等）沿用相同架构，后续按需接入

## 现有基础（已完成）

- ✅ Ko-fi Webhook 自动创建订阅 (`webhook-kofi.ts`)
- ✅ 邀请码兑换订阅 (`invite-codes.ts`)
- ✅ 管理员手动关联未匹配付款 (`admin-payments.ts`)
- ✅ D1 表结构 (`user_subscriptions`, `user_payment_links`, `unmatched_payments`)
- ✅ 前端用户中心显示订阅状态 (`UserDashboard.tsx`)
- ✅ 前端管理员后台管理订阅 (`AdminDashboard.tsx`)

## 需要新增

### 1. 后端：订阅检查中间件（`sakamichi-auth` Worker）

**新增路由** `GET /api/user/access`

```ts
// 返回当前用户的访问权限
{
  "success": true,
  "data": {
    "authenticated": true,
    "subscription": {
      "active": true,
      "plan": "all_groups",        // all_groups | single_sakurazaka | single_hinatazaka | lifetime
      "expiresAt": "2027-04-17T00:00:00Z" | null
    },
    "access": {
      "msg_archive": true,         // 是否可访问 MSG 归档
      "radio": true,               // 预留：广播
      "video": true,               // 预留：视频
    }
  }
}
```

**访问权限判定逻辑**:
```
msg_archive:
  - subscription active + plan in [all_groups, single_sakurazaka, single_hinatazaka, lifetime] → true
  - 或 FEATURE_FLAG: MSG_OPEN_ACCESS = true → true（当前默认开）
  - 否则 → false

radio / video:
  - 暂时全部 true（不做门控）
```

**Feature Flag**: 通过 Worker 环境变量 `MSG_OPEN_ACCESS` 控制。
- `true`（当前）: 所有人可访问 MSG，不检查订阅
- `false`（正式启用时）: 必须有有效订阅才能访问

### 2. 后端：MSG 归档 API 门控（`msg-archive` Worker）

`msg-archive` Worker 是独立的，不在 `sakamichi-auth` 里。
两种方案：

- **方案 A（推荐）: 前端门控 + 后端不改**
  - 前端在请求 msg-archive API 前先检查 `/api/user/access`
  - 如果无权限，前端直接显示付费提示，不发起 API 请求
  - 优点：msg-archive Worker 不需要改动，简单
  - 缺点：技术上可以绕过（直接调 API）

- **方案 B: 后端也加验证**
  - msg-archive Worker 验证 JWT token + 订阅状态
  - 需要 msg-archive 能访问 auth Worker 的 D1 或通过 Service Binding 调用
  - 更安全但改动大

**建议先用方案 A**，前端门控足够。MSG 内容不是高敏感数据，前端挡一下就行。

### 3. 前端：PaywallGate 组件

```tsx
// 通用付费门控 HOC
<PaywallGate feature="msg_archive" fallback={<MsgPaywall />}>
  <MsgArchive />
</PaywallGate>
```

**PaywallGate 逻辑**:
1. 调 `/api/user/access` 获取权限
2. 缓存结果到 nanostores（避免重复请求）
3. 如果有权限 → 渲染子组件
4. 如果无权限 → 渲染 fallback（付费提示页）
5. 如果未登录 → 显示登录提示

### 4. 前端：MsgPaywall 付费提示页

未付费用户看到的页面，包含：
- 说明 MSG 归档是什么
- 订阅方案说明（沿用现有 plan 分层）
- Ko-fi 订阅链接
- 邀请码输入框
- 已登录但未付费 vs 未登录 的不同展示

### 5. 前端：access store（nanostores）

```ts
// stores/access.ts
export const $access = atom<AccessState>({
  loaded: false,
  authenticated: false,
  subscription: null,
  access: { msg_archive: false, radio: true, video: true },
});
```

在 app 初始化时 fetch 一次，缓存 5 分钟。

## 实现步骤

| # | 任务 | 文件 |
|---|------|------|
| 1 | 后端新增 `/api/user/access` 路由 | `workers/auth/src/routes/access.ts` |
| 2 | 后端添加 `MSG_OPEN_ACCESS` 环境变量 | `workers/auth/wrangler.toml` |
| 3 | 前端新增 access store | `src/stores/access.ts` |
| 4 | 前端新增 PaywallGate 组件 | `src/components/shared/PaywallGate.tsx` |
| 5 | 前端新增 MsgPaywall 页面 | `src/components/messages/MsgPaywall.tsx` |
| 6 | 接入 MsgArchive | `src/pages/messages/index.astro` |
| 7 | 过期订阅自动降级 Cron | `workers/auth/src/cron/expire-subs.ts`（已有？确认） |

## 上线流程

1. 部署全部代码，`MSG_OPEN_ACCESS=true`（所有人可访问）
2. 测试付费链路：Ko-fi 付款 → Webhook → 订阅激活 → access API 返回 true
3. 测试门控：手动将 flag 改为 false → 验证未付费用户被拦截
4. 正式上线：翻 flag

## 不改的部分

- 博客翻译 — 永久免费
- 数据统计/关系分析 — 永久免费
- 广播/视频 — 当前不加门控（保持 GeoPassGate）
- MSG 推送到 QQ/TG/Discord — 不受影响（那是服务端推送）
