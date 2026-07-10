// sakamichi-auth Worker — 认证 + 用户 + 付费/邀请码/认证审核 + Ko-fi webhook
// 2026-07-05 重构：miguri → sakamichi-miguri Worker, community/repo/report → sakamichi-community Worker
// if/else 链 → 路由表

import type { Env } from './types';
import { withCors, error } from './utils/response';

import { handleRegister } from './routes/register';
import { handleLogin } from './routes/login';
import { handleLogout } from './routes/logout';
import { handleMe } from './routes/me';
import { handleRefresh } from './routes/refresh';
import { handleVerify } from './routes/verify';
import {
  handleDiscordRedirect,
  handleDiscordCallback,
  handleGoogleRedirect,
  handleGoogleCalendarConnectRedirect,
  handleGoogleCallback,
} from './routes/oauth';
import {
  handleGetPreferences,
  handleUpdatePreferences,
  handleGetFavorites,
  handleUpdateFavorites,
  handleGetBookmarks,
  handleAddBookmark,
  handleRemoveBookmark,
} from './routes/preferences';
import { handleGetProfile, handleUpdateProfile } from './routes/profile';
import { handleChangePassword } from './routes/password';
import { handleKofiWebhook } from './routes/webhook-kofi';
import { handleCreateInviteCode, handleListInviteCodes, handleRedeemInviteCode } from './routes/invite-codes';
import { handleGetPaymentLinks, handleAddPaymentLink, handleRemovePaymentLink } from './routes/payment-links';
import { handleListUnmatchedPayments, handleResolveUnmatchedPayment, handleListSubscriptions, handleAdminStats } from './routes/admin-payments';
import { handleListVerifications, handleResolveVerification, handleRequestVerification } from './routes/admin-verification';
import { handleGetDiscordStatus, handleSyncDiscordRoles } from './routes/discord';
import { syncDiscordRolesForUser } from './utils/discord-bot';

type Handler = (req: Request, env: Env) => Promise<Response>;

