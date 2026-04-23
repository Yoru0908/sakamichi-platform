import type { Env, UserRow } from '../types';
import { toPublicUser } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, success } from '../utils/response';

function getAccessToken(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

async function getAuthUserId(req: Request, env: Env): Promise<string | null> {
  const token = getAccessToken(req);
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  return payload?.sub || null;
}

/** GET /api/user/profile — full profile with OAuth links */
export async function handleGetProfile(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRow>();

  if (!user) return error('user_not_found', 404);

  const [oauthLinks, subscription, paymentLinks] = await Promise.all([
    env.DB.prepare(
      'SELECT provider, provider_email, provider_name, provider_avatar, created_at FROM user_oauth WHERE user_id = ?',
    ).bind(userId).all<{ provider: string; provider_email: string; provider_name: string; provider_avatar: string | null; created_at: string }>(),
    env.DB.prepare(
      `SELECT plan, status, payment_method, paid_at, expires_at FROM user_subscriptions
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).bind(userId).first<{ plan: string; status: string; payment_method: string; paid_at: string; expires_at: string | null }>(),
    env.DB.prepare(
      'SELECT platform, platform_email, linked_at FROM user_payment_links WHERE user_id = ?',
    ).bind(userId).all<{ platform: string; platform_email: string | null; linked_at: string }>(),
  ]);

  return success({
    data: {
      user: toPublicUser(user),
      oauthLinks: (oauthLinks.results || []).map((l) => ({
        provider: l.provider,
        email: l.provider_email,
        name: l.provider_name,
        avatar: l.provider_avatar,
        linkedAt: l.created_at,
      })),
      subscription: subscription || null,
      paymentLinks: (paymentLinks.results || []).map((l) => ({
        platform: l.platform,
        email: l.platform_email,
        linkedAt: l.linked_at,
      })),
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
    },
  });
}

/** PUT /api/user/profile — update display name */
export async function handleUpdateProfile(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  let body: { displayName?: string };
  try {
    body = await req.json();
  } catch {
    return error('invalid request body', 400);
  }

  if (body.displayName !== undefined) {
    const name = body.displayName.trim();
    if (name.length < 1 || name.length > 30) {
      return error('昵称长度需在 1-30 个字符之间', 400);
    }
    await env.DB.prepare(
      "UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(name, userId)
      .run();
  }

  return success({ message: '个人资料已更新' });
}
