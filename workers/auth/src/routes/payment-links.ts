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

// GET /api/user/payment-links — User views their linked payment platforms
export async function handleGetPaymentLinks(req: Request, env: Env): Promise<Response> {
  const user = await getAuthUser(req, env);
  if (!user) return error('Unauthorized', 401);

  const links = await env.DB.prepare(
    'SELECT id, platform, platform_user_id, platform_email, linked_at FROM user_payment_links WHERE user_id = ?'
  ).bind(user.id).all();

  return success({ data: { links: links.results } });
}

// POST /api/user/payment-links — User links a payment platform
export async function handleAddPaymentLink(req: Request, env: Env): Promise<Response> {
  const user = await getAuthUser(req, env);
  if (!user) return error('Unauthorized', 401);

  let body: { platform?: string; platformUserId?: string; platformEmail?: string };
  try { body = await req.json(); } catch { return error('Invalid body', 400); }

  const { platform, platformUserId, platformEmail } = body;
  if (!platform || (!platformUserId && !platformEmail)) {
    return error('platform and at least one of platformUserId/platformEmail required', 400);
  }

  if (!['afdian', 'kofi', 'stripe'].includes(platform)) {
    return error('Invalid platform', 400);
  }

  // Check duplicate
  const existing = await env.DB.prepare(
    'SELECT id FROM user_payment_links WHERE user_id = ? AND platform = ?'
  ).bind(user.id, platform).first();
  if (existing) {
    // Update
    await env.DB.prepare(
      'UPDATE user_payment_links SET platform_user_id = ?, platform_email = ?, linked_at = datetime(\'now\') WHERE user_id = ? AND platform = ?'
    ).bind(platformUserId || null, platformEmail || null, user.id, platform).run();
    return success({ message: 'Payment link updated' });
  }

  await env.DB.prepare(
    `INSERT INTO user_payment_links (id, user_id, platform, platform_user_id, platform_email, linked_at)
     VALUES (hex(randomblob(16)), ?, ?, ?, ?, datetime('now'))`
  ).bind(user.id, platform, platformUserId || null, platformEmail || null).run();

  return success({ message: 'Payment link added' });
}

// DELETE /api/user/payment-links — User removes a payment link
export async function handleRemovePaymentLink(req: Request, env: Env): Promise<Response> {
  const user = await getAuthUser(req, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(req.url);
  const platform = url.searchParams.get('platform');
  if (!platform) return error('platform query param required', 400);

  await env.DB.prepare(
    'DELETE FROM user_payment_links WHERE user_id = ? AND platform = ?'
  ).bind(user.id, platform).run();

  return success({ message: 'Payment link removed' });
}
