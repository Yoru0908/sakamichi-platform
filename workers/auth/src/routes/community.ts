/** Community routes — photocard gallery */

import type { Env, UserRow } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, success } from '../utils/response';

// ── Helpers ──

function getAccessToken(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

/** Returns { userId, role } or null for guests */
async function getAuthUser(req: Request, env: Env): Promise<{ userId: string; role: string } | null> {
  const token = getAccessToken(req);
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) return null;
  return { userId: payload.sub, role: payload.role };
}

/** Generate a short random ID (12 chars) */
function nanoid(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/** Get Alist auth token (login with credentials, cached per-request) */
let _alistTokenCache: { token: string; expiresAt: number } | null = null;

async function getAlistToken(env: Env): Promise<string> {
  const now = Date.now();
  if (_alistTokenCache && _alistTokenCache.expiresAt > now) {
    return _alistTokenCache.token;
  }

  const alistUrl = env.ALIST_URL || 'https://gallery.46log.com';
  const resp = await fetch(`${alistUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: env.ALIST_USER,
      password: env.ALIST_PASS,
    }),
  });
  const data = await resp.json() as { code: number; data?: { token: string } };
  if (data.code !== 200 || !data.data?.token) {
    throw new Error(`Alist login failed: ${JSON.stringify(data)}`);
  }

  // Cache for 11 days (Alist default token validity is ~14 days)
  _alistTokenCache = {
    token: data.data.token,
    expiresAt: now + 11 * 24 * 60 * 60 * 1000,
  };
  return data.data.token;
}

/** Upload a file to Alist via PUT /api/fs/put */
async function uploadToAlist(
  env: Env,
  filePath: string,
  fileData: ArrayBuffer,
  contentType: string,
): Promise<boolean> {
  const alistUrl = env.ALIST_URL || 'https://gallery.46log.com';
  const token = await getAlistToken(env);
  const resp = await fetch(`${alistUrl}/api/fs/put`, {
    method: 'PUT',
    headers: {
      'Authorization': token,
      'File-Path': encodeURI(filePath),
      'Content-Type': contentType,
      'Content-Length': String(fileData.byteLength),
    },
    body: fileData,
  });
  if (!resp.ok) {
    console.error(`[Alist] Upload failed: ${resp.status} ${await resp.text()}`);
    return false;
  }
  const data = await resp.json() as { code: number };
  return data.code === 200;
}

/** Delete a file/directory from Alist */
async function deleteFromAlist(env: Env, dirPath: string, names: string[]): Promise<void> {
  const alistUrl = env.ALIST_URL || 'https://gallery.46log.com';
  const token = await getAlistToken(env);
  await fetch(`${alistUrl}/api/fs/remove`, {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dir: dirPath, names }),
  });
}

// ── Route Handlers ──

/** GET /api/community/works */
export async function handleListWorks(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const group = url.searchParams.get('group') || '';
  const member = url.searchParams.get('member') || '';
  const sort = url.searchParams.get('sort') || 'latest';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const auth = await getAuthUser(req, env);

  // Build query
  let where = "w.status = 'published'";
  const params: unknown[] = [];

  if (group) {
    where += ' AND w.group_style = ?';
    params.push(group);
  }
  if (member) {
    where += ' AND (w.member_name LIKE ? OR w.theme LIKE ?)';
    params.push(`%${member}%`, `%${member}%`);
  }

  const orderBy = sort === 'popular'
    ? 'w.like_count DESC, w.created_at DESC'
    : 'w.created_at DESC';

  // Count total
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM community_works w WHERE ${where}`,
  ).bind(...params).first<{ total: number }>();
  const total = countResult?.total || 0;

  // Fetch works with author info
  const queryParams = [...params, limit, offset];
  const works = await env.DB.prepare(`
    SELECT w.id, w.image_key, w.thumbnail_key, w.member_name, w.romaji_name,
           w.group_style, w.theme, w.like_count, w.view_count, w.allow_download,
           w.stamp_totoi, w.stamp_numa, w.stamp_ose, w.stamp_kami, w.stamp_yusho,
           w.user_id, w.created_at,
           u.display_name as author_name, u.avatar_url as author_avatar
    FROM community_works w
    LEFT JOIN users u ON w.user_id = u.id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...queryParams).all();

  // Check if current user has liked / bookmarked / stamped each work
  const workIds = (works.results || []).map((w: any) => w.id);
  let likedSet = new Set<string>();
  let bookmarkedSet = new Set<string>();
  const myStampsMap = new Map<string, string[]>();
  if (auth && workIds.length > 0) {
    const placeholders = workIds.map(() => '?').join(',');
    const [likes, bookmarks, stamps] = await Promise.all([
      env.DB.prepare(
        `SELECT work_id FROM community_likes WHERE user_id = ? AND work_id IN (${placeholders})`,
      ).bind(auth.userId, ...workIds).all(),
      env.DB.prepare(
        `SELECT work_id FROM community_bookmarks WHERE user_id = ? AND work_id IN (${placeholders})`,
      ).bind(auth.userId, ...workIds).all(),
      env.DB.prepare(
        `SELECT work_id, stamp_type FROM community_stamps WHERE user_id = ? AND work_id IN (${placeholders})`,
      ).bind(auth.userId, ...workIds).all(),
    ]);
    likedSet = new Set((likes.results || []).map((l: any) => l.work_id));
    bookmarkedSet = new Set((bookmarks.results || []).map((b: any) => b.work_id));
    for (const s of (stamps.results || []) as any[]) {
      if (!myStampsMap.has(s.work_id)) myStampsMap.set(s.work_id, []);
      myStampsMap.get(s.work_id)!.push(s.stamp_type);
    }
  }

  const galleryBase = 'https://gallery.46log.com/d/community';

  return success({
    data: {
      works: (works.results || []).map((w: any) => ({
        id: w.id,
        imageUrl: `${galleryBase}/${w.thumbnail_key || w.image_key}`,
        fullImageUrl: `${galleryBase}/${w.image_key}`,
        memberName: w.member_name,
        romajiName: w.romaji_name,
        groupStyle: w.group_style,
        theme: w.theme,
        likeCount: w.like_count,
        liked: likedSet.has(w.id),
        bookmarked: bookmarkedSet.has(w.id),
        stamps: {
          totoi: w.stamp_totoi || 0,
          numa:  w.stamp_numa  || 0,
          ose:   w.stamp_ose   || 0,
          kami:  w.stamp_kami  || 0,
          yusho: w.stamp_yusho || 0,
        },
        myStamps: myStampsMap.get(w.id) || [],
        allowDownload: w.allow_download === 1,
        author: w.user_id ? {
          id: w.user_id,
          displayName: w.author_name || '匿名',
          avatarUrl: w.author_avatar,
        } : { id: null, displayName: '匿名', avatarUrl: null },
        createdAt: w.created_at,
      })),
      total,
      page,
      hasMore: offset + limit < total,
    },
  });
}

/** GET /api/community/works/:id */
export async function handleGetWork(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);

  const work = await env.DB.prepare(`
    SELECT w.*, u.display_name as author_name, u.avatar_url as author_avatar
    FROM community_works w
    LEFT JOIN users u ON w.user_id = u.id
    WHERE w.id = ? AND w.status = 'published'
  `).bind(workId).first<any>();

  if (!work) return error('作品不存在', 404);

  // Increment view count
  await env.DB.prepare(
    'UPDATE community_works SET view_count = view_count + 1 WHERE id = ?',
  ).bind(workId).run();

  let liked = false;
  let bookmarked = false;
  let myStamps: string[] = [];
  if (auth) {
    const [likeRow, bookmarkRow, stampRows] = await Promise.all([
      env.DB.prepare(
        'SELECT 1 FROM community_likes WHERE user_id = ? AND work_id = ?',
      ).bind(auth.userId, workId).first(),
      env.DB.prepare(
        'SELECT 1 FROM community_bookmarks WHERE user_id = ? AND work_id = ?',
      ).bind(auth.userId, workId).first(),
      env.DB.prepare(
        'SELECT stamp_type FROM community_stamps WHERE user_id = ? AND work_id = ?',
      ).bind(auth.userId, workId).all(),
    ]);
    liked = !!likeRow;
    bookmarked = !!bookmarkRow;
    myStamps = (stampRows.results || []).map((r: any) => r.stamp_type);
  }

  const galleryBase = 'https://gallery.46log.com/d/community';

  return success({
    data: {
      id: work.id,
      imageUrl: `${galleryBase}/${work.thumbnail_key || work.image_key}`,
      fullImageUrl: `${galleryBase}/${work.image_key}`,
      memberName: work.member_name,
      romajiName: work.romaji_name,
      groupStyle: work.group_style,
      theme: work.theme,
      likeCount: work.like_count,
      viewCount: work.view_count + 1,
      liked,
      bookmarked,
      stamps: {
        totoi: work.stamp_totoi || 0,
        numa:  work.stamp_numa  || 0,
        ose:   work.stamp_ose   || 0,
        kami:  work.stamp_kami  || 0,
        yusho: work.stamp_yusho || 0,
      },
      myStamps,
      allowDownload: work.allow_download === 1,
      author: work.user_id ? {
        id: work.user_id,
        displayName: work.author_name || '匿名',
        avatarUrl: work.author_avatar,
      } : { id: null, displayName: '匿名', avatarUrl: null },
      createdAt: work.created_at,
    },
  });
}

/** POST /api/community/works — publish a work */
export async function handleCreateWork(req: Request, env: Env): Promise<Response> {
  const auth = await getAuthUser(req, env);
  // Auth optional: guests can publish (user_id = null)

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return error('无效的请求体，需要 multipart/form-data', 400);
  }

  const image = formData.get('image') as File | null;
  const thumbnail = formData.get('thumbnail') as File | null;
  const memberName = formData.get('memberName') as string;
  const romajiName = formData.get('romajiName') as string | null;
  const groupStyle = formData.get('groupStyle') as string;
  const theme = formData.get('theme') as string | null;
  const allowDownload = formData.get('allowDownload') !== '0' ? 1 : 0;
  const isAnonymous = formData.get('anonymous') === '1';
  const authorId = isAnonymous ? null : (auth?.userId ?? null);

  if (!image) return error('缺少图片文件', 400);
  if (!memberName) return error('缺少成员名', 400);
  if (!groupStyle) return error('缺少团体信息', 400);

  // Validate file size (max 10MB)
  if (image.size > 10 * 1024 * 1024) return error('图片文件过大 (最大10MB)', 400);

  const id = nanoid();
  const safeName = memberName.replace(/[^a-zA-Z0-9\u3000-\u9fff\u4e00-\u9fff\u3040-\u30ff]/g, '_');
  const imageKey = `works/${id}/${safeName}.png`;
  const thumbKey = thumbnail ? `works/${id}/${safeName}_thumb.webp` : null;

  // Upload to Alist
  const imageData = await image.arrayBuffer();
  const uploadOk = await uploadToAlist(env, `/community/${imageKey}`, imageData, 'image/png');
  if (!uploadOk) return error('图片上传失败，请稍后重试', 500);

  if (thumbnail) {
    const thumbData = await thumbnail.arrayBuffer();
    const thumbOk = await uploadToAlist(env, `/community/${thumbKey}`, thumbData, 'image/webp');
    if (!thumbOk) {
      console.error(`[Community] Thumbnail upload failed for ${id}, continuing without thumbnail`);
    }
  }

  // Insert into D1
  await env.DB.prepare(`
    INSERT INTO community_works (id, user_id, image_key, thumbnail_key, member_name, romaji_name, group_style, theme, allow_download)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    authorId,
    imageKey,
    thumbKey,
    memberName,
    romajiName || null,
    groupStyle,
    theme || null,
    allowDownload,
  ).run();

  const galleryBase = 'https://gallery.46log.com/d/community';

  return success({
    data: {
      id,
      imageUrl: `${galleryBase}/${thumbKey || imageKey}`,
      fullImageUrl: `${galleryBase}/${imageKey}`,
    },
  }, 201);
}

/** DELETE /api/community/works/:id */
export async function handleDeleteWork(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录', 401);

  const work = await env.DB.prepare(
    'SELECT id, user_id, image_key FROM community_works WHERE id = ?',
  ).bind(workId).first<{ id: string; user_id: string | null; image_key: string }>();

  if (!work) return error('作品不存在', 404);

  // Only author or admin can delete
  if (work.user_id !== auth.userId && auth.role !== 'admin') {
    return error('无权删除此作品', 403);
  }

  // Soft delete
  await env.DB.prepare(
    "UPDATE community_works SET status = 'deleted', updated_at = datetime('now') WHERE id = ?",
  ).bind(workId).run();

  // Also delete from Alist (fire and forget)
  deleteFromAlist(env, '/community/works', [workId]).catch(console.error);

  return success({ message: '作品已删除' });
}

/** POST /api/community/works/:id/like — toggle like */
export async function handleToggleLike(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录才能点赞', 401);

  // Check work exists
  const work = await env.DB.prepare(
    "SELECT id, like_count FROM community_works WHERE id = ? AND status = 'published'",
  ).bind(workId).first<{ id: string; like_count: number }>();
  if (!work) return error('作品不存在', 404);

  // Check if already liked
  const existing = await env.DB.prepare(
    'SELECT 1 FROM community_likes WHERE user_id = ? AND work_id = ?',
  ).bind(auth.userId, workId).first();

  let liked: boolean;
  let newCount: number;

  if (existing) {
    // Unlike
    await env.DB.prepare(
      'DELETE FROM community_likes WHERE user_id = ? AND work_id = ?',
    ).bind(auth.userId, workId).run();
    await env.DB.prepare(
      'UPDATE community_works SET like_count = MAX(0, like_count - 1), updated_at = datetime(\'now\') WHERE id = ?',
    ).bind(workId).run();
    liked = false;
    newCount = Math.max(0, work.like_count - 1);
  } else {
    // Like
    await env.DB.prepare(
      'INSERT INTO community_likes (user_id, work_id) VALUES (?, ?)',
    ).bind(auth.userId, workId).run();
    await env.DB.prepare(
      'UPDATE community_works SET like_count = like_count + 1, updated_at = datetime(\'now\') WHERE id = ?',
    ).bind(workId).run();
    liked = true;
    newCount = work.like_count + 1;
  }

  return success({ data: { liked, likeCount: newCount } });
}

/** POST /api/community/works/:id/bookmark — toggle bookmark */
export async function handleToggleBookmark(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录才能收藏', 401);

  const work = await env.DB.prepare(
    "SELECT id FROM community_works WHERE id = ? AND status = 'published'",
  ).bind(workId).first();
  if (!work) return error('作品不存在', 404);

  const existing = await env.DB.prepare(
    'SELECT 1 FROM community_bookmarks WHERE user_id = ? AND work_id = ?',
  ).bind(auth.userId, workId).first();

  let bookmarked: boolean;

  if (existing) {
    await env.DB.prepare(
      'DELETE FROM community_bookmarks WHERE user_id = ? AND work_id = ?',
    ).bind(auth.userId, workId).run();
    bookmarked = false;
  } else {
    await env.DB.prepare(
      'INSERT INTO community_bookmarks (user_id, work_id) VALUES (?, ?)',
    ).bind(auth.userId, workId).run();
    bookmarked = true;
  }

  return success({ data: { bookmarked } });
}

/** GET /api/community/my-bookmarks — current user's bookmarked works */
export async function handleMyBookmarks(req: Request, env: Env): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录', 401);

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM community_bookmarks b
     JOIN community_works w ON b.work_id = w.id
     WHERE b.user_id = ? AND w.status = 'published'`,
  ).bind(auth.userId).first<{ total: number }>();
  const total = countResult?.total || 0;

  const works = await env.DB.prepare(`
    SELECT w.id, w.image_key, w.thumbnail_key, w.member_name, w.romaji_name,
           w.group_style, w.theme, w.like_count, w.view_count, w.allow_download,
           w.user_id, w.created_at, w.stamp_totoi, w.stamp_numa, w.stamp_ose, w.stamp_kami, w.stamp_yusho,
           u.display_name as author_name, u.avatar_url as author_avatar
    FROM community_bookmarks b
    JOIN community_works w ON b.work_id = w.id
    LEFT JOIN users u ON w.user_id = u.id
    WHERE b.user_id = ? AND w.status = 'published'
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(auth.userId, limit, offset).all();

  const workIds = (works.results || []).map((w: any) => w.id);
  let likedSet = new Set<string>();
  if (workIds.length > 0) {
    const placeholders = workIds.map(() => '?').join(',');
    const likes = await env.DB.prepare(
      `SELECT work_id FROM community_likes WHERE user_id = ? AND work_id IN (${placeholders})`,
    ).bind(auth.userId, ...workIds).all();
    likedSet = new Set((likes.results || []).map((l: any) => l.work_id));
  }

  const galleryBase = 'https://gallery.46log.com/d/community';

  return success({
    data: {
      works: (works.results || []).map((w: any) => ({
        id: w.id,
        imageUrl: `${galleryBase}/${w.thumbnail_key || w.image_key}`,
        fullImageUrl: `${galleryBase}/${w.image_key}`,
        memberName: w.member_name,
        romajiName: w.romaji_name,
        groupStyle: w.group_style,
        theme: w.theme,
        likeCount: w.like_count,
        liked: likedSet.has(w.id),
        bookmarked: true,
        stamps: {
          totoi: w.stamp_totoi || 0,
          numa:  w.stamp_numa  || 0,
          ose:   w.stamp_ose   || 0,
          kami:  w.stamp_kami  || 0,
          yusho: w.stamp_yusho || 0,
        },
        allowDownload: w.allow_download === 1,
        author: w.user_id ? {
          id: w.user_id,
          displayName: w.author_name || '匿名',
          avatarUrl: w.author_avatar,
        } : { id: null, displayName: '匿名', avatarUrl: null },
        createdAt: w.created_at,
      })),
      total,
      page,
      hasMore: offset + limit < total,
    },
  });
}

