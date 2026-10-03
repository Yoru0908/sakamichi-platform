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
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return error('Invalid verification status', 400);

  // Account updates must never reorder the review queue. Unknown historical
  // timestamps sort last, using registration/id only to make that section stable.
  const actionTime = `CASE WHEN verification_status = 'pending' THEN verification_requested_at ELSE verification_resolved_at END`;
  const query = `SELECT id, email, display_name, avatar_url, role, verification_status, geo_status, payment_status,
      verification_reason, verification_requested_at, verification_resolved_at, created_at, updated_at
    FROM users WHERE ${status === 'all' ? "verification_status IN ('pending', 'approved', 'rejected')" : 'verification_status = ?'}
    ORDER BY ${status === 'all' ? "CASE WHEN verification_status = 'pending' THEN 0 ELSE 1 END," : ''}
      (${actionTime}) IS NULL, ${actionTime} DESC, created_at DESC, id
    LIMIT 200`;
  const statement = env.DB.prepare(query);
  const users = await (status === 'all' ? statement : statement.bind(status)).all();
  const response = success({ data: { users: users.results } });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
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

  // A stale/repeated review must not overwrite another admin's decision/time.
  if (targetUser.verification_status !== 'pending') return error('该申请已处理，请刷新列表', 409);
  const result = await env.DB.prepare(body.action === 'approve'
    ? `UPDATE users SET verification_status = 'approved', geo_status = 'approved',
        verification_resolved_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND verification_status = 'pending'`
    : `UPDATE users SET verification_status = 'rejected',
        verification_resolved_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND verification_status = 'pending'`
  ).bind(body.userId).run();
  if (!result.meta.changes) return error('该申请已处理，请刷新列表', 409);

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
  const result = await env.DB.prepare(
    `UPDATE users SET verification_status = 'pending', verification_reason = ?,
       verification_requested_at = datetime('now'), verification_resolved_at = NULL, updated_at = datetime('now')
     WHERE id = ? AND verification_status IN ('none', 'rejected')`
  ).bind(reason, user.id).run();
  if (!result.meta.changes) return error('申请状态已更新，请刷新后重试', 409);

  return success({ data: { message: 'Verification request submitted', status: 'pending' } });
}
