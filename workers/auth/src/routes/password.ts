import type { Env, UserRow } from '../types';
import { verifyPassword, hashPassword } from '../utils/password';
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

/** PUT /api/user/password — change password */
export async function handleChangePassword(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return error('请填写当前密码和新密码', 400);
  }

  if (newPassword.length < 8) {
    return error('新密码长度至少为 8 个字符', 400);
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRow>();

  if (!user) return error('用户不存在', 404);

  if (!user.password_hash) {
    return error('当前账号通过第三方登录，请先设置密码', 400);
  }

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    return error('当前密码错误', 401);
  }

  const newHash = await hashPassword(newPassword);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(newHash, userId)
    .run();

  return success({ message: '密码已修改' });
}
