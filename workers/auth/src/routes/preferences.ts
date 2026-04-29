import type { Env } from '../types.ts';
import { verifyAccessToken } from '../utils/jwt.ts';
import { error, success } from '../utils/response.ts';

export function getAccessToken(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

export async function getAuthUserId(req: Request, env: Env): Promise<string | null> {
  const token = getAccessToken(req);
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  return payload?.sub || null;
}

export async function getAuthUser(req: Request, env: Env): Promise<{ userId: string; role: string } | null> {
  const token = getAccessToken(req);
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) return null;
  return { userId: payload.sub, role: payload.role };
}

export async function getUserMemberPreferences(
  env: Env,
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

/** GET /api/user/preferences */
export async function handleGetPreferences(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  const prefs = await getUserMemberPreferences(env, userId);

  return success({
    data: prefs,
  });
}

/** PUT /api/user/preferences */
export async function handleUpdatePreferences(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  let body: { oshiMember?: string | null; followedMembers?: string[] };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  if (body.oshiMember !== undefined) {
    await env.DB.prepare(
      'UPDATE users SET oshi_member = ?, is_first_login = 0, updated_at = datetime(\'now\') WHERE id = ?',
    ).bind(body.oshiMember, userId).run();
  }

  if (body.followedMembers !== undefined) {
    await env.DB.prepare('DELETE FROM user_followed_members WHERE user_id = ?')
      .bind(userId).run();

    for (const name of body.followedMembers) {
      await env.DB.prepare(
        'INSERT INTO user_followed_members (user_id, member_name) VALUES (?, ?)',
      ).bind(userId, name).run();
    }
  }

  return success({ message: '偏好已更新' });
}

/** GET /api/user/favorites */
export async function handleGetFavorites(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);
  const prefs = await getUserMemberPreferences(env, userId, { includeFollowedMembers: false });

  const rows = await env.DB.prepare(
    'SELECT member_name, member_group, added_at FROM user_favorites WHERE user_id = ? ORDER BY added_at',
  ).bind(userId).all<{ member_name: string; member_group: string; added_at: string }>();

  const favorites = (rows.results || []).map((r) => ({
    name: r.member_name,
    group: r.member_group,
    addedAt: r.added_at,
  }));
  const oshiName = prefs.oshiMember?.trim();
  const oshiFavorite = oshiName
    ? favorites.find((favorite) => favorite.name === oshiName) || { name: oshiName, group: '', addedAt: '' }
    : null;
  const orderedFavorites = oshiFavorite
    ? [oshiFavorite, ...favorites.filter((favorite) => favorite.name !== oshiFavorite.name)]
    : favorites;

  return success({
    data: {
      favorites: orderedFavorites,
    },
  });
}

/** PUT /api/user/favorites */
export async function handleUpdateFavorites(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  let body: { favorites?: { name: string; group: string }[] };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  if (!body.favorites) {
    return error('缺少 favorites 字段', 400);
  }

  await env.DB.prepare('DELETE FROM user_favorites WHERE user_id = ?')
    .bind(userId).run();

  for (const fav of body.favorites) {
    await env.DB.prepare(
      'INSERT INTO user_favorites (user_id, member_name, member_group) VALUES (?, ?, ?)',
    ).bind(userId, fav.name, fav.group || '').run();
  }

  return success({ message: '收藏已同步' });
}

/** GET /api/user/bookmarks */
export async function handleGetBookmarks(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  const rows = await env.DB.prepare(
    'SELECT episode_id, note, added_at FROM user_episode_bookmarks WHERE user_id = ? ORDER BY added_at DESC',
  ).bind(userId).all<{ episode_id: number; note: string | null; added_at: string }>();

  return success({
    data: {
      bookmarks: (rows.results || []).map((r) => ({
        episodeId: r.episode_id,
        note: r.note,
        addedAt: r.added_at,
      })),
    },
  });
}

/** POST /api/user/bookmarks - Add a bookmark */
export async function handleAddBookmark(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  let body: { episodeId: number; note?: string };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  if (!body.episodeId) {
    return error('缺少 episodeId', 400);
  }

  await env.DB.prepare(
    'INSERT OR IGNORE INTO user_episode_bookmarks (user_id, episode_id, note) VALUES (?, ?, ?)',
  ).bind(userId, body.episodeId, body.note || null).run();

  return success({ message: '已收藏' });
}

/** DELETE /api/user/bookmarks - Remove a bookmark */
export async function handleRemoveBookmark(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  let body: { episodeId: number };
  try {
    body = await req.json();
  } catch {
    return error('无效的请求体', 400);
  }

  if (!body.episodeId) {
    return error('缺少 episodeId', 400);
  }

  await env.DB.prepare(
    'DELETE FROM user_episode_bookmarks WHERE user_id = ? AND episode_id = ?',
  ).bind(userId, body.episodeId).run();

  return success({ message: '已取消收藏' });
}
