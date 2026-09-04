import type { Env } from '../types.ts';
import { signEmergencyRefreshToken } from './jwt.ts';

export const NORMAL_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
export const EMERGENCY_REFRESH_TTL_SECONDS = 24 * 60 * 60;

export function isD1QuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || '');
  return /exceeded D1(?:'s)? free tier daily row read limit|code:\s*7500/i.test(message);
}

export type RefreshCredential = {
  token: string;
  maxAge: number;
  emergency: boolean;
};

/**
 * Persist a revocable refresh token normally. If Cloudflare rejects the write
 * solely because the account-wide D1 daily read quota is exhausted, issue a
 * short-lived signed refresh token so existing users are not locked out until
 * the quota resets. Other database errors are never swallowed.
 */
export async function createRefreshCredential(
  env: Env,
  userId: string,
  role: string,
): Promise<RefreshCredential> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + NORMAL_REFRESH_TTL_SECONDS * 1000).toISOString();

  try {
    await env.DB.prepare(
      'INSERT INTO refresh_tokens (id, user_id, expires_at) VALUES (?, ?, ?)',
    )
      .bind(token, userId, expiresAt)
      .run();
    return { token, maxAge: NORMAL_REFRESH_TTL_SECONDS, emergency: false };
  } catch (err) {
    if (!isD1QuotaError(err)) throw err;
    console.warn('[Auth] D1 daily read quota exhausted; issuing 24-hour emergency refresh token');
    return {
      token: await signEmergencyRefreshToken(userId, role, env.JWT_SECRET),
      maxAge: EMERGENCY_REFRESH_TTL_SECONDS,
      emergency: true,
    };
  }
}

export async function runBestEffortDuringD1Quota(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (err) {
    if (!isD1QuotaError(err)) throw err;
    console.warn('[Auth] Skipped non-essential D1 write while daily read quota is exhausted');
  }
}
