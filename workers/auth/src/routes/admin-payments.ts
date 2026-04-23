import type { Env, UserRow } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, success } from '../utils/response';

function getCookie(req: Request, name: string): string | null {
  const h = req.headers.get('Cookie');
  if (!h) return null;
  const m = h.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}

async function getAdminUser(req: Request, env: Env): Promise<UserRow | null> {
  const token = getCookie(req, 'access_token') || req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first<UserRow>();
  if (!user || user.role !== 'admin') return null;
  return user;
}

// GET /api/admin/unmatched-payments — List unmatched payments
export async function handleListUnmatchedPayments(req: Request, env: Env): Promise<Response> {
  const admin = await getAdminUser(req, env);
  if (!admin) return error('Forbidden', 403);

  const url = new URL(req.url);
  const pendingOnly = url.searchParams.get('pending') !== 'false';

  const query = pendingOnly
    ? 'SELECT * FROM unmatched_payments WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 100'
    : 'SELECT * FROM unmatched_payments ORDER BY created_at DESC LIMIT 100';

  const payments = await env.DB.prepare(query).all();
  return success({ data: { payments: payments.results } });
}

// POST /api/admin/unmatched-payments/resolve — Resolve an unmatched payment by linking to a user
export async function handleResolveUnmatchedPayment(req: Request, env: Env): Promise<Response> {
  const admin = await getAdminUser(req, env);
  if (!admin) return error('Forbidden', 403);

  let body: { paymentId?: string; userId?: string; plan?: string };
  try { body = await req.json(); } catch { return error('Invalid body', 400); }

  if (!body.paymentId || !body.userId) {
    return error('paymentId and userId required', 400);
  }

  // Verify payment exists and is unresolved
  const payment = await env.DB.prepare(
    'SELECT * FROM unmatched_payments WHERE id = ? AND resolved_at IS NULL'
  ).bind(body.paymentId).first<{ id: string; platform: string; order_id: string; amount: string }>();

  if (!payment) return error('Payment not found or already resolved', 404);

  // Verify target user exists
  const targetUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(body.userId).first<UserRow>();
  if (!targetUser) return error('User not found', 404);

  const plan = body.plan || 'all_groups';

  // Create subscription for the user
  await env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan, status, payment_method, payment_ref, amount_cents, paid_at, approved_by, notes, created_at, updated_at)
     VALUES (hex(randomblob(16)), ?, ?, 'active', 'manual', ?, ?, datetime('now'), ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    body.userId,
    plan,
    payment.order_id,
    payment.amount ? Math.round(parseFloat(payment.amount) * 100) : null,
    admin.id,
    `Resolved from ${payment.platform} unmatched payment ${payment.id}`
  ).run();

  // Mark payment as resolved
  await env.DB.prepare(
    'UPDATE unmatched_payments SET resolved_at = datetime(\'now\'), resolved_user_id = ? WHERE id = ?'
  ).bind(body.userId, body.paymentId).run();

  // Upgrade user
  await env.DB.prepare(
    `UPDATE users SET payment_status = 'active', geo_status = 'approved',
     role = CASE WHEN role IN ('translator', 'admin') THEN role ELSE 'verified' END,
     updated_at = datetime('now')
     WHERE id = ?`
  ).bind(body.userId).run();

  return success({ data: { message: 'Payment resolved and subscription created' } });
}

// GET /api/admin/subscriptions — List all subscriptions
export async function handleListSubscriptions(req: Request, env: Env): Promise<Response> {
  const admin = await getAdminUser(req, env);
  if (!admin) return error('Forbidden', 403);

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'active';

  const subs = await env.DB.prepare(
    `SELECT us.*, u.email, u.display_name
     FROM user_subscriptions us
     JOIN users u ON us.user_id = u.id
     WHERE us.status = ?
     ORDER BY us.created_at DESC LIMIT 100`
  ).bind(status).all();

  return success({ data: { subscriptions: subs.results } });
}

// GET /api/admin/stats — Dashboard stats
export async function handleAdminStats(req: Request, env: Env): Promise<Response> {
  const admin = await getAdminUser(req, env);
  if (!admin) return error('Forbidden', 403);

  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM users WHERE payment_status = 'active') as paid_users,
      (SELECT COUNT(*) FROM users WHERE verification_status = 'pending') as pending_users,
      (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active') as active_subs,
      (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'expired') as expired_subs,
      (SELECT COUNT(*) FROM unmatched_payments WHERE resolved_at IS NULL) as unmatched_pending,
      (SELECT COUNT(*) FROM invite_codes WHERE (expires_at IS NULL OR expires_at > datetime('now')) AND used_count < max_uses) as active_codes
  `).first();

  return success({ data: { stats } });
}
