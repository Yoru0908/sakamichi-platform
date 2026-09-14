import type { Env, UserRow } from '../types';
import { toPublicUser } from '../types';
import { sendVerificationEmail } from '../utils/email';
import { verifyPassword } from '../utils/password';
import { signAccessToken } from '../utils/jwt';
import { error, success, setCookies } from '../utils/response';
import { generateGeoPass, shouldIssueGeoPass } from '../utils/geo-pass';
import { createRefreshCredential, runBestEffortDuringD1Quota } from '../utils/refresh-token';

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
    // Only the owner (password already checked) can request another email.
    // Token expiry = creation + 24h, so it also provides a per-account cooldown.
    const latest = await env.DB.prepare('SELECT MAX(expires_at) AS expires_at FROM email_tokens WHERE user_id = ?')
      .bind(user.id).first<{ expires_at: string | null }>();
    const now = Date.now();
    if (latest?.expires_at && Date.parse(latest.expires_at) > now + 24 * 60 * 60 * 1000 - 60 * 1000) {
      return error('邮箱尚未验证，请检查收件箱和垃圾邮件；如需补发，请至少间隔60秒再登录。', 429);
    }
    const token = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO email_tokens (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, user.id, new Date(now + 24 * 60 * 60 * 1000).toISOString()).run();
    const sent = await sendVerificationEmail(env, user.email, token);
    return sent
      ? error('邮箱尚未验证，验证邮件已重新发送，请查收并点击验证链接后再登录。', 403)
      : error('验证邮件暂时发送失败，请至少间隔60秒后重试登录，或联系管理员。', 502);
  }

  // Sign access token
  const accessToken = await signAccessToken(user.id, user.role, env.JWT_SECRET);

  const refresh = await createRefreshCredential(env, user.id, user.role);

  // Login must remain available if this non-essential audit write is the first
  // operation rejected after the account-wide D1 daily quota is exhausted.
  await runBestEffortDuringD1Quota(() =>
    env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
      .bind(user.id)
      .run(),
  );

  const res = success({ data: { user: toPublicUser(user) } });

  const cookies: { name: string; value: string; maxAge: number; path?: string; domain?: string }[] = [
    { name: 'access_token', value: accessToken, maxAge: 15 * 60, domain: '.46log.com' },
    { name: 'refresh_token', value: refresh.token, maxAge: refresh.maxAge, path: '/api/auth', domain: '.46log.com' },
  ];

  if (shouldIssueGeoPass(user)) {
    const ua = req.headers.get('User-Agent') || '';
    const geoPassValue = await generateGeoPass(user.id, env.GEO_PASS_SECRET, ua);
    cookies.push({ name: 'geo_pass', value: geoPassValue, maxAge: 365 * 24 * 60 * 60, domain: '.46log.com' });
  }

  return setCookies(res, cookies);
}
