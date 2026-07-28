// sakamichi-miguri Worker
// Split from sakamichi-auth 2026-07-05. Owns /api/miguri/* and /api/manage/miguri/*.
// Auto-sync is triggered by Homeserver cron via POST /api/manage/miguri/sync-from-source
// (Cloudflare account cron triggers are at the free-tier limit of 5).

import type { Env } from './types.ts';
import { withCors, error, success } from './utils/response.ts';

import {
  handleGetMiguriEvents,
  handleCreateMiguriEntries,
  handleUpdateMiguriEntry,
  handleDeleteMiguriEntry,
  handleGetMiguriCalendarIcs,
  handleGetMiguriGoogleCalendarUrl,
  handleGetMiguriSoldOut,
  handleGetMiguriLottery,
} from './routes/miguri.ts';
import { handleImportMiguriEntries } from './routes/entry-import.ts';
import { handleMiguriSync, handleMiguriSoldOutImport, syncMiguriFromSource } from './routes/manage-miguri.ts';
import { handleDisconnectGoogleCalendar } from './routes/google-calendar.ts';
import {
  handleCreateCalendarSubscription,
  handleGetCalendarSubscription,
  handleGetLotteryCalendar,
  handleGetPersonalCalendar,
  handleRegenerateCalendarSubscription,
  handleRevokeCalendarSubscription,
} from './routes/calendar-subscriptions.ts';
import {
  handleGetCompleteGroupCalendar,
  handleGetOfficialScheduleCalendar,
} from './routes/calendar-feeds.ts';

/** Server-to-server auth for the Homeserver cron trigger */
function isSyncSecretValid(req: Request, env: Env): boolean {
  const secret = req.headers.get('x-miguri-sync-secret');
  return Boolean(secret && env.MIGURI_SYNC_SECRET && secret === env.MIGURI_SYNC_SECRET);
}

type Handler = (req: Request, env: Env) => Promise<Response>;

/** Exact-path routes: "METHOD /path" */
const routes: Record<string, Handler> = {
  'GET /api/miguri/events': handleGetMiguriEvents,
  'POST /api/miguri/entries': handleCreateMiguriEntries,
  'POST /api/miguri/entries/import': handleImportMiguriEntries,
  'GET /api/miguri/calendar.ics': handleGetMiguriCalendarIcs,
  'GET /api/miguri/calendar/subscription': handleGetCalendarSubscription,
  'POST /api/miguri/calendar/subscription': handleCreateCalendarSubscription,
  'POST /api/miguri/calendar/subscription/regenerate': handleRegenerateCalendarSubscription,
  'DELETE /api/miguri/calendar/subscription': handleRevokeCalendarSubscription,
  'GET /api/miguri/calendar/google-url': handleGetMiguriGoogleCalendarUrl,
  'POST /api/miguri/calendar/google-disconnect': handleDisconnectGoogleCalendar,
  'GET /api/miguri/soldout': handleGetMiguriSoldOut,
  'GET /api/miguri/lottery': (req) => handleGetMiguriLottery(req),
  'POST /api/miguri/soldout-import': handleMiguriSoldOutImport,
  'POST /api/manage/miguri/sync': handleMiguriSync,
  'POST /api/manage/miguri/sync-from-source': async (req, env) => {
    if (!isSyncSecretValid(req, env)) return error('权限不足', 403);
    const result = await syncMiguriFromSource(env);
    return success({ data: result });
  },
};

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
      if (handler) {
        res = await handler(req, env);
      } else if (path.startsWith('/api/miguri/entries/') && method === 'PUT') {
        res = await handleUpdateMiguriEntry(req, env, path.slice('/api/miguri/entries/'.length));
      } else if (path.startsWith('/api/miguri/entries/') && method === 'DELETE') {
        res = await handleDeleteMiguriEntry(req, env, path.slice('/api/miguri/entries/'.length));
      } else if (path.startsWith('/api/miguri/calendar/lottery/') && path.endsWith('.ics') && method === 'GET') {
        const group = path.slice('/api/miguri/calendar/lottery/'.length, -'.ics'.length);
        res = await handleGetLotteryCalendar(req, env, group);
      } else if (path.startsWith('/api/miguri/calendar/official/') && path.endsWith('.ics') && method === 'GET') {
        const group = path.slice('/api/miguri/calendar/official/'.length, -'.ics'.length);
        res = await handleGetOfficialScheduleCalendar(req, env, group);
      } else if (path.startsWith('/api/miguri/calendar/complete/') && path.endsWith('.ics') && method === 'GET') {
        const group = path.slice('/api/miguri/calendar/complete/'.length, -'.ics'.length);
        res = await handleGetCompleteGroupCalendar(req, env, group);
      } else if (path.startsWith('/api/miguri/calendar/personal/') && path.endsWith('.ics') && method === 'GET') {
        const token = path.slice('/api/miguri/calendar/personal/'.length, -'.ics'.length);
        res = await handleGetPersonalCalendar(req, env, token);
      } else {
        res = error('not found', 404);
      }
    } catch (err) {
      console.error('[miguri] unhandled error:', err);
      res = error('internal error', 500);
    }

    return withCors(res, env, origin);
  },
};
