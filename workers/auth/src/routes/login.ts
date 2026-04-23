import type { Env, UserRow } from '../types';
import { toPublicUser } from '../types';
import { verifyPassword } from '../utils/password';
import { signAccessToken } from '../utils/jwt';
import { error, success, setCookies } from '../utils/response';
import { generateGeoPass, shouldIssueGeoPass } from '../utils/geo-pass';

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  const { email, password } = body;

  if (!email || !password) {
    return error('邮箱和密码为必填项', 400);
  }

  // Find user
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  if (!user || !user.password_hash) {
    return error('邮箱或密码错误', 401);
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return error('邮箱或密码错误', 401);
  }

  // Check email verified
  if (!user.email_verified) {
    return error('请先验证邮箱', 403);
  }

  // Sign access token
  const accessToken = await signAccessToken(user.id, user.role, env.JWT_SECRET);

  // Create refresh token
  const refreshToken = crypto.randomUUID();
  const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO refresh_tokens (id, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(refreshToken, user.id, refreshExpires)
    .run();

  // Update last_login_at
  await env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
    .bind(user.id)
    .run();

  const res = success({ data: { user: toPublicUser(user) } });

  const cookies: { name: string; value: string; maxAge: number; path?: string; domain?: string }[] = [
    { name: 'access_token', value: accessToken, maxAge: 15 * 60, domain: '.46log.com' },
    { name: 'refresh_token', value: refreshToken, maxAge: 7 * 24 * 60 * 60, path: '/api/auth', domain: '.46log.com' },
  ];

  if (shouldIssueGeoPass(user)) {
    const ua = req.headers.get('User-Agent') || '';
    const geoPassValue = await generateGeoPass(user.id, env.GEO_PASS_SECRET, ua);
    cookies.push({ name: 'geo_pass', value: geoPassValue, maxAge: 365 * 24 * 60 * 60, domain: '.46log.com' });
  }

  return setCookies(res, cookies);
}
