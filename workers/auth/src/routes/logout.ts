import type { Env } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { success, clearCookies } from '../utils/response';

/** Extract access_token from cookie */
function getAccessToken(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

export async function handleLogout(req: Request, env: Env): Promise<Response> {
  const token = getAccessToken(req);

  if (token) {
    const payload = await verifyAccessToken(token, env.JWT_SECRET);
    if (payload) {
      // Revoke all refresh tokens for this user
      await env.DB.prepare(
        'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0',
      )
        .bind(payload.sub)
        .run();
    }
  }

  const res = success({ message: '已登出' });
  return clearCookies(res, ['access_token', 'refresh_token']);
}