/** POST /api/community/works/:id/stamp — toggle stamp */
const VALID_STAMPS = ['totoi', 'numa', 'ose', 'kami', 'yusho'] as const;
type StampType = typeof VALID_STAMPS[number];

export async function handleToggleStamp(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录才能盖章', 401);

  let body: any;
  try { body = await req.json(); } catch { return error('无效的 JSON', 400); }

  const { type } = body;
  if (!type || !VALID_STAMPS.includes(type as StampType)) {
    return error(`无效的 stamp 类型，必须是 ${VALID_STAMPS.join('|')}`, 400);
  }

  const col = `stamp_${type}` as const;

  const work = await env.DB.prepare(
    `SELECT id, ${col} FROM community_works WHERE id = ? AND status = 'published'`,
  ).bind(workId).first<any>();
  if (!work) return error('作品不存在', 404);

  const existing = await env.DB.prepare(
    'SELECT 1 FROM community_stamps WHERE user_id = ? AND work_id = ? AND stamp_type = ?',
  ).bind(auth.userId, workId, type).first();

  let stamped: boolean;
  let newCount: number;
  const cur: number = work[col] ?? 0;

  if (existing) {
    await env.DB.prepare(
      'DELETE FROM community_stamps WHERE user_id = ? AND work_id = ? AND stamp_type = ?',
    ).bind(auth.userId, workId, type).run();
    await env.DB.prepare(
      `UPDATE community_works SET ${col} = MAX(0, ${col} - 1), updated_at = datetime('now') WHERE id = ?`,
    ).bind(workId).run();
    stamped = false;
    newCount = Math.max(0, cur - 1);
  } else {
    await env.DB.prepare(
      'INSERT INTO community_stamps (user_id, work_id, stamp_type) VALUES (?, ?, ?)',
    ).bind(auth.userId, workId, type).run();
    await env.DB.prepare(
      `UPDATE community_works SET ${col} = ${col} + 1, updated_at = datetime('now') WHERE id = ?`,
    ).bind(workId).run();
    stamped = true;
    newCount = cur + 1;
  }

  return success({ data: { type, stamped, count: newCount } });
}

