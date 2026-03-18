import type { Env, UserRow } from '../types';
import { toPublicUser } from '../types';
import { signAccessToken } from '../utils/jwt';
import { setCookies } from '../utils/response';

/** Get primary site URL from comma-separated CORS_ORIGIN */
function getSiteUrl(env: Env): string {
  return env.CORS_ORIGIN.split(',')[0].trim();
}

// ── Discord OAuth ──

export async function handleDiscordRedirect(req: Request, env: Env): Promise<Response> {
  const origin = new URL(req.url).searchParams.get('origin') || getSiteUrl(env);
  const state = encodeURIComponent(origin);
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
    state,
  });
  return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`, 302);
}

export async function handleDiscordCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const originFromState = decodeURIComponent(url.searchParams.get('state') || '');
  const redirectBase = validateOrigin(originFromState, env) || getSiteUrl(env);
  if (!code) return Response.redirect(`${redirectBase}/auth/login?error=missing_code`, 302);

  // Exchange code for token
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) return Response.redirect(`${redirectBase}/auth/login?error=token_failed`, 302);

  const tokenData = await tokenRes.json() as { access_token: string };

  // Get user info
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) return Response.redirect(`${redirectBase}/auth/login?error=user_failed`, 302);

  const discordUser = await userRes.json() as {
    id: string; username: string; email?: string; avatar?: string;
  };

  return await handleOAuthUser(env, {
    provider: 'discord',
    providerId: discordUser.id,
    email: discordUser.email || `${discordUser.id}@discord.user`,
    name: discordUser.username,
    avatar: discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null,
  }, redirectBase);
}

// ── Google OAuth ──

export async function handleGoogleRedirect(req: Request, env: Env): Promise<Response> {
  const origin = new URL(req.url).searchParams.get('origin') || getSiteUrl(env);
  const state = encodeURIComponent(origin);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}

export async function handleGoogleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const originFromState = decodeURIComponent(url.searchParams.get('state') || '');
  const redirectBase = validateOrigin(originFromState, env) || getSiteUrl(env);
  if (!code) return Response.redirect(`${redirectBase}/auth/login?error=missing_code`, 302);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) return Response.redirect(`${redirectBase}/auth/login?error=token_failed`, 302);

  const tokenData = await tokenRes.json() as { access_token: string };

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) return Response.redirect(`${redirectBase}/auth/login?error=user_failed`, 302);

  const googleUser = await userRes.json() as {
    id: string; email: string; name?: string; picture?: string;
  };

  return await handleOAuthUser(env, {
    provider: 'google',
    providerId: googleUser.id,
    email: googleUser.email,
    name: googleUser.name || googleUser.email.split('@')[0],
    avatar: googleUser.picture || null,
  }, redirectBase);
}

// ── Shared OAuth logic ──

interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  name: string;
  avatar: string | null;
}

/** Validate origin against allowed CORS origins */
function validateOrigin(origin: string, env: Env): string | null {
  const allowed = env.CORS_ORIGIN.split(',').map((s: string) => s.trim());
  return allowed.includes(origin) ? origin : null;
}

async function handleOAuthUser(env: Env, profile: OAuthProfile, redirectBase: string): Promise<Response> {
  // Check if OAuth link exists
  const existing = await env.DB.prepare(
    'SELECT user_id FROM user_oauth WHERE provider = ? AND provider_id = ?',
  )
    .bind(profile.provider, profile.providerId)
    .first<{ user_id: string }>();

  let userId: string;

  if (existing) {
    userId = existing.user_id;
    // Update last login
    await env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
      .bind(userId)
      .run();
  } else {
    // Check if email already used by another account
    const emailUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(profile.email)
      .first<{ id: string }>();

    if (emailUser) {
      // Link OAuth to existing account
      userId = emailUser.id;
      await env.DB.prepare(
        `INSERT INTO user_oauth (id, user_id, provider, provider_id, provider_email, provider_name, provider_avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), userId, profile.provider, profile.providerId, profile.email, profile.name, profile.avatar)
        .run();
    } else {
      // Create new user + OAuth link
      userId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO users (id, email, display_name, avatar_url, role, email_verified, is_first_login, verification_status)
         VALUES (?, ?, ?, ?, 'member', 1, 1, 'none')`,
      )
        .bind(userId, profile.email, profile.name, profile.avatar)
        .run();

      await env.DB.prepare(
        `INSERT INTO user_oauth (id, user_id, provider, provider_id, provider_email, provider_name, provider_avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), userId, profile.provider, profile.providerId, profile.email, profile.name, profile.avatar)
        .run();
    }
  }

  // Get full user for role
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRow>();

  if (!user) {
    return Response.redirect(`${redirectBase}/auth/login?error=user_error`, 302);
  }

  // Sign tokens
  const accessToken = await signAccessToken(user.id, user.role, env.JWT_SECRET);
  const refreshToken = crypto.randomUUID();
  const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    'INSERT INTO refresh_tokens (id, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(refreshToken, user.id, refreshExpires)
    .run();

  // Redirect to callback page with cookies
  const redirectUrl = user.is_first_login
    ? `${redirectBase}/auth/onboarding`
    : `${redirectBase}/auth/callback`;

  const res = Response.redirect(redirectUrl, 302);
  return setCookies(res, [
    { name: 'access_token', value: accessToken, maxAge: 15 * 60 },
    { name: 'refresh_token', value: refreshToken, maxAge: 7 * 24 * 60 * 60, path: '/api/auth' },
  ]);
}
