/** Repo community routes — 握手Repo CRUD + reactions */

import type { Env } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, success } from '../utils/response';

// ── Helpers ──

function getAccessToken(req: Request): string | null {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

async function getAuthUser(req: Request, env: Env): Promise<{ userId: string; role: string } | null> {
  const token = getAccessToken(req);
  if (!token) return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) return null;
  return { userId: payload.sub, role: payload.role };
}

function nanoid(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

type ReactionType = 'lemon' | 'sweet' | 'funny' | 'pray';
const VALID_REACTIONS: ReactionType[] = ['lemon', 'sweet', 'funny', 'pray'];

function formatWork(w: any, myReactions: Set<string>, authorName: string | null): object {
  let messages: any[] = [];
  let tags: string[] = [];
  try { messages = JSON.parse(w.messages); } catch {}
  try { tags = JSON.parse(w.tags); } catch {}

  return {
    id: w.id,
    userId: w.user_id,
    userName: authorName || '匿名',
    memberId: w.member_id,
    memberName: w.member_name,
    groupId: w.group_id,
    customMemberAvatar: w.custom_member_avatar || '',
    eventDate: w.event_date,
    eventType: w.event_type,
    slotNumber: w.slot_number,
    ticketCount: w.ticket_count,
    nickname: w.nickname || '',
    messages,
    tags,
    template: w.template,
    reactions: {
      lemon: w.react_lemon,
      sweet: w.react_sweet,
      funny: w.react_funny,
      pray:  w.react_pray,
    },
    myReactions: VALID_REACTIONS.filter(r => myReactions.has(r)),
    isPublic: w.status === 'published',
    createdAt: w.created_at,
    updatedAt: w.updated_at || w.created_at,
    status: w.status,
  };
}

// ── Route Handlers ──

/** GET /api/repo/works */
export async function handleListRepoWorks(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const group    = url.searchParams.get('group') || '';
  const memberId = url.searchParams.get('memberId') || '';
  const tag      = url.searchParams.get('tag') || '';
  const query    = url.searchParams.get('q') || '';
  const sort     = url.searchParams.get('sort') || 'latest';
  const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit    = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset   = (page - 1) * limit;

  const auth = await getAuthUser(req, env);

  let where = "r.status = 'published'";
  const params: unknown[] = [];

  if (group) { where += ' AND r.group_id = ?'; params.push(group); }
  if (memberId) { where += ' AND r.member_id = ?'; params.push(memberId); }
  if (tag) { where += ' AND r.tags LIKE ?'; params.push(`%"${tag}"%`); }
  if (query) {
    where += ' AND (r.member_name LIKE ? OR r.nickname LIKE ? OR r.messages LIKE ? OR r.tags LIKE ?)';
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
  }

  const orderBy = sort === 'popular'
    ? '(r.react_lemon + r.react_sweet + r.react_funny + r.react_pray) DESC, r.created_at DESC'
    : 'r.created_at DESC';

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM repo_works r WHERE ${where}`,
  ).bind(...params).first<{ total: number }>();
  const total = countResult?.total || 0;

  const works = await env.DB.prepare(`
    SELECT r.id, r.user_id, r.member_id, r.member_name, r.group_id, r.custom_member_avatar,
           r.event_date, r.event_type, r.slot_number, r.ticket_count, r.nickname,
           r.messages, r.tags, r.template,
           r.react_lemon, r.react_sweet, r.react_funny, r.react_pray,
           r.created_at,
           u.display_name as author_name
    FROM repo_works r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  const workList = works.results || [];
  const workIds = workList.map((w: any) => w.id);

  // Get current user's reactions for all works in batch
  let myReactionRows: any[] = [];
  if (auth && workIds.length > 0) {
    const placeholders = workIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT work_id, reaction_type FROM repo_reactions WHERE user_id = ? AND work_id IN (${placeholders})`,
    ).bind(auth.userId, ...workIds).all();
    myReactionRows = rows.results || [];
  }

  const myReactionMap = new Map<string, Set<string>>();
  for (const row of myReactionRows as any[]) {
    if (!myReactionMap.has(row.work_id)) myReactionMap.set(row.work_id, new Set());
    myReactionMap.get(row.work_id)!.add(row.reaction_type);
  }

  return success({
    data: {
      repos: workList.map((w: any) => formatWork(w, myReactionMap.get(w.id) || new Set(), w.author_name)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
}

/** POST /api/repo/works */
export async function handleCreateRepoWork(req: Request, env: Env): Promise<Response> {
  const auth = await getAuthUser(req, env);

  let body: any;
  try { body = await req.json(); } catch { return error('无效的 JSON', 400); }

  const { memberId, memberName, groupId, customMemberAvatar, eventDate, eventType, slotNumber, ticketCount,
          nickname, messages, tags, template, isPublic } = body;

  if (!memberId || !memberName || !groupId || !eventDate) {
    return error('缺少必要字段 (memberId, memberName, groupId, eventDate)', 400);
  }
  if (!Array.isArray(messages)) return error('messages 必须是数组', 400);

  const id = nanoid();
  const userId = auth?.userId ?? null;
  const status = isPublic === false ? 'draft' : 'published';

  if (status === 'draft' && !auth) return error('需要登录后保存草稿', 401);

  await env.DB.prepare(`
    INSERT INTO repo_works
      (id, user_id, member_id, member_name, group_id, custom_member_avatar, event_date, event_type,
       slot_number, ticket_count, nickname, messages, tags, template, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, memberId, memberName, groupId, customMemberAvatar || null, eventDate,
    eventType || 'ミーグリ',
    slotNumber || 1,
    ticketCount || 1,
    nickname || '',
    JSON.stringify(messages),
    JSON.stringify(tags || []),
    template || 'meguri',
    status,
  ).run();

  return success({ data: { id } }, 201);
}

/** PUT /api/repo/works/:id */
export async function handleUpdateRepoWork(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录', 401);

  let body: any;
  try { body = await req.json(); } catch { return error('无效的 JSON', 400); }

  const { memberId, memberName, groupId, customMemberAvatar, eventDate, eventType, slotNumber, ticketCount,
          nickname, messages, tags, template, isPublic } = body;

  if (!memberId || !memberName || !groupId || !eventDate) {
    return error('缺少必要字段 (memberId, memberName, groupId, eventDate)', 400);
  }
  if (!Array.isArray(messages)) return error('messages 必须是数组', 400);

  const existing = await env.DB.prepare(
    'SELECT id, user_id FROM repo_works WHERE id = ? AND status != \'deleted\''
  ).bind(workId).first<{ id: string; user_id: string | null }>();

  const status = isPublic === false ? 'draft' : 'published';

  if (existing) {
    if (existing.user_id !== auth.userId && auth.role !== 'admin') return error('无权修改', 403);
    await env.DB.prepare(`
      UPDATE repo_works
      SET member_id = ?, member_name = ?, group_id = ?, custom_member_avatar = ?, event_date = ?, event_type = ?,
           slot_number = ?, ticket_count = ?, nickname = ?, messages = ?, tags = ?, template = ?,
           status = ?, updated_at = datetime('now')
     WHERE id = ?
   `).bind(
     memberId,
     memberName,
     groupId,
     customMemberAvatar || null,
     eventDate,
     eventType || 'ミーグリ',
     slotNumber || 1,
     ticketCount || 1,
      nickname || '',
      JSON.stringify(messages),
      JSON.stringify(tags || []),
      template || 'meguri',
      status,
      workId,
    ).run();

    return success({ data: { id: workId, created: false, status } });
  }

  await env.DB.prepare(`
    INSERT INTO repo_works
      (id, user_id, member_id, member_name, group_id, custom_member_avatar, event_date, event_type,
       slot_number, ticket_count, nickname, messages, tags, template, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   `).bind(
     workId,
     auth.userId,
     memberId,
     memberName,
     groupId,
     customMemberAvatar || null,
     eventDate,
     eventType || 'ミーグリ',
     slotNumber || 1,
     ticketCount || 1,
    nickname || '',
    JSON.stringify(messages),
    JSON.stringify(tags || []),
    template || 'meguri',
    status,
  ).run();

  return success({ data: { id: workId, created: true, status } }, 201);
}

/** DELETE /api/repo/works/:id */
export async function handleDeleteRepoWork(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录', 401);

  const work = await env.DB.prepare(
    'SELECT id, user_id FROM repo_works WHERE id = ?',
  ).bind(workId).first<{ id: string; user_id: string | null }>();

  if (!work) return error('Repo不存在', 404);
  if (work.user_id !== auth.userId && auth.role !== 'admin') return error('无权删除', 403);

  await env.DB.prepare(
    "UPDATE repo_works SET status = 'deleted', updated_at = datetime('now') WHERE id = ?",
  ).bind(workId).run();

  return success({ message: '已删除' });
}

/** POST /api/repo/works/:id/react */
export async function handleRepoReact(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录才能反应', 401);

  let body: any;
  try { body = await req.json(); } catch { return error('无效的 JSON', 400); }

  const { type } = body;
  if (!type || !VALID_REACTIONS.includes(type as ReactionType)) {
    return error(`无效的反应类型，必须是 ${VALID_REACTIONS.join('|')}`, 400);
  }

  const work = await env.DB.prepare(
    "SELECT id, react_lemon, react_sweet, react_funny, react_pray FROM repo_works WHERE id = ? AND status = 'published'",
  ).bind(workId).first<any>();
  if (!work) return error('Repo不存在', 404);

  // Toggle reaction
  const existing = await env.DB.prepare(
    'SELECT 1 FROM repo_reactions WHERE user_id = ? AND work_id = ? AND reaction_type = ?',
  ).bind(auth.userId, workId, type).first();

  const col = `react_${type}`;
  const curCount: number = (work as Record<string, any>)[col] ?? 0;
  let newCount: number;
  let reacted: boolean;

  if (existing) {
    await env.DB.prepare(
      'DELETE FROM repo_reactions WHERE user_id = ? AND work_id = ? AND reaction_type = ?',
    ).bind(auth.userId, workId, type).run();
    await env.DB.prepare(
      `UPDATE repo_works SET ${col} = MAX(0, ${col} - 1), updated_at = datetime('now') WHERE id = ?`,
    ).bind(workId).run();
    newCount = Math.max(0, curCount - 1);
    reacted = false;
  } else {
    await env.DB.prepare(
      'INSERT INTO repo_reactions (user_id, work_id, reaction_type) VALUES (?, ?, ?)',
    ).bind(auth.userId, workId, type).run();
    await env.DB.prepare(
      `UPDATE repo_works SET ${col} = ${col} + 1, updated_at = datetime('now') WHERE id = ?`,
    ).bind(workId).run();
    newCount = curCount + 1;
    reacted = true;
  }

  return success({ data: { type, reacted, count: newCount } });
}

/** GET /api/repo/works/:id */
export async function handleGetRepoWork(req: Request, env: Env, workId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);

  const work = await env.DB.prepare(`
    SELECT r.id, r.user_id, r.member_id, r.member_name, r.group_id, r.custom_member_avatar,
            r.event_date, r.event_type, r.slot_number, r.ticket_count, r.nickname,
            r.messages, r.tags, r.template,
            r.react_lemon, r.react_sweet, r.react_funny, r.react_pray,
            r.created_at, r.updated_at, r.status,
            u.display_name as author_name
    FROM repo_works r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.id = ?
  `).bind(workId).first<any>();

  if (!work) return error('Repo不存在', 404);
  if (work.status !== 'published' && (!auth || (work.user_id !== auth.userId && auth.role !== 'admin'))) {
    return error('Repo不存在', 404);
  }

  let myReactions = new Set<string>();
  if (auth) {
    const rows = await env.DB.prepare(
      'SELECT reaction_type FROM repo_reactions WHERE user_id = ? AND work_id = ?',
    ).bind(auth.userId, workId).all();
    for (const row of (rows.results || []) as any[]) {
      myReactions.add(row.reaction_type);
    }
  }

  return success({ data: formatWork(work, myReactions, work.author_name) });
}

export async function handleGetRepoStats(_req: Request, env: Env): Promise<Response> {
  const [totalRow, creatorRow, todayRow] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) as total FROM repo_works WHERE status = 'published'",
    ).first<{ total: number }>(),
    env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) as creators FROM repo_works WHERE status = 'published' AND user_id IS NOT NULL",
    ).first<{ creators: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) as today FROM repo_works WHERE status = 'published' AND date(created_at) = date('now')",
    ).first<{ today: number }>(),
  ]);

  return success({
    data: {
      total: totalRow?.total || 0,
      creators: creatorRow?.creators || 0,
      today: todayRow?.today || 0,
    },
  });
}

