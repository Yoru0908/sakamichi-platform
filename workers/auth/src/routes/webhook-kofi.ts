import type { Env, UserRow } from '../types';

interface KofiWebhookPayload {
  verification_token: string;
  message_id: string;
  type: 'Donation' | 'Subscription' | 'Shop Order';
  from_name: string;
  message: string;
  amount: string;
  email: string;
  currency: string;
  is_subscription_payment: boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id: string;
  tier_name?: string;
}

function mapKofiPlan(tierName?: string, amount?: string): string {
  if (tierName?.toLowerCase().includes('lifetime')) return 'lifetime';
  if (tierName?.toLowerCase().includes('all')) return 'all_groups';
  if (tierName?.toLowerCase().includes('nogizaka') || tierName?.includes('乃木坂')) return 'single_nogizaka';
  if (tierName?.toLowerCase().includes('sakurazaka') || tierName?.includes('櫻坂')) return 'single_sakurazaka';
  if (tierName?.toLowerCase().includes('hinata') || tierName?.includes('日向坂')) return 'single_hinatazaka';
  return 'all_groups';
}

export async function handleKofiWebhook(req: Request, env: Env): Promise<Response> {
  let body: KofiWebhookPayload;
  try {
    const formData = await req.formData();
    const dataStr = formData.get('data') as string;
    if (!dataStr) return new Response('Missing data', { status: 200 });
    body = JSON.parse(dataStr);
  } catch {
    return new Response('Bad request', { status: 200 });
  }

  // 1. Verify token
  if (body.verification_token !== env.KOFI_VERIFICATION_TOKEN) {
    return new Response('OK', { status: 200 });
  }

  // 2. Idempotency check
  const existingSub = await env.DB.prepare(
    'SELECT id FROM user_subscriptions WHERE payment_ref = ? AND payment_method = ?'
  ).bind(body.kofi_transaction_id, 'kofi').first();
  if (existingSub) return new Response('OK', { status: 200 });

  const dataStr = JSON.stringify(body);

  // 3. Find platform user (payment_links → email match → message email)
  let platformUser: UserRow | null = await env.DB.prepare(
    `SELECT u.* FROM users u
     JOIN user_payment_links upl ON u.id = upl.user_id
     WHERE upl.platform = 'kofi' AND upl.platform_email = ?`
  ).bind(body.email).first<UserRow>();

  if (!platformUser) {
    platformUser = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(body.email).first<UserRow>();
  }

  if (!platformUser && body.message) {
    const emailMatch = body.message.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      platformUser = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(emailMatch[0].toLowerCase()).first<UserRow>();
    }
  }

  // 4. No match → store as unmatched
  if (!platformUser) {
    await env.DB.prepare(
      `INSERT INTO unmatched_payments (id, platform, order_id, platform_user_id, amount, remark, raw_data, created_at)
       VALUES (hex(randomblob(16)), 'kofi', ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(body.kofi_transaction_id, body.email, body.amount, body.message || '', dataStr).run();
    console.log(`[Ko-fi] Unmatched payment: ${body.kofi_transaction_id} from ${body.email}`);
    return new Response('OK', { status: 200 });
  }

  // 5. Create subscription
  const plan = mapKofiPlan(body.tier_name, body.amount);
  const durationMonths = plan === 'lifetime' ? null
    : body.is_subscription_payment ? 1 : 12;
  let expiresAt: string | null = null;
  if (durationMonths) {
    const d = new Date();
    d.setMonth(d.getMonth() + durationMonths);
    expiresAt = d.toISOString();
  }

  await env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan, status, payment_method, payment_ref, amount_cents, currency, paid_at, expires_at, created_at, updated_at)
     VALUES (hex(randomblob(16)), ?, ?, 'active', 'kofi', ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))`
  ).bind(
    platformUser.id,
    plan,
    body.kofi_transaction_id,
    Math.round(parseFloat(body.amount) * 100),
    body.currency,
    expiresAt
  ).run();

  // 6. Upgrade user status
  await env.DB.prepare(
    `UPDATE users SET payment_status = 'active', geo_status = 'approved',
     role = CASE WHEN role IN ('translator', 'admin') THEN role ELSE 'verified' END,
     updated_at = datetime('now')
     WHERE id = ?`
  ).bind(platformUser.id).run();

  console.log(`[Ko-fi] Activated subscription for user ${platformUser.id}, plan=${plan}, tx=${body.kofi_transaction_id}`);
  return new Response('OK', { status: 200 });
}
