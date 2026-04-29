# 会员系统 + Discord 联动 — 完整技术实现文档

> 目标：前端选方案页 → Ko-fi / Stripe 双通道付款 → D1 订阅 → Discord 分级身份组 + DM + 频道日志；到期自动移除。
> 全部后端逻辑在 sakamichi-auth Worker 内完成，零额外服务器。
>
> **状态：待实施（仅文档，未写代码）**
> **创建日期：2026-04-28**

---

## 目录

1. [方案概览](#方案概览)
2. [Phase 1：Discord 服务器配置](#phase-1discord-服务器配置手动操作)
3. [Phase 2：Ko-fi Tiers 配置](#phase-2ko-fi-tiers-配置手动操作)
4. [Phase 3：Stripe 配置](#phase-3stripe-配置手动操作)
5. [Phase 4：后端代码实现](#phase-4后端代码实现sakamichi-auth-worker)
6. [Phase 5：前端页面](#phase-5前端页面sakamichi-platform)
7. [Phase 6：部署](#phase-6部署)
8. [Phase 7：测试](#phase-7测试)
9. [Phase 8：MSG 推送到 Discord](#phase-8msg-推送到-discord可选)
10. [附录：需要记录的值](#附录需要记录的值)

---

## 方案概览

### 订阅方案 (plan)

| plan | 价格参考 | Discord 身份组 | 可见频道 |
|------|---------|---------------|---------|
| `single_nogizaka` | ¥X/月 | 赞助者-乃木坂 | 乃木坂专属频道 |
| `single_sakurazaka` | ¥X/月 | 赞助者-櫻坂 | 櫻坂专属频道 |
| `single_hinatazaka` | ¥X/月 | 赞助者-日向坂 | 日向坂专属频道 |
| `all_groups` | ¥Y/月 | 上述三个全给 | 全部专属频道 |
| `lifetime` | ¥Z 一次性 | 上述三个全给 | 全部专属频道（永久） |

### 支付通道

| 通道 | 适合用户 | 实现难度 |
|------|---------|---------|
| **Ko-fi** | 海外用户（PayPal/信用卡） | ⭐ 已有 webhook，只需建 tier |
| **Stripe** | 全球用户（信用卡/Apple Pay/Google Pay） | ⭐⭐ 需新写 webhook-stripe.ts |

### 现有基础设施

| 组件 | 位置 | 状态 |
|------|------|------|
| Ko-fi Webhook | `workers/auth/src/routes/webhook-kofi.ts` | ✅ 已有，含 `mapKofiPlan()` |
| Discord OAuth 登录 | `workers/auth/src/routes/oauth.ts` | ✅ 已有，`user_oauth` 存 Discord ID |
| D1 订阅表 | `user_subscriptions` | ✅ 已有，含 plan/status/expires_at |
| Cron 过期清理 | `workers/auth/src/index.ts` `scheduled()` | ✅ 已有，每日 03:00 UTC |
| 前端用户仪表盘 | `src/components/user/UserDashboard.tsx` | ✅ 已有 `SubscriptionCard` |
| Stripe 配置文档 | `项目配置文档相关/支付/STRIPE_CONFIG.md` | ✅ 已有 |

---

## Phase 1：Discord 服务器配置（手动操作）

### Step 1：创建 Discord 服务器

建一个专用服务器（如「46log Community」）。

### Step 2：创建身份组（3 个赞助者组）

Discord 服务器设置 → 身份组：

| 身份组名 | 颜色建议 | 说明 |
|---------|---------|------|
| `赞助者-乃木坂` | 🟣 紫色 | 乃木坂单团订阅者 |
| `赞助者-櫻坂` | 🌸 粉色 | 櫻坂单团订阅者 |
| `赞助者-日向坂` | 🔵 蓝色 | 日向坂单团订阅者 |

> ⚠️ Bot 身份组（邀请 Bot 后自动创建）必须在赞助者身份组**上方**，否则 Bot 无法管理这些身份组。

### Step 3：创建频道结构

```
── 📢 公共区 ──                        (所有人可见)
  #公告
  #自我介绍
  #闲聊

── 🔒 管理区 ──                        (仅管理员可见)
  #支付日志                            ← Bot 发订阅事件

── 🟣 乃木坂专属 ──                     (仅 赞助者-乃木坂 可见)
  #乃木坂-msg
  #乃木坂-博客
  #乃木坂-闲聊

── 🌸 櫻坂专属 ──                       (仅 赞助者-櫻坂 可见)
  #櫻坂-msg
  #櫻坂-博客
  #櫻坂-闲聊

── 🔵 日向坂专属 ──                     (仅 赞助者-日向坂 可见)
  #日向坂-msg
  #日向坂-博客
  #日向坂-闲聊
```

频道权限设置：每个专属分区 → 编辑权限 → `@everyone` ❌ 查看频道 → 对应身份组 ✅ 查看频道。

### Step 4：记录 ID

开启 Discord 开发者模式（设置 → 高级 → 开发者模式），右键复制 ID。

### Step 5：创建 Discord Bot

1. 打开 [Discord Developer Portal](https://discord.com/developers/applications)
2. **推荐**：使用已有的 Application（`DISCORD_CLIENT_ID` 对应的），在其 Bot 页面开启 Bot
3. **Bot 页面**：Reset Token → 复制 Bot Token → 关闭 Public Bot → 开启 Server Members Intent
4. **OAuth2 页面**：Scopes `bot` → Permissions `Manage Roles` + `Send Messages` → 复制邀请链接 → 授权到服务器

---

## Phase 2：Ko-fi Tiers 配置（手动操作）

### Step 6：在 Ko-fi 创建订阅档位

登录 [Ko-fi](https://ko-fi.com/) → 你的页面 → **Tiers**：

| Tier 名称 | 价格 | 对应 plan |
|-----------|------|----------|
| `乃木坂46 Monthly` | ¥X/月 | `single_nogizaka` |
| `櫻坂46 Monthly` | ¥X/月 | `single_sakurazaka` |
| `日向坂46 Monthly` | ¥X/月 | `single_hinatazaka` |
| `All Groups Monthly` | ¥Y/月 | `all_groups` |
| `Lifetime All Groups` | ¥Z 一次性 | `lifetime` |

> `webhook-kofi.ts` 已有 `mapKofiPlan()` 通过 `tier_name` 关键词映射 plan（nogizaka/sakurazaka/hinata/all/lifetime）。

---

## Phase 3：Stripe 配置（手动操作）

### Step 7：Stripe Dashboard 创建产品和价格

登录 [Stripe Dashboard](https://dashboard.stripe.com/) → Products → 创建 5 个 Price（参考 `STRIPE_CONFIG.md`）。

### Step 8：配置 Stripe Webhook

Endpoint URL: `https://api.46log.com/api/webhook/stripe`
Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

---

## Phase 4：后端代码实现（sakamichi-auth Worker）

> 所有文件路径相对于 `sakamichi-platform/workers/auth/`

### 4.1 修改 `src/types.ts` — 新增 Env 字段

```typescript
// ── 在 Env interface 中新增 ──

// Discord Bot（与已有的 DISCORD_CLIENT_ID/SECRET 不同，Bot Token 用于服务端操作）
DISCORD_BOT_TOKEN: string;
DISCORD_GUILD_ID: string;
DISCORD_ROLE_NOGIZAKA: string;
DISCORD_ROLE_SAKURAZAKA: string;
DISCORD_ROLE_HINATAZAKA: string;
DISCORD_LOG_CHANNEL_ID: string;

// Stripe
STRIPE_SECRET_KEY: string;
STRIPE_WEBHOOK_SECRET: string;
STRIPE_PRICE_NOGIZAKA: string;
STRIPE_PRICE_SAKURAZAKA: string;
STRIPE_PRICE_HINATAZAKA: string;
STRIPE_PRICE_ALL: string;
STRIPE_PRICE_LIFETIME: string;
```

位置：紧跟现有的 `KOFI_VERIFICATION_TOKEN` 之后。

---

### 4.2 新建 `src/utils/discord-bot.ts` — Discord Bot 工具模块

```typescript
import type { Env } from '../types';

const DISCORD_API = 'https://discord.com/api/v10';

// ── Plan → Role ID 映射 ──

export function getRolesForPlan(env: Env, plan: string): string[] {
  switch (plan) {
    case 'single_nogizaka':   return [env.DISCORD_ROLE_NOGIZAKA];
    case 'single_sakurazaka': return [env.DISCORD_ROLE_SAKURAZAKA];
    case 'single_hinatazaka': return [env.DISCORD_ROLE_HINATAZAKA];
    case 'all_groups':
    case 'lifetime':
      return [env.DISCORD_ROLE_NOGIZAKA, env.DISCORD_ROLE_SAKURAZAKA, env.DISCORD_ROLE_HINATAZAKA];
    default:
      return [env.DISCORD_ROLE_NOGIZAKA, env.DISCORD_ROLE_SAKURAZAKA, env.DISCORD_ROLE_HINATAZAKA];
  }
}

// ── 基础 API 请求 ──

async function discordApi(env: Env, path: string, method = 'GET', body?: unknown): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${DISCORD_API}${path}`, opts);
}

// ── 身份组操作 ──

export async function addRolesForPlan(env: Env, discordUserId: string, plan: string): Promise<void> {
  const roles = getRolesForPlan(env, plan);
  for (const roleId of roles) {
    const res = await discordApi(
      env,
      `/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`,
      'PUT'
    );
    if (!res.ok) {
      console.error(`[Discord] Failed to add role ${roleId} to ${discordUserId}: ${res.status}`);
    }
  }
}

export async function removeRolesForPlan(env: Env, discordUserId: string, plan: string): Promise<void> {
  const roles = getRolesForPlan(env, plan);
  for (const roleId of roles) {
    const res = await discordApi(
      env,
      `/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`,
      'DELETE'
    );
    if (!res.ok) {
      console.error(`[Discord] Failed to remove role ${roleId} from ${discordUserId}: ${res.status}`);
    }
  }
}

// ── DM 发送 ──

export async function sendDM(env: Env, discordUserId: string, content: string): Promise<void> {
  try {
    // 1. 创建 DM channel
    const channelRes = await discordApi(env, '/users/@me/channels', 'POST', {
      recipient_id: discordUserId,
    });
    if (!channelRes.ok) {
      console.error(`[Discord] Failed to create DM channel for ${discordUserId}: ${channelRes.status}`);
      return;
    }
    const channel = await channelRes.json() as { id: string };

    // 2. 发送消息
    const msgRes = await discordApi(env, `/channels/${channel.id}/messages`, 'POST', { content });
    if (!msgRes.ok) {
      console.error(`[Discord] Failed to send DM to ${discordUserId}: ${msgRes.status}`);
    }
  } catch (err) {
    // DM 可能因为用户隐私设置而失败，不影响主流程
    console.error(`[Discord] DM error for ${discordUserId}:`, err);
  }
}

// ── 频道 Embed 日志 ──

interface SubscriptionLogData {
  type?: 'new' | 'renewed' | 'expired' | 'cancelled';
  user?: string;
  discordId: string;
  plan: string;
  expiresAt?: string | null;
  amount?: string;
  paymentMethod?: string;
}

const PLAN_LABELS: Record<string, string> = {
  all_groups: '全坂道',
  single_nogizaka: '乃木坂46',
  single_sakurazaka: '櫻坂46',
  single_hinatazaka: '日向坂46',
  lifetime: '终身会员',
};

export async function postSubscriptionLog(env: Env, data: SubscriptionLogData): Promise<void> {
  const eventType = data.type || 'new';
  const colorMap: Record<string, number> = {
    new: 0x22c55e,       // green
    renewed: 0x3b82f6,   // blue
    expired: 0xf59e0b,   // amber
    cancelled: 0xef4444,  // red
  };

  const titleMap: Record<string, string> = {
    new: '✅ 新订阅',
    renewed: '🔄 续费',
    expired: '⏰ 订阅过期',
    cancelled: '❌ 订阅取消',
  };

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: '方案', value: PLAN_LABELS[data.plan] || data.plan, inline: true },
  ];

  if (data.user) {
    fields.unshift({ name: '用户', value: data.user, inline: true });
  }
  fields.push({ name: 'Discord', value: `<@${data.discordId}>`, inline: true });

  if (data.expiresAt) {
    const d = new Date(data.expiresAt);
    // JST (UTC+9) 格式化
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const formatted = `${jst.getFullYear()}/${String(jst.getMonth() + 1).padStart(2, '0')}/${String(jst.getDate()).padStart(2, '0')} ${String(jst.getHours()).padStart(2, '0')}:${String(jst.getMinutes()).padStart(2, '0')} JST`;
    fields.push({ name: '到期时间', value: formatted, inline: true });
  } else if (eventType === 'new') {
    fields.push({ name: '到期时间', value: '永久', inline: true });
  }

  if (data.amount) {
    fields.push({ name: '金额', value: data.amount, inline: true });
  }
  if (data.paymentMethod) {
    fields.push({ name: '支付方式', value: data.paymentMethod, inline: true });
  }

  const embed = {
    title: titleMap[eventType] || '📝 订阅事件',
    color: colorMap[eventType] || 0x6b7280,
    fields,
    timestamp: new Date().toISOString(),
  };

  const res = await discordApi(env, `/channels/${env.DISCORD_LOG_CHANNEL_ID}/messages`, 'POST', {
    embeds: [embed],
  });
  if (!res.ok) {
    console.error(`[Discord] Failed to post log: ${res.status}`);
  }
}

// ── 查询用户 Discord ID ──

export async function getDiscordIdForUser(env: Env, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT provider_id FROM user_oauth WHERE user_id = ? AND provider = 'discord'"
  ).bind(userId).first<{ provider_id: string }>();
  return row?.provider_id || null;
}
```

---

### 4.3 新建 `src/routes/webhook-stripe.ts` — Stripe Webhook 处理

```typescript
import type { Env, UserRow } from '../types';
import { addRolesForPlan, getDiscordIdForUser, postSubscriptionLog, sendDM } from '../utils/discord-bot';

// ── Stripe Webhook 签名验证（不用 stripe npm 包，纯 Web Crypto） ──

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k, v];
    }),
  );
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // 防重放：签名时间 5 分钟内
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return expected === signature;
}

// ── Price ID → Plan 映射 ──

function mapStripePlan(env: Env, priceId: string): string {
  if (priceId === env.STRIPE_PRICE_NOGIZAKA) return 'single_nogizaka';
  if (priceId === env.STRIPE_PRICE_SAKURAZAKA) return 'single_sakurazaka';
  if (priceId === env.STRIPE_PRICE_HINATAZAKA) return 'single_hinatazaka';
  if (priceId === env.STRIPE_PRICE_ALL) return 'all_groups';
  if (priceId === env.STRIPE_PRICE_LIFETIME) return 'lifetime';
  return 'all_groups';
}

// ── Webhook 主入口 ──

export async function handleStripeWebhook(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  const sig = req.headers.get('Stripe-Signature') || '';

  const valid = await verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error('[Stripe] Invalid webhook signature');
    return new Response('Invalid signature', { status: 400 });
  }

  let event: {
    id: string;
    type: string;
    data: { object: Record<string, any> };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  console.log(`[Stripe] Received event: ${event.type} (${event.id})`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(env, event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(env, event.data.object);
      break;
    case 'invoice.payment_succeeded':
      // 续费成功，更新到期时间
      await handleInvoiceSucceeded(env, event.data.object);
      break;
    case 'invoice.payment_failed':
      console.warn(`[Stripe] Payment failed for customer ${event.data.object.customer}`);
      break;
  }

  return new Response('OK', { status: 200 });
}

// ── checkout.session.completed ──

async function handleCheckoutCompleted(env: Env, session: Record<string, any>): Promise<void> {
  // metadata 中包含 userId 和 plan（在 Checkout Session 创建时设置）
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan || mapStripePlan(env, session.line_items?.data?.[0]?.price?.id || '');
  const customerId = session.customer;
  const subscriptionId = session.subscription; // null if one-time

  if (!userId) {
    console.error('[Stripe] checkout.session.completed without userId in metadata');
    // 存入未匹配表
    await env.DB.prepare(
      `INSERT INTO unmatched_payments (id, platform, order_id, platform_user_id, amount, remark, raw_data, created_at)
       VALUES (hex(randomblob(16)), 'stripe', ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      session.id,
      session.customer_email || customerId || '',
      String((session.amount_total || 0) / 100),
      `plan: ${plan}`,
      JSON.stringify(session)
    ).run();
    return;
  }

  // 幂等检查
  const existing = await env.DB.prepare(
    "SELECT id FROM user_subscriptions WHERE payment_ref = ? AND payment_method = 'stripe'"
  ).bind(session.id).first();
  if (existing) return;

  // 验证用户存在
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
  if (!user) {
    console.error(`[Stripe] User ${userId} not found`);
    return;
  }

  // 计算到期时间
  const isLifetime = plan === 'lifetime';
  let expiresAt: string | null = null;
  if (!isLifetime && subscriptionId) {
    // Stripe subscription: 让 Stripe 管理续费周期，这里设一个月后
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    expiresAt = d.toISOString();
  }

  const amountCents = session.amount_total || 0;
  const currency = session.currency || 'jpy';

  // 创建订阅
  await env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan, status, payment_method, payment_ref, amount_cents, currency, paid_at, expires_at, notes, created_at, updated_at)
     VALUES (hex(randomblob(16)), ?, ?, 'active', 'stripe', ?, ?, ?, datetime('now'), ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    userId,
    plan,
    session.id,
    amountCents,
    currency,
    expiresAt,
    subscriptionId ? `stripe_sub:${subscriptionId}` : null
  ).run();

  // 升级用户状态（同 webhook-kofi.ts 逻辑）
  await env.DB.prepare(
    `UPDATE users SET payment_status = 'active', geo_status = 'approved',
     role = CASE WHEN role IN ('translator', 'admin') THEN role ELSE 'verified' END,
     updated_at = datetime('now')
     WHERE id = ?`
  ).bind(userId).run();

  console.log(`[Stripe] Activated subscription for user ${userId}, plan=${plan}`);

  // Discord 联动
  const discordId = await getDiscordIdForUser(env, userId);
  if (discordId) {
    await addRolesForPlan(env, discordId, plan);
    await sendDM(env, discordId,
      `✅ 订阅已激活！\n方案：${plan}\n到期：${expiresAt ? new Date(expiresAt).toLocaleDateString('ja-JP') : '永久'}`
    );
    await postSubscriptionLog(env, {
      type: 'new',
      user: user.display_name || user.email,
      discordId,
      plan,
      expiresAt,
      amount: `${amountCents / 100} ${currency.toUpperCase()}`,
      paymentMethod: 'Stripe',
    });
  }
}

// ── customer.subscription.deleted ──

async function handleSubscriptionDeleted(env: Env, subscription: Record<string, any>): Promise<void> {
  const stripeSubId = subscription.id;

  // 查找包含此 subscription ID 的记录
  const sub = await env.DB.prepare(
    "SELECT us.*, u.display_name, u.email FROM user_subscriptions us JOIN users u ON us.user_id = u.id WHERE us.notes LIKE ? AND us.status = 'active'"
  ).bind(`%stripe_sub:${stripeSubId}%`).first<any>();

  if (!sub) {
    console.warn(`[Stripe] subscription.deleted: no matching active sub for ${stripeSubId}`);
    return;
  }

  // 标记过期
  await env.DB.prepare(
    "UPDATE user_subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).bind(sub.id).run();

  console.log(`[Stripe] Cancelled subscription ${sub.id} for user ${sub.user_id}`);

  // Discord 移除身份组
  const discordId = await getDiscordIdForUser(env, sub.user_id);
  if (discordId) {
    const { removeRolesForPlan } = await import('../utils/discord-bot');
    await removeRolesForPlan(env, discordId, sub.plan);
    await postSubscriptionLog(env, {
      type: 'cancelled',
      user: sub.display_name || sub.email,
      discordId,
      plan: sub.plan,
    });
  }
}

// ── invoice.payment_succeeded（续费） ──

async function handleInvoiceSucceeded(env: Env, invoice: Record<string, any>): Promise<void> {
  const stripeSubId = invoice.subscription;
  if (!stripeSubId) return; // one-time payment, skip

  const sub = await env.DB.prepare(
    "SELECT us.*, u.display_name, u.email FROM user_subscriptions us JOIN users u ON us.user_id = u.id WHERE us.notes LIKE ? AND us.status = 'active'"
  ).bind(`%stripe_sub:${stripeSubId}%`).first<any>();

  if (!sub) return;

  // 延长到期时间
  const newExpires = new Date();
  newExpires.setMonth(newExpires.getMonth() + 1);

  await env.DB.prepare(
    "UPDATE user_subscriptions SET expires_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newExpires.toISOString(), sub.id).run();

  console.log(`[Stripe] Renewed subscription ${sub.id} until ${newExpires.toISOString()}`);

  // Discord 日志
  const discordId = await getDiscordIdForUser(env, sub.user_id);
  if (discordId) {
    await sendDM(env, discordId,
      `🔄 订阅已续费！到期：${newExpires.toLocaleDateString('ja-JP')}`
    );
    await postSubscriptionLog(env, {
      type: 'renewed',
      user: sub.display_name || sub.email,
      discordId,
      plan: sub.plan,
      expiresAt: newExpires.toISOString(),
      paymentMethod: 'Stripe',
    });
  }
}
```

---

### 4.4 新建 `src/routes/stripe-checkout.ts` — 创建 Checkout Session

```typescript
import type { Env } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, json } from '../utils/response';

function getCookie(req: Request, name: string): string | null {
  const h = req.headers.get('Cookie');
  if (!h) return null;
  const m = h.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}

// POST /api/webhook/stripe-checkout
// Body: { plan: string }
// Returns: { url: string } — Stripe Checkout URL to redirect to
export async function handleCreateCheckoutSession(req: Request, env: Env): Promise<Response> {
  // 需要登录
  const token = getCookie(req, 'access_token') || req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return error('Unauthorized', 401);
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) return error('Unauthorized', 401);

  const userId = payload.sub;
  let body: { plan?: string };
  try { body = await req.json(); } catch { return error('Invalid body', 400); }

  const plan = body.plan;
  if (!plan) return error('plan required', 400);

  // Plan → Price ID 映射
  const priceMap: Record<string, string> = {
    single_nogizaka: env.STRIPE_PRICE_NOGIZAKA,
    single_sakurazaka: env.STRIPE_PRICE_SAKURAZAKA,
    single_hinatazaka: env.STRIPE_PRICE_HINATAZAKA,
    all_groups: env.STRIPE_PRICE_ALL,
    lifetime: env.STRIPE_PRICE_LIFETIME,
  };

  const priceId = priceMap[plan];
  if (!priceId) return error('Invalid plan', 400);

  const isLifetime = plan === 'lifetime';

  // 获取用户 email
  const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
    .bind(userId).first<{ email: string }>();

  // 使用 Stripe REST API 创建 Checkout Session（不依赖 stripe npm 包）
  const params = new URLSearchParams();
  params.set('mode', isLifetime ? 'payment' : 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('metadata[userId]', userId);
  params.set('metadata[plan]', plan);
  params.set('success_url', 'https://46log.com/user?payment=success');
  params.set('cancel_url', 'https://46log.com/pricing?payment=cancelled');
  if (user?.email) {
    params.set('customer_email', user.email);
  }

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!stripeRes.ok) {
    const err = await stripeRes.text();
    console.error('[Stripe] Checkout Session creation failed:', err);
    return error('Failed to create checkout session', 500);
  }

  const session = await stripeRes.json() as { url: string };
  return json({ success: true, url: session.url });
}
```

---

### 4.5 修改 `src/routes/webhook-kofi.ts` — 加入 Discord 联动

在现有 `handleKofiWebhook` 的**末尾**（`console.log(...); return ...` 之前），插入：

```typescript
// 位置：紧跟 Step 6 "Upgrade user status" 之后

// 7. Discord 联动
try {
  const { addRolesForPlan, getDiscordIdForUser, sendDM, postSubscriptionLog } = await import('../utils/discord-bot');
  const discordId = await getDiscordIdForUser(env, platformUser.id);
  if (discordId) {
    await addRolesForPlan(env, discordId, plan);
    await sendDM(env, discordId,
      `✅ 订阅已激活！\n方案：${plan}\n到期：${expiresAt ? new Date(expiresAt).toLocaleDateString('ja-JP') : '永久'}`
    );
    await postSubscriptionLog(env, {
      type: 'new',
      user: platformUser.display_name || platformUser.email,
      discordId,
      plan,
      expiresAt,
      amount: `${body.amount} ${body.currency}`,
      paymentMethod: 'Ko-fi',
    });
  }
} catch (err) {
  // Discord 联动失败不影响主流程
  console.error('[Ko-fi] Discord integration error:', err);
}
```

---

### 4.6 修改 `src/index.ts` — Cron + 路由

#### 4.6.1 新增 import

```typescript
// 在文件顶部的 import 区新增
import { handleStripeWebhook } from './routes/webhook-stripe';
import { handleCreateCheckoutSession } from './routes/stripe-checkout';
import { removeRolesForPlan, getDiscordIdForUser, postSubscriptionLog } from './utils/discord-bot';
```

#### 4.6.2 新增路由

```typescript
// 在 webhook routes 区域（约 L138-139），紧跟 kofi webhook 之后
} else if (path === '/api/webhook/stripe' && method === 'POST') {
  res = await handleStripeWebhook(req, env);
} else if (path === '/api/webhook/stripe-checkout' && method === 'POST') {
  res = await handleCreateCheckoutSession(req, env);
```

#### 4.6.3 修改 `scheduled()` — 过期前移除 Discord 身份组

在现有的 `// 1. Expire overdue subscriptions` **之前**插入：

```typescript
// 0. 查询即将过期的用户并移除 Discord 身份组
try {
  const aboutToExpire = await env.DB.prepare(`
    SELECT us.user_id, us.plan, uo.provider_id AS discord_id
    FROM user_subscriptions us
    JOIN user_oauth uo ON us.user_id = uo.user_id AND uo.provider = 'discord'
    WHERE us.status = 'active' AND us.expires_at IS NOT NULL AND us.expires_at < datetime('now')
  `).all();

  for (const row of aboutToExpire.results as any[]) {
    try {
      await removeRolesForPlan(env, row.discord_id, row.plan);
      await postSubscriptionLog(env, {
        type: 'expired',
        discordId: row.discord_id,
        plan: row.plan,
      });
    } catch (err) {
      console.error(`[Cron] Discord role removal failed for ${row.discord_id}:`, err);
    }
  }
  console.log(`[Cron] Processed ${aboutToExpire.results.length} Discord role removals`);
} catch (err) {
  console.error('[Cron] Discord expiry check failed:', err);
}

// 1. Expire overdue subscriptions (原有代码)
```

---

### 4.7 同步修改 `src/routes/admin-payments.ts` — 手动解决付款时也联动 Discord

在 `handleResolveUnmatchedPayment` 的 "Upgrade user" 部分之后加入同样的 Discord 联动逻辑（加身份组+日志）。

---

## Phase 5：前端页面（sakamichi-platform）

### 5.1 新建 `src/pages/pricing.astro` — 定价页面

```astro
---
import MainLayout from '@/layouts/MainLayout.astro';
---
<MainLayout title="订阅方案 - 46log" description="选择订阅方案">
  <div id="pricing-root">
    <!-- React island: PricingPage -->
  </div>
  <script>
    // Astro client:load island or plain JS
  </script>
</MainLayout>
```

### 5.2 新建 `src/components/pricing/PricingPage.tsx` — 方案卡片

核心 UI 结构：

```tsx
// 5 张方案卡片，每张包含：
// - 方案名称 + 价格
// - 权益列表（可见频道/MSG 团体等）
// - 两个按钮：
//   「Ko-fi 支付」→ window.open(kofiTierUrl)
//   「信用卡支付」→ POST /api/webhook/stripe-checkout → redirect(session.url)

const PLANS = [
  {
    id: 'single_nogizaka',
    name: '乃木坂46',
    price: '¥X/月',
    color: '#7B2D8E',
    perks: ['乃木坂 MSG 消息存档', '乃木坂 Discord 专属频道'],
    kofiUrl: 'https://ko-fi.com/srzwyuu/tiers#TODO',
  },
  // ... sakurazaka, hinatazaka, all_groups, lifetime
];

// handleStripeCheckout:
async function handleStripeCheckout(plan: string) {
  const res = await fetch('https://api.46log.com/api/webhook/stripe-checkout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  const data = await res.json();
  if (data.url) {
    window.location.href = data.url;
  }
}
```

### 5.3 修改 `UserDashboard.tsx` `SubscriptionCard`

将 "前往 Ko-fi 订阅" 按钮改为 "查看订阅方案"，链接到 `/pricing`：

```tsx
// 原来的：
<a href="https://ko-fi.com/srzwyuu" ...>前往 Ko-fi 订阅</a>

// 改为：
<a href="/pricing" ...>查看订阅方案</a>
```

已订阅时增加显示 Discord 绑定状态提示。

---

## Phase 6：部署

### 6.1 设置 Worker Secrets

```bash
cd sakamichi-platform/workers/auth

# Discord Bot
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_GUILD_ID
wrangler secret put DISCORD_ROLE_NOGIZAKA
wrangler secret put DISCORD_ROLE_SAKURAZAKA
wrangler secret put DISCORD_ROLE_HINATAZAKA
wrangler secret put DISCORD_LOG_CHANNEL_ID

# Stripe
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_PRICE_NOGIZAKA
wrangler secret put STRIPE_PRICE_SAKURAZAKA
wrangler secret put STRIPE_PRICE_HINATAZAKA
wrangler secret put STRIPE_PRICE_ALL
wrangler secret put STRIPE_PRICE_LIFETIME
```

### 6.2 部署 Worker

```bash
cd sakamichi-platform/workers/auth
npx wrangler deploy
```

### 6.3 部署前端

```bash
cd sakamichi-platform
npm run build
npx wrangler pages deploy dist --project-name sakamichi-platform --branch=sakamichi-platform
```

---

## Phase 7：测试

### 7.1 Discord Bot 基础测试

```bash
# Bot Token 有效性
curl -H "Authorization: Bot YOUR_BOT_TOKEN" https://discord.com/api/v10/users/@me

# 给自己加身份组
curl -X PUT \
  "https://discord.com/api/v10/guilds/GUILD_ID/members/YOUR_DISCORD_ID/roles/ROLE_ID" \
  -H "Authorization: Bot YOUR_BOT_TOKEN"
```

### 7.2 Ko-fi 付款流程

1. Ko-fi 测试付款（或手动 D1 插入订阅）
2. 确认 Discord 身份组添加 + DM + `#支付日志`

### 7.3 Stripe 付款流程

1. 前端点击信用卡支付 → Stripe Checkout
2. 测试卡号 `4242 4242 4242 4242` → 完成支付
3. 确认 webhook → D1 订阅 → Discord 身份组

### 7.4 到期移除测试

1. D1 手动设 `expires_at` 为过去时间
2. 手动触发 Cron：`wrangler dev --test-scheduled`
3. 确认身份组移除 + 日志

---

## Phase 8：MSG 推送到 Discord（可选）

你的 `msg-pusher`（Homeserver PM2 id:3）已有 Discord Webhook 推送能力。

1. 在每个专属频道（`#乃木坂-msg` / `#櫻坂-msg` / `#日向坂-msg`）创建 **Webhook**
2. 复制 3 个 Webhook URL
3. Homeserver `~/msg-pusher/.env` 添加这些 Webhook URL
4. `push-config.js` 配置按团体路由到对应频道 Webhook

---

## 完成后的用户体验

```
新用户：
  → 46log.com Discord 登录 → user_oauth 存 Discord ID
  → /pricing 选方案 → Ko-fi 或 Stripe 付款
  → webhook → D1 订阅 → Discord Bot 加身份组
  → DM："✅ 订阅已激活"  → #支付日志 记录
  → Discord 看到专属频道  → MSG 实时推送

续费：→ webhook 更新到期 → DM + 日志
到期：→ Cron 移除身份组 → 失去频道 → 仪表盘"已过期"
升级：→ 新方案付款 → 加上缺的身份组
```

---

## 推荐执行顺序

| 优先级 | 内容 | 说明 |
|--------|------|------|
| 🔴 先做 | Phase 1-2 | Discord 服务器 + Ko-fi Tiers（纯手动，10 分钟） |
| 🟡 核心 | Phase 4.1-4.2, 4.5-4.6 | discord-bot 工具 + Ko-fi 联动 + Cron 修改 |
| 🟡 核心 | Phase 6.1-6.2 | 部署 Worker |
| 🟢 验证 | Phase 7.1-7.2 | 先跑通 Ko-fi + Discord |
| 🔵 后续 | Phase 3, 4.3-4.4 | Stripe 通道 |
| 🔵 后续 | Phase 5 | 前端定价页 |
| ⚪ 可选 | Phase 8 | MSG 推送到 Discord |

---

## 附录：需要记录的值

| 项目 | 值 |
|------|-----|
| Discord 服务器 ID | `________________` |
| 赞助者-乃木坂 身份组 ID | `________________` |
| 赞助者-櫻坂 身份组 ID | `________________` |
| 赞助者-日向坂 身份组 ID | `________________` |
| `#支付日志` 频道 ID | `________________` |
| Bot Token | `________________`（⚠️ 不要提交到 Git） |
| Bot 邀请链接 | `________________` |
| Ko-fi Tier 链接 (乃木坂) | `________________` |
| Ko-fi Tier 链接 (櫻坂) | `________________` |
| Ko-fi Tier 链接 (日向坂) | `________________` |
| Ko-fi Tier 链接 (全团) | `________________` |
| Ko-fi Tier 链接 (永久) | `________________` |
| Stripe Price ID (乃木坂) | `price_________________` |
| Stripe Price ID (櫻坂) | `price_________________` |
| Stripe Price ID (日向坂) | `price_________________` |
| Stripe Price ID (全团) | `price_________________` |
| Stripe Price ID (永久) | `price_________________` |
| Stripe Webhook Secret | `whsec_________________` |
| MSG Discord Webhook (乃木坂) | `________________` |
| MSG Discord Webhook (櫻坂) | `________________` |
| MSG Discord Webhook (日向坂) | `________________` |
