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
import {
  handleListWorks,
  handleGetWork,
  handleCreateWork,
  handleDeleteWork,
  handleToggleLike,
  handleMyWorks,
  handleToggleBookmark,
  handleMyBookmarks,
  handleToggleStamp,
} from './routes/community';
import {
  handleListRepoWorks,
  handleCreateRepoWork,
  handleDeleteRepoWork,
  handleRepoReact,
  handleMyRepoWorks,
  handleGetRepoWork,
} from './routes/repo';
import { handleSubmitReport, handleListReports, handleUpdateReport } from './routes/report';

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
      // ── Auth routes ──
      if (path === '/api/auth/register' && method === 'POST') {
        res = await handleRegister(req, env);
      } else if (path === '/api/auth/login' && method === 'POST') {
        res = await handleLogin(req, env);
      } else if (path === '/api/auth/logout' && method === 'POST') {
        res = await handleLogout(req, env);
      } else if (path === '/api/auth/me' && method === 'GET') {
        res = await handleMe(req, env);
      } else if (path === '/api/auth/refresh' && method === 'POST') {
        res = await handleRefresh(req, env);
      } else if (path === '/api/auth/verify' && method === 'GET') {
        res = await handleVerify(req, env);

      // ── Geo check (no auth, returns visitor country) ──
      } else if (path === '/api/auth/geo-check' && method === 'GET') {
        const country = (req as any).cf?.country || '';
        res = new Response(JSON.stringify({ country }), {
          headers: { 'Content-Type': 'application/json' },
        });

      // ── OAuth routes ──
      } else if (path === '/api/auth/discord' && method === 'GET') {
        res = await handleDiscordRedirect(req, env);
      } else if (path === '/api/auth/callback/discord' && method === 'GET') {
        res = await handleDiscordCallback(req, env);
      } else if (path === '/api/auth/google' && method === 'GET') {
        res = await handleGoogleRedirect(req, env);
      } else if (path === '/api/auth/callback/google' && method === 'GET') {
        res = await handleGoogleCallback(req, env);

      // ── User profile routes ──
      } else if (path === '/api/user/profile' && method === 'GET') {
        res = await handleGetProfile(req, env);
      } else if (path === '/api/user/profile' && method === 'PUT') {
        res = await handleUpdateProfile(req, env);

      // ── User preference routes ──
      } else if (path === '/api/user/preferences' && method === 'GET') {
        res = await handleGetPreferences(req, env);
      } else if (path === '/api/user/preferences' && method === 'PUT') {
        res = await handleUpdatePreferences(req, env);
      } else if (path === '/api/user/favorites' && method === 'GET') {
        res = await handleGetFavorites(req, env);
      } else if (path === '/api/user/favorites' && method === 'PUT') {
        res = await handleUpdateFavorites(req, env);
      } else if (path === '/api/user/password' && method === 'PUT') {
        res = await handleChangePassword(req, env);

      // ── Episode bookmark routes ──
      } else if (path === '/api/user/bookmarks' && method === 'GET') {
        res = await handleGetBookmarks(req, env);
      } else if (path === '/api/user/bookmarks' && method === 'POST') {
        res = await handleAddBookmark(req, env);
      } else if (path === '/api/user/bookmarks' && method === 'DELETE') {
        res = await handleRemoveBookmark(req, env);

      // ── Webhook routes (no auth required, token-verified) ──
      } else if (path === '/api/webhook/kofi' && method === 'POST') {
        res = await handleKofiWebhook(req, env);

      // ── Invite code routes ──
      } else if (path === '/api/auth/redeem-invite' && method === 'POST') {
        res = await handleRedeemInviteCode(req, env);

      // ── User payment link routes ──
      } else if (path === '/api/user/payment-links' && method === 'GET') {
        res = await handleGetPaymentLinks(req, env);
      } else if (path === '/api/user/payment-links' && method === 'POST') {
        res = await handleAddPaymentLink(req, env);
      } else if (path === '/api/user/payment-links' && method === 'DELETE') {
        res = await handleRemovePaymentLink(req, env);

      // ── Admin routes (use /api/manage/ to avoid WAF blocking "admin" paths) ──
      } else if (path === '/api/manage/invite-codes' && method === 'POST') {
        res = await handleCreateInviteCode(req, env);
      } else if (path === '/api/manage/invite-codes' && method === 'GET') {
        res = await handleListInviteCodes(req, env);
      } else if (path === '/api/manage/unmatched-payments' && method === 'GET') {
        res = await handleListUnmatchedPayments(req, env);
      } else if (path === '/api/manage/unmatched-payments/resolve' && method === 'POST') {
        res = await handleResolveUnmatchedPayment(req, env);
      } else if (path === '/api/manage/subscriptions' && method === 'GET') {
        res = await handleListSubscriptions(req, env);
      } else if (path === '/api/manage/stats' && method === 'GET') {
        res = await handleAdminStats(req, env);
      } else if (path === '/api/manage/verifications' && method === 'GET') {
        res = await handleListVerifications(req, env);
      } else if (path === '/api/manage/verifications/resolve' && method === 'POST') {
        res = await handleResolveVerification(req, env);

      // ── User verification request ──
      } else if (path === '/api/user/request-verification' && method === 'POST') {
        res = await handleRequestVerification(req, env);

      // ── Community routes ──
      } else if (path === '/api/community/works' && method === 'GET') {
        res = await handleListWorks(req, env);
      } else if (path === '/api/community/works' && method === 'POST') {
        res = await handleCreateWork(req, env);
      } else if (path === '/api/community/my-works' && method === 'GET') {
        res = await handleMyWorks(req, env);
      } else if (path.startsWith('/api/community/works/') && path.endsWith('/like') && method === 'POST') {
        const workId = path.slice('/api/community/works/'.length, -'/like'.length);
        res = await handleToggleLike(req, env, workId);
      } else if (path.startsWith('/api/community/works/') && path.endsWith('/bookmark') && method === 'POST') {
        const workId = path.slice('/api/community/works/'.length, -'/bookmark'.length);
        res = await handleToggleBookmark(req, env, workId);
      } else if (path === '/api/community/my-bookmarks' && method === 'GET') {
        res = await handleMyBookmarks(req, env);
      } else if (path.startsWith('/api/community/works/') && method === 'GET') {
        const workId = path.slice('/api/community/works/'.length);
        res = await handleGetWork(req, env, workId);
      } else if (path.startsWith('/api/community/works/') && method === 'DELETE') {
        const workId = path.slice('/api/community/works/'.length);
        res = await handleDeleteWork(req, env, workId);
      } else if (path.startsWith('/api/community/works/') && path.endsWith('/stamp') && method === 'POST') {
        const workId = path.slice('/api/community/works/'.length, -'/stamp'.length);
        res = await handleToggleStamp(req, env, workId);

      // ── Reports ──
      } else if (path === '/api/report' && method === 'POST') {
        res = await handleSubmitReport(req, env);
      } else if (path === '/api/manage/reports' && method === 'GET') {
        res = await handleListReports(req, env);
      } else if (path.startsWith('/api/manage/reports/') && method === 'PATCH') {
        const reportId = path.slice('/api/manage/reports/'.length);
        res = await handleUpdateReport(req, env, reportId);

      // ── Repo community routes ──
      } else if (path === '/api/repo/works' && method === 'GET') {
        res = await handleListRepoWorks(req, env);
      } else if (path === '/api/repo/works' && method === 'POST') {
        res = await handleCreateRepoWork(req, env);
      } else if (path === '/api/repo/my-works' && method === 'GET') {
        res = await handleMyRepoWorks(req, env);
      } else if (path.startsWith('/api/repo/works/') && path.endsWith('/react') && method === 'POST') {
        const workId = path.slice('/api/repo/works/'.length, -'/react'.length);
        res = await handleRepoReact(req, env, workId);
      } else if (path.startsWith('/api/repo/works/') && method === 'GET') {
        const workId = path.slice('/api/repo/works/'.length);
        res = await handleGetRepoWork(req, env, workId);
      } else if (path.startsWith('/api/repo/works/') && method === 'DELETE') {
        const workId = path.slice('/api/repo/works/'.length);
        res = await handleDeleteRepoWork(req, env, workId);

      } else {
        res = error('Not found', 404);
      }
    } catch (e) {
      console.error('[Auth Worker] Error:', e);
      res = error('Internal server error', 500);
    }

    return withCors(res, env, origin);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('[Cron] Running scheduled maintenance...');

    // 1. Expire overdue subscriptions
    const expired = await env.DB.prepare(`
      UPDATE user_subscriptions SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')
    `).run();
    console.log(`[Cron] Expired ${expired.meta.changes} subscriptions`);

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
  },
};
