import type { Env, UserRow } from '../types';
import { toPublicUser } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, success } from '../utils/response';

/** Extract access_token from cookie */
function getAccessToken(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

export async function handleMe(req: Request, env: Env): Promise<Response> {
  const token = getAccessToken(req);
  if (!token) {
    return error('unauthorized', 401);
  }

  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) {
    return error('unauthorized', 401);
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(payload.sub)
    .first<UserRow>();

  if (!user) {
    return error('user_not_found', 404);
  }

  return success({ data: { user: toPublicUser(user) } });
}
