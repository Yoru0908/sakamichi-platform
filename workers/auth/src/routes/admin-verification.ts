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

// GET /api/admin/verifications — List users with pending/all verification requests
export async function handleListVerifications(req: Request, env: Env): Promise<Response> {
  const admin = await getAdminUser(req, env);
  if (!admin) return error('Forbidden', 403);

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending';

  let query: string;
  if (status === 'all') {
    query = `SELECT id, email, display_name, avatar_url, role, verification_status, geo_status, payment_status, verification_reason, created_at, updated_at
             FROM users WHERE verification_status != 'none'
             ORDER BY CASE verification_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 END, updated_at DESC
             LIMIT 200`;
  } else {
    query = `SELECT id, email, display_name, avatar_url, role, verification_status, geo_status, payment_status, verification_reason, created_at, updated_at
             FROM users WHERE verification_status = '${status}'
             ORDER BY updated_at DESC LIMIT 200`;
  }

  const users = await env.DB.prepare(query).all();
  return success({ data: { users: users.results } });
}

// POST /api/admin/verifications/resolve — Approve or reject a verification request
export async function handleResolveVerification(req: Request, env: Env): Promise<Response> {
  const admin = await getAdminUser(req, env);
  if (!admin) return error('Forbidden', 403);

  let body: { userId?: string; action?: 'approve' | 'reject'; reason?: string };
  try { body = await req.json(); } catch { return error('Invalid body', 400); }

  if (!body.userId || !body.action) {
    return error('userId and action (approve/reject) required', 400);
  }

  if (!['approve', 'reject'].includes(body.action)) {
    return error('action must be approve or reject', 400);
  }

  // Verify target user exists
  const targetUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(body.userId).first<UserRow>();
  if (!targetUser) return error('User not found', 404);

  if (body.action === 'approve') {
    await env.DB.prepare(
      `UPDATE users SET verification_status = 'approved', geo_status = 'approved', updated_at = datetime('now')
       WHERE id = ?`
    ).bind(body.userId).run();
  } else {
    await env.DB.prepare(
      `UPDATE users SET verification_status = 'rejected', updated_at = datetime('now')
       WHERE id = ?`
    ).bind(body.userId).run();
  }

  console.log(`[Admin] Verification ${body.action}d for user ${body.userId} by admin ${admin.id}`);
  return success({ data: { message: `Verification ${body.action}d` } });
}

// POST /api/user/request-verification — User requests geo verification
export async function handleRequestVerification(req: Request, env: Env): Promise<Response> {
  const token = getCookie(req, 'access_token') || req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return error('Unauthorized', 401);
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) return error('Unauthorized', 401);

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first<UserRow>();
  if (!user) return error('Unauthorized', 401);

  // Already approved
  if (user.verification_status === 'approved') {
    return success({ data: { message: 'Already verified', status: 'approved' } });
  }

  // Already pending
  if (user.verification_status === 'pending') {
    return success({ data: { message: 'Verification request already submitted', status: 'pending' } });
  }

  // Parse reason from body
  let reason = '';
  try {
    const body = await req.json() as { reason?: string };
    reason = (body.reason || '').trim();
  } catch {
    // No body or invalid JSON — reason stays empty
  }

  // Require reason (min 20 chars)
  if (!reason || reason.length < 20) {
    return error('请填写至少20字的说明', 400);
  }

  // Set to pending with reason
  await env.DB.prepare(
    `UPDATE users SET verification_status = 'pending', verification_reason = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(reason, user.id).run();

  return success({ data: { message: 'Verification request submitted', status: 'pending' } });
}