/** Exact-path routes: "METHOD /path" */
const routes: Record<string, Handler> = {
  // ── Auth ──
  'POST /api/auth/register': handleRegister,
  'POST /api/auth/login': handleLogin,
  'POST /api/auth/logout': handleLogout,
  'GET /api/auth/me': handleMe,
  'POST /api/auth/refresh': handleRefresh,
  'GET /api/auth/verify': handleVerify,
  'POST /api/auth/redeem-invite': handleRedeemInviteCode,
  'GET /api/auth/geo-check': async (req) => {
    const country = (req as any).cf?.country || '';
    return new Response(JSON.stringify({ country }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },

  // ── OAuth ──
  'GET /api/auth/discord': handleDiscordRedirect,
  'GET /api/auth/callback/discord': handleDiscordCallback,
  'GET /api/auth/google': handleGoogleRedirect,
  'GET /api/auth/google/calendar': handleGoogleCalendarConnectRedirect,
  'GET /api/auth/callback/google': handleGoogleCallback,

  // ── User profile / preferences ──
  'GET /api/user/profile': handleGetProfile,
  'PUT /api/user/profile': handleUpdateProfile,
  'GET /api/user/preferences': handleGetPreferences,
  'PUT /api/user/preferences': handleUpdatePreferences,
  'GET /api/user/favorites': handleGetFavorites,
  'PUT /api/user/favorites': handleUpdateFavorites,
  'PUT /api/user/password': handleChangePassword,
  'GET /api/user/bookmarks': handleGetBookmarks,
  'POST /api/user/bookmarks': handleAddBookmark,
  'DELETE /api/user/bookmarks': handleRemoveBookmark,
  'POST /api/user/request-verification': handleRequestVerification,
  'GET /api/user/discord/status': handleGetDiscordStatus,
  'POST /api/user/discord/sync': handleSyncDiscordRoles,

  // ── Payment links ──
  'GET /api/user/payment-links': handleGetPaymentLinks,
  'POST /api/user/payment-links': handleAddPaymentLink,
  'DELETE /api/user/payment-links': handleRemovePaymentLink,

  // ── Webhook (token-verified) ──
  'POST /api/webhook/kofi': handleKofiWebhook,

  // ── Admin (/api/manage/ to avoid WAF blocking "admin" paths) ──
  'POST /api/manage/invite-codes': handleCreateInviteCode,
  'GET /api/manage/invite-codes': handleListInviteCodes,
  'GET /api/manage/unmatched-payments': handleListUnmatchedPayments,
  'POST /api/manage/unmatched-payments/resolve': handleResolveUnmatchedPayment,
  'GET /api/manage/subscriptions': handleListSubscriptions,
  'GET /api/manage/stats': handleAdminStats,
  'GET /api/manage/verifications': handleListVerifications,
  'POST /api/manage/verifications/resolve': handleResolveVerification,
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    const origin = req.headers.get('Origin');

    // CORS preflight
    if (method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), env, origin);
    }

    let res: Response;
    try {
      const handler = routes[`${method} ${path}`];
      res = handler ? await handler(req, env) : error('Not found', 404);
    } catch (e) {
      console.error('[Auth Worker] Error:', e);
      res = error('Internal server error', 500);
    }

    return withCors(res, env, origin);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('[Cron] Running scheduled maintenance...');

    const expiringUsers = await env.DB.prepare(`
      SELECT DISTINCT user_id FROM user_subscriptions
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')
    `).all<{ user_id: string }>();

    // 1. Expire overdue subscriptions
    const expired = await env.DB.prepare(`
      UPDATE user_subscriptions SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')
    `).run();
    console.log(`[Cron] Expired ${expired.meta.changes} subscriptions`);

    for (const row of expiringUsers.results || []) {
      try {
        await syncDiscordRolesForUser(env, row.user_id);
      } catch (err) {
        console.error(`[Cron] Discord role sync failed for expired user ${row.user_id}:`, err);
      }
    }
    console.log(`[Cron] Discord role sync checked ${expiringUsers.results?.length || 0} expiring users`);

    // 2. Downgrade users with no active subscriptions
    const downgraded = await env.DB.prepare(`
      UPDATE users SET payment_status = 'expired', updated_at = datetime('now')
      WHERE payment_status = 'active'
        AND id NOT IN (SELECT user_id FROM user_subscriptions WHERE status = 'active')
        AND role NOT IN ('admin', 'translator')
    `).run();
    console.log(`[Cron] Downgraded ${downgraded.meta.changes} users`);

    // 3. Clean resolved unmatched payments older than 30 days
    const cleanResolved = await env.DB.prepare(`
      DELETE FROM unmatched_payments
      WHERE resolved_at IS NOT NULL AND created_at < datetime('now', '-30 days')
    `).run();
    console.log(`[Cron] Cleaned ${cleanResolved.meta.changes} resolved unmatched payments`);

    // 4. Clean orphaned unmatched payments older than 90 days
    const cleanOrphaned = await env.DB.prepare(`
      DELETE FROM unmatched_payments
      WHERE resolved_at IS NULL AND created_at < datetime('now', '-90 days')
    `).run();
    console.log(`[Cron] Cleaned ${cleanOrphaned.meta.changes} orphaned unmatched payments`);

    // 5. Clean expired invite codes older than 30 days
    const cleanCodes = await env.DB.prepare(`
      DELETE FROM invite_codes
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now', '-30 days')
    `).run();
    console.log(`[Cron] Cleaned ${cleanCodes.meta.changes} expired invite codes`);

    // 6. Clean expired/cancelled subscriptions older than 180 days
    const cleanSubs = await env.DB.prepare(`
      DELETE FROM user_subscriptions
      WHERE status IN ('expired', 'cancelled') AND updated_at < datetime('now', '-180 days')
    `).run();
    console.log(`[Cron] Cleaned ${cleanSubs.meta.changes} old subscriptions`);

    // Miguri auto-sync moved to sakamichi-miguri Worker,
    // triggered by Homeserver cron via POST /api/manage/miguri/sync-from-source
  },
};
