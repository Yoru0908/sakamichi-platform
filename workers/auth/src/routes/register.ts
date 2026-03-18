import type { Env, UserRow } from '../types';
import { hashPassword } from '../utils/password';
import { sendVerificationEmail } from '../utils/email';
import { error, success } from '../utils/response';

export async function handleRegister(req: Request, env: Env): Promise<Response> {
  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  const { email, password, displayName } = body;

  if (!email || !password) {
    return error('邮箱和密码为必填项', 400);
  }

  if (password.length < 8) {
    return error('密码至少需要 8 个字符', 400);
  }

  // Check if email already exists
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  if (existing) {
    return error('该邮箱已注册', 409);
  }

  // Create user
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const name = displayName || email.split('@')[0];

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, email_verified, is_first_login, verification_status)
     VALUES (?, ?, ?, ?, 'member', 0, 1, 'none')`,
  )
    .bind(userId, email, passwordHash, name)
    .run();

  // Generate verification token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO email_tokens (token, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(token, userId, expiresAt)
    .run();

  // Send verification email
  await sendVerificationEmail(env, email, token);

  return success({ message: `验证邮件已发送至 ${email}` }, 201);
}
