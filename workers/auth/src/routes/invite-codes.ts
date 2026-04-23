import type { Env, UserRow } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, success } from '../utils/response';

function getCookie(req: Request, name: string): string | null {
  const h = req.headers.get('Cookie');
  if (!h) return null;
  const m = h.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}

async function getAuthUser(req: Request, env: Env): Promise<UserRow | null> {
  const token = getCookie(req, 'access_token') || req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) return null;
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first<UserRow>();
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// POST /api/admin/invite-codes — Admin creates invite code
export async function handleCreateInviteCode(req: Request, env: Env): Promise<Response> {
  const user = await getAuthUser(req, env);
  if (!user || user.role !== 'admin') return error('Forbidden', 403);

  let body: { plan?: string; maxUses?: number; durationDays?: number | null; expiresInDays?: number | null };
  try { body = await req.json(); } catch { return error('Invalid body', 400); }

  const plan = body.plan || 'all_groups';
  const maxUses = body.maxUses || 1;
  const durationDays = body.durationDays ?? null;
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400000).toISOString()
    : null;

  const code = generateCode();

  await env.DB.prepare(
    `INSERT INTO invite_codes (code, created_by, plan, max_uses, used_count, duration_days, expires_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, datetime('now'))`
  ).bind(code, user.id, plan, maxUses, durationDays, expiresAt).run();

  return success({ data: { code, plan, maxUses, durationDays, expiresAt } });
}

// GET /api/admin/invite-codes — Admin lists invite codes
export async function handleListInviteCodes(req: Request, env: Env): Promise<Response> {
  const user = await getAuthUser(req, env);
  if (!user || user.role !== 'admin') return error('Forbidden', 403);

  const codes = await env.DB.prepare(
    `SELECT ic.*, 
      (SELECT GROUP_CONCAT(icu.user_id) FROM invite_code_usage icu WHERE icu.code = ic.code) as used_by_users
     FROM invite_codes ic ORDER BY ic.created_at DESC LIMIT 100`
  ).all();

  return success({ data: { codes: codes.results } });
}

// POST /api/auth/redeem-invite — User redeems invite code
export async function handleRedeemInviteCode(req: Request, env: Env): Promise<Response> {
  const user = await getAuthUser(req, env);
  if (!user) return error('Unauthorized', 401);

  let body: { code?: string };
  try { body = await req.json(); } catch { return error('Invalid body', 400); }

  if (!body.code) return error('Invite code required', 400);
  const code = body.code.toUpperCase().trim();

  // Find code
  const invite = await env.DB.prepare('SELECT * FROM invite_codes WHERE code = ?').bind(code).first<{
    code: string; plan: string; max_uses: number; used_count: number;
    duration_days: number | null; expires_at: string | null;
  }>();

  if (!invite) return error('Invalid invite code', 404);

  // Check expired
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return error('Invite code expired', 410);
  }

  // Check usage limit
  if (invite.used_count >= invite.max_uses) {
    return error('Invite code fully used', 410);
  }

  // Check if user already used this code
  const alreadyUsed = await env.DB.prepare(
    'SELECT id FROM invite_code_usage WHERE code = ? AND user_id = ?'
  ).bind(code, user.id).first();
  if (alreadyUsed) return error('Already redeemed this code', 409);

  // Calculate expiry
  let expiresAt: string | null = null;
  if (invite.duration_days) {
    const d = new Date();
    d.setDate(d.getDate() + invite.duration_days);
    expiresAt = d.toISOString();
  }

  // Create subscription
  await env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan, status, payment_method, payment_ref, paid_at, expires_at, created_at, updated_at)
     VALUES (hex(randomblob(16)), ?, ?, 'active', 'invite_code', ?, datetime('now'), ?, datetime('now'), datetime('now'))`
  ).bind(user.id, invite.plan, code, expiresAt).run();

  // Update invite code usage
  await env.DB.prepare('UPDATE invite_codes SET used_count = used_count + 1 WHERE code = ?').bind(code).run();
  await env.DB.prepare(
    'INSERT INTO invite_code_usage (id, code, user_id, used_at) VALUES (hex(randomblob(16)), ?, ?, datetime(\'now\'))'
  ).bind(code, user.id).run();

  // Upgrade user
  await env.DB.prepare(
    `UPDATE users SET payment_status = 'active', geo_status = 'approved',
     role = CASE WHEN role IN ('translator', 'admin') THEN role ELSE 'verified' END,
     updated_at = datetime('now')
     WHERE id = ?`
  ).bind(user.id).run();

  return success({ data: { message: 'Invite code redeemed', plan: invite.plan, expiresAt } });
}
