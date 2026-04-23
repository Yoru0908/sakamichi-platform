import type { Env, UserRow, RefreshTokenRow } from '../types';
import { signAccessToken } from '../utils/jwt';
import { error, success, setCookies } from '../utils/response';
import { generateGeoPass, shouldIssueGeoPass } from '../utils/geo-pass';

/** Extract refresh_token from cookie */
function getRefreshToken(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(/refresh_token=([^;]+)/);
  return match ? match[1] : null;
}

export async function handleRefresh(req: Request, env: Env): Promise<Response> {
  const token = getRefreshToken(req);
  if (!token) {
    return error('unauthorized', 401);
  }

  // Find valid refresh token
  const row = await env.DB.prepare(
    'SELECT * FROM refresh_tokens WHERE id = ? AND revoked = 0',
  )
    .bind(token)
    .first<RefreshTokenRow>();

  if (!row || new Date(row.expires_at) < new Date()) {
    return error('unauthorized', 401);
  }

  // Revoke old refresh token (rotation)
  await env.DB.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?')
    .bind(token)
    .run();

  // Get user
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(row.user_id)
    .first<UserRow>();

  if (!user) {
    return error('user_not_found', 404);
  }

  // Sign new tokens
  const newAccessToken = await signAccessToken(user.id, user.role, env.JWT_SECRET);
  const newRefreshToken = crypto.randomUUID();
  const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO refresh_tokens (id, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(newRefreshToken, user.id, refreshExpires)
    .run();

  const res = success({});
  const cookies: { name: string; value: string; maxAge: number; path?: string; domain?: string }[] = [
    { name: 'access_token', value: newAccessToken, maxAge: 15 * 60, domain: '.46log.com' },
    { name: 'refresh_token', value: newRefreshToken, maxAge: 7 * 24 * 60 * 60, path: '/api/auth', domain: '.46log.com' },
  ];

  if (shouldIssueGeoPass(user)) {
    const ua = req.headers.get('User-Agent') || '';
    const geoPassValue = await generateGeoPass(user.id, env.GEO_PASS_SECRET, ua);
    cookies.push({ name: 'geo_pass', value: geoPassValue, maxAge: 365 * 24 * 60 * 60, domain: '.46log.com' });
  }

  return setCookies(res, cookies);
}