/** GET /api/repo/my-works */
export async function handleMyRepoWorks(req: Request, env: Env): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录', 401);

  const url = new URL(req.url);
  const group  = url.searchParams.get('group') || '';
  const memberId = url.searchParams.get('memberId') || '';
  const tag = url.searchParams.get('tag') || '';
  const query = url.searchParams.get('q') || '';
  const status = url.searchParams.get('status') || '';
  const sort = url.searchParams.get('sort') || 'latest';
  const page  = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  let where = "user_id = ? AND status != 'deleted'";
  const params: unknown[] = [auth.userId];

  if (group) { where += ' AND group_id = ?'; params.push(group); }
  if (memberId) { where += ' AND member_id = ?'; params.push(memberId); }
  if (tag) { where += ' AND tags LIKE ?'; params.push(`%"${tag}"%`); }
  if (status && status !== 'all') { where += ' AND status = ?'; params.push(status); }
  if (query) {
    where += ' AND (member_name LIKE ? OR nickname LIKE ? OR messages LIKE ? OR tags LIKE ?)';
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
  }

  const orderBy = sort === 'popular'
    ? '(react_lemon + react_sweet + react_funny + react_pray) DESC, created_at DESC'
    : 'created_at DESC';

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM repo_works WHERE ${where}`,
  ).bind(...params).first<{ total: number }>();
  const total = countResult?.total || 0;

  const userRow = await env.DB.prepare(
    'SELECT display_name FROM users WHERE id = ?',
  ).bind(auth.userId).first<{ display_name: string | null }>();

  const works = await env.DB.prepare(`
    SELECT id, user_id, member_id, member_name, group_id, custom_member_avatar,
            event_date, event_type, slot_number, ticket_count, nickname,
            messages, tags, template,
            react_lemon, react_sweet, react_funny, react_pray,
            status, created_at, updated_at
    FROM repo_works
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  const workIds = (works.results || []).map((w: any) => w.id);
  let myReactionMap = new Map<string, Set<string>>();
  if (workIds.length > 0) {
    const placeholders = workIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT work_id, reaction_type FROM repo_reactions WHERE user_id = ? AND work_id IN (${placeholders})`,
    ).bind(auth.userId, ...workIds).all();
    for (const row of (rows.results || []) as any[]) {
      if (!myReactionMap.has(row.work_id)) myReactionMap.set(row.work_id, new Set());
      myReactionMap.get(row.work_id)!.add(row.reaction_type);
    }
  }

  return success({
    data: {
      repos: (works.results || []).map((w: any) => formatWork(w, myReactionMap.get(w.id) || new Set(), userRow?.display_name || null)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
}
