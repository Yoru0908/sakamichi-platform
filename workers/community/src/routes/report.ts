/** Unified report handler for community_work and repo_work */

import type { Env } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error, success } from '../utils/response';

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

function nanoid(size = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

const VALID_TYPES = ['community_work', 'repo_work'] as const;
type TargetType = typeof VALID_TYPES[number];

const VALID_REASONS = [
  'inappropriate',
  'spam',
  'copyright',
  'personal_info',
  'other',
] as const;
type ReasonCode = typeof VALID_REASONS[number];

export const REASON_LABELS: Record<ReasonCode, string> = {
  inappropriate: '不适当内容',
  spam:          '垃圾内容',
  copyright:     '版权问题',
  personal_info: '包含个人信息',
  other:         '其他',
};

/** POST /api/report — submit a report */
export async function handleSubmitReport(req: Request, env: Env): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录才能举报', 401);

  let body: any;
  try { body = await req.json(); } catch { return error('无效的 JSON', 400); }

  const { targetType, targetId, reason } = body;

  if (!targetType || !VALID_TYPES.includes(targetType as TargetType)) {
    return error(`targetType 必须是 ${VALID_TYPES.join('|')}`, 400);
  }
  if (!targetId || typeof targetId !== 'string') {
    return error('缺少 targetId', 400);
  }
  if (!reason || !VALID_REASONS.includes(reason as ReasonCode)) {
    return error(`reason 必须是 ${VALID_REASONS.join('|')}`, 400);
  }

  // Verify target exists
  if (targetType === 'community_work') {
    const work = await env.DB.prepare(
      "SELECT id FROM community_works WHERE id = ? AND status = 'published'",
    ).bind(targetId).first();
    if (!work) return error('作品不存在', 404);
  } else {
    const work = await env.DB.prepare(
      "SELECT id FROM repo_works WHERE id = ? AND status = 'published'",
    ).bind(targetId).first();
    if (!work) return error('Repo不存在', 404);
  }

  // Prevent duplicate reports from same user within 24h
  const existing = await env.DB.prepare(
    `SELECT id FROM reports
     WHERE user_id = ? AND target_type = ? AND target_id = ?
       AND created_at > datetime('now', '-1 day')`,
  ).bind(auth.userId, targetType, targetId).first();
  if (existing) return error('您已举报过该内容，请勿重复举报', 409);

  const id = nanoid();
  await env.DB.prepare(
    'INSERT INTO reports (id, user_id, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, auth.userId, targetType, targetId, reason).run();

  return success({ data: { id } }, 201);
}

/** GET /api/manage/reports — admin view of pending reports */
export async function handleListReports(req: Request, env: Env): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录', 401);
  if (auth.role !== 'admin') return error('权限不足', 403);

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending';
  const page   = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit  = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM reports WHERE status = ?',
  ).bind(status).first<{ total: number }>();
  const total = countResult?.total || 0;

  const rows = await env.DB.prepare(`
    SELECT r.id, r.user_id, r.target_type, r.target_id, r.reason, r.status, r.created_at,
           u.display_name as reporter_name
    FROM reports r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.status = ?
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(status, limit, offset).all();

  return success({
    data: {
      reports: (rows.results || []).map((r: any) => ({
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
        reporter: { id: r.user_id, displayName: r.reporter_name || '匿名' },
      })),
      total,
      page,
      hasMore: offset + limit < total,
    },
  });
}

/** PATCH /api/manage/reports/:id — admin update report status */
export async function handleUpdateReport(req: Request, env: Env, reportId: string): Promise<Response> {
  const auth = await getAuthUser(req, env);
  if (!auth) return error('需要登录', 401);
  if (auth.role !== 'admin') return error('权限不足', 403);

  let body: any;
  try { body = await req.json(); } catch { return error('无效的 JSON', 400); }

  const { status } = body;
  if (!['reviewed', 'dismissed'].includes(status)) {
    return error('status 必须是 reviewed|dismissed', 400);
  }

  const report = await env.DB.prepare('SELECT id FROM reports WHERE id = ?').bind(reportId).first();
  if (!report) return error('举报不存在', 404);

  await env.DB.prepare('UPDATE reports SET status = ? WHERE id = ?').bind(status, reportId).run();
  return success({ data: { id: reportId, status } });
}
