import type { Env } from '../types';

/**
 * Send email via Resend API.
 * Requires RESEND_API_KEY secret.
 */
export async function sendVerificationEmail(
  env: Env,
  to: string,
  token: string,
): Promise<boolean> {
  const siteUrl = env.CORS_ORIGIN.split(',')[0].trim();
  const verifyUrl = `${siteUrl}/auth/verify?token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: 'Sakamichi Tools - 邮箱验证',
        html: `
          <div style="max-width:480px;margin:0 auto;font-family:sans-serif;padding:24px;">
            <h2 style="color:#742581;">Sakamichi Tools</h2>
            <p>你好！请点击下方按钮验证你的邮箱地址：</p>
            <a href="${verifyUrl}" style="display:inline-block;background:#742581;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;margin:16px 0;">
              验证邮箱
            </a>
            <p style="font-size:12px;color:#888;margin-top:24px;">
              如果你没有注册 Sakamichi Tools，请忽略此邮件。<br/>
              链接有效期 24 小时。
            </p>
          </div>
        `,
      }),
    });
    if (!res.ok) {
      // Never log recipient addresses, verification URLs, API keys or response bodies.
      console.error('[Email] Resend rejected verification email', { status: res.status });
      return false;
    }
    const result = await res.json() as { id?: string };
    if (!result.id) {
      console.error('[Email] Resend response missing message id');
      return false;
    }
    console.info('[Email] Resend accepted verification email', { id: result.id });
    return true;
  } catch {
    console.error('[Email] Failed to send verification email');
    return false;
  } finally { clearTimeout(timeout); }
}