/** GET /api/community/my-works */
export async function handleMyWorks(req: Request, env: Env): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录', 401);

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    "SELECT COUNT(*) as total FROM community_works WHERE user_id = ? AND status != 'deleted'",
  ).bind(auth.userId).first<{ total: number }>();
  const total = countResult?.total || 0;

  const works = await env.DB.prepare(`
    SELECT id, image_key, thumbnail_key, member_name, romaji_name,
           group_style, theme, like_count, view_count, allow_download, status, created_at
    FROM community_works
    WHERE user_id = ? AND status != 'deleted'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(auth.userId, limit, offset).all();

  const galleryBase = 'https://gallery.46log.com/d/community';

  // Fetch author info once for all works
  const userRow = await env.DB.prepare(
    'SELECT id, display_name, avatar_url FROM users WHERE id = ?',
  ).bind(auth.userId).first<{ id: string; display_name: string; avatar_url: string | null }>();

  const author = {
    id: auth.userId,
    displayName: userRow?.display_name || auth.userId,
    avatarUrl: userRow?.avatar_url || null,
  };

  return success({
    data: {
      works: (works.results || []).map((w: any) => ({
        id: w.id,
        imageUrl: `${galleryBase}/${w.thumbnail_key || w.image_key}`,
        fullImageUrl: `${galleryBase}/${w.image_key}`,
        memberName: w.member_name,
        romajiName: w.romaji_name,
        groupStyle: w.group_style,
        theme: w.theme,
        likeCount: w.like_count,
        liked: false,
        viewCount: w.view_count,
        allowDownload: w.allow_download === 1,
        status: w.status,
        createdAt: w.created_at,
        author,
      })),
      total,
      page,
      hasMore: offset + limit < total,
    },
  });
}
