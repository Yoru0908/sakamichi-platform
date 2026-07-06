// sakamichi-community Worker
// Split from sakamichi-auth 2026-07-05.
// Owns /api/community/* (生写社区), /api/repo/* (Repo 社区), /api/report + /api/manage/reports*.

import type { Env } from './types.ts';
import { withCors, error } from './utils/response.ts';

import {
  handleListWorks,
  handleGetWork,
  handleCreateWork,
  handleDeleteWork,
  handleToggleLike,
  handleMyWorks,
  handleUserWorks,
  handleToggleBookmark,
  handleMyBookmarks,
  handleToggleStamp,
} from './routes/community.ts';
import {
  handleListRepoWorks,
  handleCreateRepoWork,
  handleUpdateRepoWork,
  handleDeleteRepoWork,
  handleRepoReact,
  handleMyRepoWorks,
  handleGetRepoWork,
  handleGetRepoStats,
} from './routes/repo.ts';
import { handleSubmitReport, handleListReports, handleUpdateReport } from './routes/report.ts';

type Handler = (req: Request, env: Env) => Promise<Response>;

/** Exact-path routes: "METHOD /path" */
const routes: Record<string, Handler> = {
  'GET /api/community/works': handleListWorks,
  'POST /api/community/works': handleCreateWork,
  'GET /api/community/my-works': handleMyWorks,
  'GET /api/community/my-bookmarks': handleMyBookmarks,
  'GET /api/repo/works': handleListRepoWorks,
  'POST /api/repo/works': handleCreateRepoWork,
  'GET /api/repo/my-works': handleMyRepoWorks,
  'GET /api/repo/stats': handleGetRepoStats,
  'POST /api/report': handleSubmitReport,
  'GET /api/manage/reports': handleListReports,
};

/** Param routes: prefix/suffix matching, longest-suffix first */
async function matchParamRoute(req: Request, env: Env, path: string, method: string): Promise<Response | null> {
  // /api/community/users/:id/works
  if (path.startsWith('/api/community/users/') && path.endsWith('/works') && method === 'GET') {
    return handleUserWorks(req, env, path.slice('/api/community/users/'.length, -'/works'.length));
  }
  // /api/community/works/:id[/like|/bookmark|/stamp]
  if (path.startsWith('/api/community/works/')) {
    const rest = path.slice('/api/community/works/'.length);
    if (method === 'POST' && rest.endsWith('/like')) return handleToggleLike(req, env, rest.slice(0, -'/like'.length));
    if (method === 'POST' && rest.endsWith('/bookmark')) return handleToggleBookmark(req, env, rest.slice(0, -'/bookmark'.length));
    if (method === 'POST' && rest.endsWith('/stamp')) return handleToggleStamp(req, env, rest.slice(0, -'/stamp'.length));
    if (method === 'GET') return handleGetWork(req, env, rest);
    if (method === 'DELETE') return handleDeleteWork(req, env, rest);
  }
  // /api/repo/works/:id[/react]
  if (path.startsWith('/api/repo/works/')) {
    const rest = path.slice('/api/repo/works/'.length);
    if (method === 'POST' && rest.endsWith('/react')) return handleRepoReact(req, env, rest.slice(0, -'/react'.length));
    if (method === 'PUT') return handleUpdateRepoWork(req, env, rest);
    if (method === 'GET') return handleGetRepoWork(req, env, rest);
    if (method === 'DELETE') return handleDeleteRepoWork(req, env, rest);
  }
  // /api/manage/reports/:id
  if (path.startsWith('/api/manage/reports/') && method === 'PATCH') {
    return handleUpdateReport(req, env, path.slice('/api/manage/reports/'.length));
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    const origin = req.headers.get('Origin');

    if (method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), env, origin);
    }

    let res: Response;
    try {
      const handler = routes[`${method} ${path}`];
      res = handler
        ? await handler(req, env)
        : (await matchParamRoute(req, env, path, method)) ?? error('not found', 404);
    } catch (err) {
      console.error('[community] unhandled error:', err);
      res = error('internal error', 500);
    }

    return withCors(res, env, origin);
  },
};
