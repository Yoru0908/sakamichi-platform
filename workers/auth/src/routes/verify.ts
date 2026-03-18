import type { Env } from '../types';
import { error, success } from '../utils/response';

export async function handleVerify(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return error('缺少验证 token', 400);
  }

  // Find token
  const row = await env.DB.prepare(
    'SELECT * FROM email_tokens WHERE token = ?',
  )
    .bind(token)
    .first<{ token: string; user_id: string; expires_at: string }>();

  if (!row) {
    return error('验证链接无效', 400);
  }

  if (new Date(row.expires_at) < new Date()) {
    // Clean up expired token
    await env.DB.prepare('DELETE FROM email_tokens WHERE token = ?').bind(token).run();
    return error('验证链接已过期', 400);
  }

  // Activate user
  await env.DB.prepare(
    'UPDATE users SET email_verified = 1, updated_at = datetime(\'now\') WHERE id = ?',
  )
    .bind(row.user_id)
    .run();

  // Delete used token
  await env.DB.prepare('DELETE FROM email_tokens WHERE token = ?').bind(token).run();

  return success({ message: '邮箱验证成功' });
}
