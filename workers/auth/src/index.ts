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

      // ── Episode bookmark routes ──
      } else if (path === '/api/user/bookmarks' && method === 'GET') {
        res = await handleGetBookmarks(req, env);
      } else if (path === '/api/user/bookmarks' && method === 'POST') {
        res = await handleAddBookmark(req, env);
      } else if (path === '/api/user/bookmarks' && method === 'DELETE') {
        res = await handleRemoveBookmark(req, env);

      } else {
        res = error('Not found', 404);
      }
    } catch (e) {
      console.error('[Auth Worker] Error:', e);
      res = error('Internal server error', 500);
    }

    return withCors(res, env, origin);
  },
};
