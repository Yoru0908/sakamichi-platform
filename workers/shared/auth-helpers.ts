// Shared request-auth helpers for all sakamichi workers.
// Reads the access_token cookie signed by sakamichi-auth and
// (optionally) user member preferences from the auth D1.

import { verifyAccessToken } from './jwt.ts';

interface AuthEnv {
  DB: D1Database;
  JWT_SECRET: string;
}

export function getAccessToken(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

export async function getAuthUserId(req: Request, env: AuthEnv): Promise<string | null> {
  const token = getAccessToken(req);
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  return payload?.sub || null;
}

export async function getAuthUser(req: Request, env: AuthEnv): Promise<{ userId: string; role: string } | null> {
  const token = getAccessToken(req);
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) return null;
  return { userId: payload.sub, role: payload.role };
}

export async function getUserMemberPreferences(
  env: AuthEnv,
  userId: string,
  options: { includeFollowedMembers?: boolean } = {},
): Promise<{ oshiMember: string | null; followedMembers: string[] }> {
  const user = await env.DB.prepare(
    'SELECT oshi_member FROM users WHERE id = ?',
  ).bind(userId).first<{ oshi_member: string | null }>();

  if (options.includeFollowedMembers === false) {
    return {
      oshiMember: user?.oshi_member || null,
      followedMembers: [],
    };
  }

  const followed = await env.DB.prepare(
    'SELECT member_name, member_group FROM user_followed_members WHERE user_id = ?',
  ).bind(userId).all<{ member_name: string; member_group: string }>();

  return {
    oshiMember: user?.oshi_member || null,
    followedMembers: (followed.results || []).map((r) => r.member_name),
  };
}

export function mergePreferredMembers(
  prefs: { oshiMember: string | null; followedMembers: string[] },
): string[] {
  return Array.from(new Set([prefs.oshiMember, ...prefs.followedMembers].filter((value): value is string => Boolean(value))));
}
