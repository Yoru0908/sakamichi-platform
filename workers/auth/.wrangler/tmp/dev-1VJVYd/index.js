var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-yh8Obg/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-yh8Obg/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/utils/response.ts
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}
__name(json, "json");
function error(message, status = 400) {
  return json({ success: false, error: message, message }, status);
}
__name(error, "error");
function success(data = {}, status = 200) {
  return json({ success: true, ...data }, status);
}
__name(success, "success");
function setCookies(res, cookies) {
  const headers = new Headers(res.headers);
  for (const c of cookies) {
    let cookie = `${c.name}=${c.value}; HttpOnly; Secure; SameSite=None; Max-Age=${c.maxAge}; Path=${c.path || "/"}`;
    if (c.domain)
      cookie += `; Domain=${c.domain}`;
    headers.append("Set-Cookie", cookie);
  }
  return new Response(res.body, { status: res.status, headers });
}
__name(setCookies, "setCookies");
function clearCookies(res, names) {
  const headers = new Headers(res.headers);
  for (const name of names) {
    headers.append(
      "Set-Cookie",
      `${name}=; HttpOnly; Secure; SameSite=None; Max-Age=0; Path=/; Domain=.46log.com`
    );
  }
  return new Response(res.body, { status: res.status, headers });
}
__name(clearCookies, "clearCookies");
function isAllowedOrigin(origin, allowed) {
  if (allowed.includes(origin))
    return true;
  if (/^https:\/\/[a-z0-9-]+\.sakamichi-platform-test\.pages\.dev$/.test(origin))
    return true;
  return false;
}
__name(isAllowedOrigin, "isAllowedOrigin");
function withCors(res, env, requestOrigin) {
  const allowed = env.CORS_ORIGIN.split(",").map((s) => s.trim());
  const origin = requestOrigin && isAllowedOrigin(requestOrigin, allowed) ? requestOrigin : allowed[0];
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers });
}
__name(withCors, "withCors");

// src/utils/password.ts
var encoder = new TextEncoder();
var ITERATIONS = 1e5;
var KEY_LENGTH = 32;
var SALT_LENGTH = 16;
function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(toHex, "toHex");
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
__name(fromHex, "fromHex");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8
  );
  return `${toHex(salt)}:${toHex(derived)}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex)
    return false;
  const salt = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8
  );
  return toHex(derived) === hashHex;
}
__name(verifyPassword, "verifyPassword");

// src/utils/email.ts
async function sendVerificationEmail(env, to, token) {
  const siteUrl = env.CORS_ORIGIN.split(",")[0].trim();
  const verifyUrl = `${siteUrl}/auth/verify?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: "Sakamichi Tools - \u90AE\u7BB1\u9A8C\u8BC1",
        html: `
          <div style="max-width:480px;margin:0 auto;font-family:sans-serif;padding:24px;">
            <h2 style="color:#742581;">Sakamichi Tools</h2>
            <p>\u4F60\u597D\uFF01\u8BF7\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u9A8C\u8BC1\u4F60\u7684\u90AE\u7BB1\u5730\u5740\uFF1A</p>
            <a href="${verifyUrl}" style="display:inline-block;background:#742581;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;margin:16px 0;">
              \u9A8C\u8BC1\u90AE\u7BB1
            </a>
            <p style="font-size:12px;color:#888;margin-top:24px;">
              \u5982\u679C\u4F60\u6CA1\u6709\u6CE8\u518C Sakamichi Tools\uFF0C\u8BF7\u5FFD\u7565\u6B64\u90AE\u4EF6\u3002<br/>
              \u94FE\u63A5\u6709\u6548\u671F 24 \u5C0F\u65F6\u3002
            </p>
          </div>
        `
      })
    });
    return res.ok;
  } catch {
    console.error("[Email] Failed to send verification email");
    return false;
  }
}
__name(sendVerificationEmail, "sendVerificationEmail");

// src/routes/register.ts
async function handleRegister(req, env) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error("\u65E0\u6548\u7684\u8BF7\u6C42\u4F53", 400);
  }
  const { email, password, displayName } = body;
  if (!email || !password) {
    return error("\u90AE\u7BB1\u548C\u5BC6\u7801\u4E3A\u5FC5\u586B\u9879", 400);
  }
  if (password.length < 8) {
    return error("\u5BC6\u7801\u81F3\u5C11\u9700\u8981 8 \u4E2A\u5B57\u7B26", 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    return error("\u8BE5\u90AE\u7BB1\u5DF2\u6CE8\u518C", 409);
  }
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const name = displayName || email.split("@")[0];
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, email_verified, is_first_login, verification_status)
     VALUES (?, ?, ?, ?, 'member', 0, 1, 'none')`
  ).bind(userId, email, passwordHash, name).run();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
  await env.DB.prepare(
    "INSERT INTO email_tokens (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(token, userId, expiresAt).run();
  await sendVerificationEmail(env, email, token);
  return success({ message: `\u9A8C\u8BC1\u90AE\u4EF6\u5DF2\u53D1\u9001\u81F3 ${email}` }, 201);
}
__name(handleRegister, "handleRegister");

// src/types.ts
function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    isFirstLogin: row.is_first_login === 1,
    oshiMember: row.oshi_member,
    verificationStatus: row.verification_status,
    geoStatus: row.geo_status,
    paymentStatus: row.payment_status
  };
}
__name(toPublicUser, "toPublicUser");

// src/utils/jwt.ts
var encoder2 = new TextEncoder();
async function getKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder2.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(getKey, "getKey");
function base64url(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = "";
  for (const b of bytes)
    str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64url, "base64url");
function base64urlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    bytes[i] = bin.charCodeAt(i);
  return bytes;
}
__name(base64urlDecode, "base64urlDecode");
async function signAccessToken(userId, role, secret) {
  const header = base64url(encoder2.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1e3);
  const payload = {
    sub: userId,
    role,
    iat: now,
    exp: now + 15 * 60
    // 15 minutes
  };
  const payloadB64 = base64url(encoder2.encode(JSON.stringify(payload)));
  const sigData = encoder2.encode(`${header}.${payloadB64}`);
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, sigData);
  return `${header}.${payloadB64}.${base64url(sig)}`;
}
__name(signAccessToken, "signAccessToken");
async function verifyAccessToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3)
    return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const key = await getKey(secret);
  const sigData = encoder2.encode(`${headerB64}.${payloadB64}`);
  const sig = base64urlDecode(sigB64);
  const valid = await crypto.subtle.verify("HMAC", key, sig, sigData);
  if (!valid)
    return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(payloadB64))
    );
    if (payload.exp < Math.floor(Date.now() / 1e3))
      return null;
    return payload;
  } catch {
    return null;
  }
}
__name(verifyAccessToken, "verifyAccessToken");

// src/utils/geo-pass.ts
var GEO_PASS_MAX_AGE = 365 * 24 * 60 * 60;
function extractUaFamily(ua) {
  const platform = /Windows/.test(ua) ? "win" : /Macintosh|Mac OS/.test(ua) ? "mac" : /iPhone|iPad/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Linux/.test(ua) ? "linux" : "unknown";
  const browser = /Edg\//.test(ua) ? "edge" : /Firefox\//.test(ua) ? "firefox" : /Chrome\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "other";
  return `${platform}:${browser}`;
}
__name(extractUaFamily, "extractUaFamily");
async function computeUaHash(userAgent) {
  const family = extractUaFamily(userAgent);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(family)
  );
  return Array.from(new Uint8Array(hash).slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(computeUaHash, "computeUaHash");
async function generateGeoPass(userId, secret, userAgent) {
  const timestamp = Math.floor(Date.now() / 1e3).toString();
  const uaHash = await computeUaHash(userAgent);
  const data = `${userId}:${timestamp}:${uaHash}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  const hmac = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${data}.${hmac}`;
}
__name(generateGeoPass, "generateGeoPass");
function shouldIssueGeoPass(user) {
  return user.geo_status === "approved" || user.role === "translator" || user.role === "admin";
}
__name(shouldIssueGeoPass, "shouldIssueGeoPass");

// src/routes/login.ts
async function handleLogin(req, env) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error("\u65E0\u6548\u7684\u8BF7\u6C42\u4F53", 400);
  }
  const { email, password } = body;
  if (!email || !password) {
    return error("\u90AE\u7BB1\u548C\u5BC6\u7801\u4E3A\u5FC5\u586B\u9879", 400);
  }
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!user || !user.password_hash) {
    return error("\u90AE\u7BB1\u6216\u5BC6\u7801\u9519\u8BEF", 401);
  }
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return error("\u90AE\u7BB1\u6216\u5BC6\u7801\u9519\u8BEF", 401);
  }
  if (!user.email_verified) {
    return error("\u8BF7\u5148\u9A8C\u8BC1\u90AE\u7BB1", 403);
  }
  const accessToken = await signAccessToken(user.id, user.role, env.JWT_SECRET);
  const refreshToken = crypto.randomUUID();
  const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
  await env.DB.prepare(
    "INSERT INTO refresh_tokens (id, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(refreshToken, user.id, refreshExpires).run();
  await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();
  const res = success({ data: { user: toPublicUser(user) } });
  const cookies = [
    { name: "access_token", value: accessToken, maxAge: 15 * 60, domain: ".46log.com" },
    { name: "refresh_token", value: refreshToken, maxAge: 7 * 24 * 60 * 60, path: "/api/auth", domain: ".46log.com" }
  ];
  if (shouldIssueGeoPass(user)) {
    const ua = req.headers.get("User-Agent") || "";
    const geoPassValue = await generateGeoPass(user.id, env.GEO_PASS_SECRET, ua);
    cookies.push({ name: "geo_pass", value: geoPassValue, maxAge: 365 * 24 * 60 * 60, domain: ".46log.com" });
  }
  return setCookies(res, cookies);
}
__name(handleLogin, "handleLogin");

// src/routes/logout.ts
function getAccessToken(req) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}
__name(getAccessToken, "getAccessToken");
async function handleLogout(req, env) {
  const token = getAccessToken(req);
  if (token) {
    const payload = await verifyAccessToken(token, env.JWT_SECRET);
    if (payload) {
      await env.DB.prepare(
        "UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0"
      ).bind(payload.sub).run();
    }
  }
  const res = success({ message: "\u5DF2\u767B\u51FA" });
  return clearCookies(res, ["access_token", "refresh_token"]);
}
__name(handleLogout, "handleLogout");

// src/routes/me.ts
function getAccessToken2(req) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}
__name(getAccessToken2, "getAccessToken");
async function handleMe(req, env) {
  const token = getAccessToken2(req);
  if (!token) {
    return error("unauthorized", 401);
  }
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload) {
    return error("unauthorized", 401);
  }
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user) {
    return error("user_not_found", 404);
  }
  return success({ data: { user: toPublicUser(user) } });
}
__name(handleMe, "handleMe");

// src/routes/refresh.ts
function getRefreshToken(req) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(/refresh_token=([^;]+)/);
  return match ? match[1] : null;
}
__name(getRefreshToken, "getRefreshToken");
async function handleRefresh(req, env) {
  const token = getRefreshToken(req);
  if (!token) {
    return error("unauthorized", 401);
  }
  const row = await env.DB.prepare(
    "SELECT * FROM refresh_tokens WHERE id = ? AND revoked = 0"
  ).bind(token).first();
  if (!row || new Date(row.expires_at) < /* @__PURE__ */ new Date()) {
    return error("unauthorized", 401);
  }
  await env.DB.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE id = ?").bind(token).run();
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(row.user_id).first();
  if (!user) {
    return error("user_not_found", 404);
  }
  const newAccessToken = await signAccessToken(user.id, user.role, env.JWT_SECRET);
  const newRefreshToken = crypto.randomUUID();
  const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
  await env.DB.prepare(
    "INSERT INTO refresh_tokens (id, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(newRefreshToken, user.id, refreshExpires).run();
  const res = success({});
  const cookies = [
    { name: "access_token", value: newAccessToken, maxAge: 15 * 60, domain: ".46log.com" },
    { name: "refresh_token", value: newRefreshToken, maxAge: 7 * 24 * 60 * 60, path: "/api/auth", domain: ".46log.com" }
  ];
  if (shouldIssueGeoPass(user)) {
    const ua = req.headers.get("User-Agent") || "";
    const geoPassValue = await generateGeoPass(user.id, env.GEO_PASS_SECRET, ua);
    cookies.push({ name: "geo_pass", value: geoPassValue, maxAge: 365 * 24 * 60 * 60, domain: ".46log.com" });
  }
  return setCookies(res, cookies);
}
__name(handleRefresh, "handleRefresh");

// src/routes/verify.ts
async function handleVerify(req, env) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return error("\u7F3A\u5C11\u9A8C\u8BC1 token", 400);
  }
  const row = await env.DB.prepare(
    "SELECT * FROM email_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row) {
    return error("\u9A8C\u8BC1\u94FE\u63A5\u65E0\u6548", 400);
  }
  if (new Date(row.expires_at) < /* @__PURE__ */ new Date()) {
    await env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();
    return error("\u9A8C\u8BC1\u94FE\u63A5\u5DF2\u8FC7\u671F", 400);
  }
  await env.DB.prepare(
    "UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?"
  ).bind(row.user_id).run();
  await env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();
  return success({ message: "\u90AE\u7BB1\u9A8C\u8BC1\u6210\u529F" });
}
__name(handleVerify, "handleVerify");

// src/routes/oauth.ts
function getSiteUrl(env) {
  return env.CORS_ORIGIN.split(",")[0].trim();
}
__name(getSiteUrl, "getSiteUrl");
async function handleDiscordRedirect(req, env) {
  const origin = new URL(req.url).searchParams.get("origin") || getSiteUrl(env);
  const state = encodeURIComponent(origin);
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify email",
    state
  });
  return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`, 302);
}
__name(handleDiscordRedirect, "handleDiscordRedirect");
async function handleDiscordCallback(req, env) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const originFromState = decodeURIComponent(url.searchParams.get("state") || "");
  const redirectBase = validateOrigin(originFromState, env) || getSiteUrl(env);
  if (!code)
    return Response.redirect(`${redirectBase}/auth/login?error=missing_code`, 302);
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI
    })
  });
  if (!tokenRes.ok)
    return Response.redirect(`${redirectBase}/auth/login?error=token_failed`, 302);
  const tokenData = await tokenRes.json();
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  if (!userRes.ok)
    return Response.redirect(`${redirectBase}/auth/login?error=user_failed`, 302);
  const discordUser = await userRes.json();
  return await handleOAuthUser(req, env, {
    provider: "discord",
    providerId: discordUser.id,
    email: discordUser.email || `${discordUser.id}@discord.user`,
    name: discordUser.username,
    avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null
  }, redirectBase);
}
__name(handleDiscordCallback, "handleDiscordCallback");
async function handleGoogleRedirect(req, env) {
  const origin = new URL(req.url).searchParams.get("origin") || getSiteUrl(env);
  const state = encodeURIComponent(origin);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline"
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}
__name(handleGoogleRedirect, "handleGoogleRedirect");
async function handleGoogleCallback(req, env) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const originFromState = decodeURIComponent(url.searchParams.get("state") || "");
  const redirectBase = validateOrigin(originFromState, env) || getSiteUrl(env);
  if (!code)
    return Response.redirect(`${redirectBase}/auth/login?error=missing_code`, 302);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.GOOGLE_REDIRECT_URI
    })
  });
  if (!tokenRes.ok)
    return Response.redirect(`${redirectBase}/auth/login?error=token_failed`, 302);
  const tokenData = await tokenRes.json();
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  if (!userRes.ok)
    return Response.redirect(`${redirectBase}/auth/login?error=user_failed`, 302);
  const googleUser = await userRes.json();
  return await handleOAuthUser(req, env, {
    provider: "google",
    providerId: googleUser.id,
    email: googleUser.email,
    name: googleUser.name || googleUser.email.split("@")[0],
    avatar: googleUser.picture || null
  }, redirectBase);
}
__name(handleGoogleCallback, "handleGoogleCallback");
function validateOrigin(origin, env) {
  const allowed = env.CORS_ORIGIN.split(",").map((s) => s.trim());
  if (allowed.includes(origin))
    return origin;
  if (/^https:\/\/[a-z0-9-]+\.sakamichi-platform-test\.pages\.dev$/.test(origin))
    return origin;
  return null;
}
__name(validateOrigin, "validateOrigin");
async function handleOAuthUser(req, env, profile, redirectBase) {
  const existing = await env.DB.prepare(
    "SELECT user_id FROM user_oauth WHERE provider = ? AND provider_id = ?"
  ).bind(profile.provider, profile.providerId).first();
  let userId;
  if (existing) {
    userId = existing.user_id;
    await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(userId).run();
  } else {
    const emailUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(profile.email).first();
    if (emailUser) {
      userId = emailUser.id;
      await env.DB.prepare(
        `INSERT INTO user_oauth (id, user_id, provider, provider_id, provider_email, provider_name, provider_avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), userId, profile.provider, profile.providerId, profile.email, profile.name, profile.avatar).run();
    } else {
      userId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO users (id, email, display_name, avatar_url, role, email_verified, is_first_login, verification_status)
         VALUES (?, ?, ?, ?, 'member', 1, 1, 'none')`
      ).bind(userId, profile.email, profile.name, profile.avatar).run();
      await env.DB.prepare(
        `INSERT INTO user_oauth (id, user_id, provider, provider_id, provider_email, provider_name, provider_avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), userId, profile.provider, profile.providerId, profile.email, profile.name, profile.avatar).run();
    }
  }
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user) {
    return Response.redirect(`${redirectBase}/auth/login?error=user_error`, 302);
  }
  const accessToken = await signAccessToken(user.id, user.role, env.JWT_SECRET);
  const refreshToken = crypto.randomUUID();
  const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
  await env.DB.prepare(
    "INSERT INTO refresh_tokens (id, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(refreshToken, user.id, refreshExpires).run();
  const redirectUrl = user.is_first_login ? `${redirectBase}/auth/onboarding` : `${redirectBase}/`;
  const res = Response.redirect(redirectUrl, 302);
  const cookies = [
    { name: "access_token", value: accessToken, maxAge: 15 * 60, domain: ".46log.com" },
    { name: "refresh_token", value: refreshToken, maxAge: 7 * 24 * 60 * 60, path: "/api/auth", domain: ".46log.com" }
  ];
  if (shouldIssueGeoPass(user)) {
    const ua = req.headers.get("User-Agent") || "";
    const geoPassValue = await generateGeoPass(user.id, env.GEO_PASS_SECRET, ua);
    cookies.push({ name: "geo_pass", value: geoPassValue, maxAge: 365 * 24 * 60 * 60, domain: ".46log.com" });
  }
  return setCookies(res, cookies);
}
__name(handleOAuthUser, "handleOAuthUser");

// src/routes/preferences.ts
function getAccessToken3(req) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}
__name(getAccessToken3, "getAccessToken");
async function getAuthUserId(req, env) {
  const token = getAccessToken3(req);
  if (!token)
    return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  return payload?.sub || null;
}
__name(getAuthUserId, "getAuthUserId");
async function handleGetPreferences(req, env) {
  const userId = await getAuthUserId(req, env);
  if (!userId)
    return error("unauthorized", 401);
  const user = await env.DB.prepare(
    "SELECT oshi_member FROM users WHERE id = ?"
  ).bind(userId).first();
  const followed = await env.DB.prepare(
    "SELECT member_name, member_group FROM user_followed_members WHERE user_id = ?"
  ).bind(userId).all();
  return success({
    data: {
      oshiMember: user?.oshi_member || null,
      followedMembers: (followed.results || []).map((r) => r.member_name)
    }
  });
}
__name(handleGetPreferences, "handleGetPreferences");
async function handleUpdatePreferences(req, env) {
  const userId = await getAuthUserId(req, env);
  if (!userId)
    return error("unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("\u65E0\u6548\u7684\u8BF7\u6C42\u4F53", 400);
  }
  if (body.oshiMember !== void 0) {
    await env.DB.prepare(
      "UPDATE users SET oshi_member = ?, is_first_login = 0, updated_at = datetime('now') WHERE id = ?"
    ).bind(body.oshiMember, userId).run();
  }
  if (body.followedMembers !== void 0) {
    await env.DB.prepare("DELETE FROM user_followed_members WHERE user_id = ?").bind(userId).run();
    for (const name of body.followedMembers) {
      await env.DB.prepare(
        "INSERT INTO user_followed_members (user_id, member_name) VALUES (?, ?)"
      ).bind(userId, name).run();
    }
  }
  return success({ message: "\u504F\u597D\u5DF2\u66F4\u65B0" });
}
__name(handleUpdatePreferences, "handleUpdatePreferences");
async function handleGetFavorites(req, env) {
  const userId = await getAuthUserId(req, env);
  if (!userId)
    return error("unauthorized", 401);
  const rows = await env.DB.prepare(
    "SELECT member_name, member_group, added_at FROM user_favorites WHERE user_id = ? ORDER BY added_at"
  ).bind(userId).all();
  return success({
    data: {
      favorites: (rows.results || []).map((r) => ({
        name: r.member_name,
        group: r.member_group,
        addedAt: r.added_at
      }))
    }
  });
}
__name(handleGetFavorites, "handleGetFavorites");
async function handleUpdateFavorites(req, env) {
  const userId = await getAuthUserId(req, env);
  if (!userId)
    return error("unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("\u65E0\u6548\u7684\u8BF7\u6C42\u4F53", 400);
  }
  if (!body.favorites) {
    return error("\u7F3A\u5C11 favorites \u5B57\u6BB5", 400);
  }
  await env.DB.prepare("DELETE FROM user_favorites WHERE user_id = ?").bind(userId).run();
  for (const fav of body.favorites) {
    await env.DB.prepare(
      "INSERT INTO user_favorites (user_id, member_name, member_group) VALUES (?, ?, ?)"
    ).bind(userId, fav.name, fav.group || "").run();
  }
  return success({ message: "\u6536\u85CF\u5DF2\u540C\u6B65" });
}
__name(handleUpdateFavorites, "handleUpdateFavorites");
async function handleGetBookmarks(req, env) {
  const userId = await getAuthUserId(req, env);
  if (!userId)
    return error("unauthorized", 401);
  const rows = await env.DB.prepare(
    "SELECT episode_id, note, added_at FROM user_episode_bookmarks WHERE user_id = ? ORDER BY added_at DESC"
  ).bind(userId).all();
  return success({
    data: {
      bookmarks: (rows.results || []).map((r) => ({
        episodeId: r.episode_id,
        note: r.note,
        addedAt: r.added_at
      }))
    }
  });
}
__name(handleGetBookmarks, "handleGetBookmarks");
async function handleAddBookmark(req, env) {
  const userId = await getAuthUserId(req, env);
  if (!userId)
    return error("unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("\u65E0\u6548\u7684\u8BF7\u6C42\u4F53", 400);
  }
  if (!body.episodeId) {
    return error("\u7F3A\u5C11 episodeId", 400);
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_episode_bookmarks (user_id, episode_id, note) VALUES (?, ?, ?)"
  ).bind(userId, body.episodeId, body.note || null).run();
  return success({ message: "\u5DF2\u6536\u85CF" });
}
__name(handleAddBookmark, "handleAddBookmark");
async function handleRemoveBookmark(req, env) {
  const userId = await getAuthUserId(req, env);
  if (!userId)
    return error("unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("\u65E0\u6548\u7684\u8BF7\u6C42\u4F53", 400);
  }
  if (!body.episodeId) {
    return error("\u7F3A\u5C11 episodeId", 400);
  }
  await env.DB.prepare(
    "DELETE FROM user_episode_bookmarks WHERE user_id = ? AND episode_id = ?"
  ).bind(userId, body.episodeId).run();
  return success({ message: "\u5DF2\u53D6\u6D88\u6536\u85CF" });
}
__name(handleRemoveBookmark, "handleRemoveBookmark");

// src/routes/profile.ts
function getAccessToken4(req) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}
__name(getAccessToken4, "getAccessToken");
async function getAuthUserId2(req, env) {
  const token = getAccessToken4(req);
  if (!token)
    return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  return payload?.sub || null;
}
__name(getAuthUserId2, "getAuthUserId");
async function handleGetProfile(req, env) {
  const userId = await getAuthUserId2(req, env);
  if (!userId)
    return error("unauthorized", 401);
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user)
    return error("user_not_found", 404);
  const [oauthLinks, subscription, paymentLinks] = await Promise.all([
    env.DB.prepare(
      "SELECT provider, provider_email, provider_name, provider_avatar, created_at FROM user_oauth WHERE user_id = ?"
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT plan, status, payment_method, paid_at, expires_at FROM user_subscriptions
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
    ).bind(userId).first(),
    env.DB.prepare(
      "SELECT platform, platform_email, linked_at FROM user_payment_links WHERE user_id = ?"
    ).bind(userId).all()
  ]);
  return success({
    data: {
      user: toPublicUser(user),
      oauthLinks: (oauthLinks.results || []).map((l) => ({
        provider: l.provider,
        email: l.provider_email,
        name: l.provider_name,
        avatar: l.provider_avatar,
        linkedAt: l.created_at
      })),
      subscription: subscription || null,
      paymentLinks: (paymentLinks.results || []).map((l) => ({
        platform: l.platform,
        email: l.platform_email,
        linkedAt: l.linked_at
      })),
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at
    }
  });
}
__name(handleGetProfile, "handleGetProfile");
async function handleUpdateProfile(req, env) {
  const userId = await getAuthUserId2(req, env);
  if (!userId)
    return error("unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("invalid request body", 400);
  }
  if (body.displayName !== void 0) {
    const name = body.displayName.trim();
    if (name.length < 1 || name.length > 30) {
      return error("\u6635\u79F0\u957F\u5EA6\u9700\u5728 1-30 \u4E2A\u5B57\u7B26\u4E4B\u95F4", 400);
    }
    await env.DB.prepare(
      "UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(name, userId).run();
  }
  return success({ message: "\u4E2A\u4EBA\u8D44\u6599\u5DF2\u66F4\u65B0" });
}
__name(handleUpdateProfile, "handleUpdateProfile");

// src/routes/password.ts
function getAccessToken5(req) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}
__name(getAccessToken5, "getAccessToken");
async function getAuthUserId3(req, env) {
  const token = getAccessToken5(req);
  if (!token)
    return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  return payload?.sub || null;
}
__name(getAuthUserId3, "getAuthUserId");
async function handleChangePassword(req, env) {
  const userId = await getAuthUserId3(req, env);
  if (!userId)
    return error("unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("\u65E0\u6548\u7684\u8BF7\u6C42\u4F53", 400);
  }
  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return error("\u8BF7\u586B\u5199\u5F53\u524D\u5BC6\u7801\u548C\u65B0\u5BC6\u7801", 400);
  }
  if (newPassword.length < 8) {
    return error("\u65B0\u5BC6\u7801\u957F\u5EA6\u81F3\u5C11\u4E3A 8 \u4E2A\u5B57\u7B26", 400);
  }
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user)
    return error("\u7528\u6237\u4E0D\u5B58\u5728", 404);
  if (!user.password_hash) {
    return error("\u5F53\u524D\u8D26\u53F7\u901A\u8FC7\u7B2C\u4E09\u65B9\u767B\u5F55\uFF0C\u8BF7\u5148\u8BBE\u7F6E\u5BC6\u7801", 400);
  }
  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    return error("\u5F53\u524D\u5BC6\u7801\u9519\u8BEF", 401);
  }
  const newHash = await hashPassword(newPassword);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newHash, userId).run();
  return success({ message: "\u5BC6\u7801\u5DF2\u4FEE\u6539" });
}
__name(handleChangePassword, "handleChangePassword");

// src/routes/webhook-kofi.ts
function mapKofiPlan(tierName, amount) {
  if (tierName?.toLowerCase().includes("lifetime"))
    return "lifetime";
  if (tierName?.toLowerCase().includes("all"))
    return "all_groups";
  if (tierName?.toLowerCase().includes("nogizaka") || tierName?.includes("\u4E43\u6728\u5742"))
    return "single_nogizaka";
  if (tierName?.toLowerCase().includes("sakurazaka") || tierName?.includes("\u6AFB\u5742"))
    return "single_sakurazaka";
  if (tierName?.toLowerCase().includes("hinata") || tierName?.includes("\u65E5\u5411\u5742"))
    return "single_hinatazaka";
  return "all_groups";
}
__name(mapKofiPlan, "mapKofiPlan");
async function handleKofiWebhook(req, env) {
  let body;
  try {
    const formData = await req.formData();
    const dataStr2 = formData.get("data");
    if (!dataStr2)
      return new Response("Missing data", { status: 200 });
    body = JSON.parse(dataStr2);
  } catch {
    return new Response("Bad request", { status: 200 });
  }
  if (body.verification_token !== env.KOFI_VERIFICATION_TOKEN) {
    return new Response("OK", { status: 200 });
  }
  const existingSub = await env.DB.prepare(
    "SELECT id FROM user_subscriptions WHERE payment_ref = ? AND payment_method = ?"
  ).bind(body.kofi_transaction_id, "kofi").first();
  if (existingSub)
    return new Response("OK", { status: 200 });
  const dataStr = JSON.stringify(body);
  let platformUser = await env.DB.prepare(
    `SELECT u.* FROM users u
     JOIN user_payment_links upl ON u.id = upl.user_id
     WHERE upl.platform = 'kofi' AND upl.platform_email = ?`
  ).bind(body.email).first();
  if (!platformUser) {
    platformUser = await env.DB.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).bind(body.email).first();
  }
  if (!platformUser && body.message) {
    const emailMatch = body.message.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      platformUser = await env.DB.prepare(
        "SELECT * FROM users WHERE email = ?"
      ).bind(emailMatch[0].toLowerCase()).first();
    }
  }
  if (!platformUser) {
    await env.DB.prepare(
      `INSERT INTO unmatched_payments (id, platform, order_id, platform_user_id, amount, remark, raw_data, created_at)
       VALUES (hex(randomblob(16)), 'kofi', ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(body.kofi_transaction_id, body.email, body.amount, body.message || "", dataStr).run();
    console.log(`[Ko-fi] Unmatched payment: ${body.kofi_transaction_id} from ${body.email}`);
    return new Response("OK", { status: 200 });
  }
  const plan = mapKofiPlan(body.tier_name, body.amount);
  const durationMonths = plan === "lifetime" ? null : body.is_subscription_payment ? 1 : 12;
  let expiresAt = null;
  if (durationMonths) {
    const d = /* @__PURE__ */ new Date();
    d.setMonth(d.getMonth() + durationMonths);
    expiresAt = d.toISOString();
  }
  await env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan, status, payment_method, payment_ref, amount_cents, currency, paid_at, expires_at, created_at, updated_at)
     VALUES (hex(randomblob(16)), ?, ?, 'active', 'kofi', ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))`
  ).bind(
    platformUser.id,
    plan,
    body.kofi_transaction_id,
    Math.round(parseFloat(body.amount) * 100),
    body.currency,
    expiresAt
  ).run();
  await env.DB.prepare(
    `UPDATE users SET payment_status = 'active', geo_status = 'approved',
     role = CASE WHEN role IN ('translator', 'admin') THEN role ELSE 'verified' END,
     updated_at = datetime('now')
     WHERE id = ?`
  ).bind(platformUser.id).run();
  console.log(`[Ko-fi] Activated subscription for user ${platformUser.id}, plan=${plan}, tx=${body.kofi_transaction_id}`);
  return new Response("OK", { status: 200 });
}
__name(handleKofiWebhook, "handleKofiWebhook");

// src/routes/invite-codes.ts
function getCookie(req, name) {
  const h = req.headers.get("Cookie");
  if (!h)
    return null;
  const m = h.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}
__name(getCookie, "getCookie");
async function getAuthUser(req, env) {
  const token = getCookie(req, "access_token") || req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token)
    return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload)
    return null;
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
}
__name(getAuthUser, "getAuthUser");
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}
__name(generateCode, "generateCode");
async function handleCreateInviteCode(req, env) {
  const user = await getAuthUser(req, env);
  if (!user || user.role !== "admin")
    return error("Forbidden", 403);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid body", 400);
  }
  const plan = body.plan || "all_groups";
  const maxUses = body.maxUses || 1;
  const durationDays = body.durationDays ?? null;
  const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 864e5).toISOString() : null;
  const code = generateCode();
  await env.DB.prepare(
    `INSERT INTO invite_codes (code, created_by, plan, max_uses, used_count, duration_days, expires_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, datetime('now'))`
  ).bind(code, user.id, plan, maxUses, durationDays, expiresAt).run();
  return success({ data: { code, plan, maxUses, durationDays, expiresAt } });
}
__name(handleCreateInviteCode, "handleCreateInviteCode");
async function handleListInviteCodes(req, env) {
  const user = await getAuthUser(req, env);
  if (!user || user.role !== "admin")
    return error("Forbidden", 403);
  const codes = await env.DB.prepare(
    `SELECT ic.*, 
      (SELECT GROUP_CONCAT(icu.user_id) FROM invite_code_usage icu WHERE icu.code = ic.code) as used_by_users
     FROM invite_codes ic ORDER BY ic.created_at DESC LIMIT 100`
  ).all();
  return success({ data: { codes: codes.results } });
}
__name(handleListInviteCodes, "handleListInviteCodes");
async function handleRedeemInviteCode(req, env) {
  const user = await getAuthUser(req, env);
  if (!user)
    return error("Unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid body", 400);
  }
  if (!body.code)
    return error("Invite code required", 400);
  const code = body.code.toUpperCase().trim();
  const invite = await env.DB.prepare("SELECT * FROM invite_codes WHERE code = ?").bind(code).first();
  if (!invite)
    return error("Invalid invite code", 404);
  if (invite.expires_at && new Date(invite.expires_at) < /* @__PURE__ */ new Date()) {
    return error("Invite code expired", 410);
  }
  if (invite.used_count >= invite.max_uses) {
    return error("Invite code fully used", 410);
  }
  const alreadyUsed = await env.DB.prepare(
    "SELECT id FROM invite_code_usage WHERE code = ? AND user_id = ?"
  ).bind(code, user.id).first();
  if (alreadyUsed)
    return error("Already redeemed this code", 409);
  let expiresAt = null;
  if (invite.duration_days) {
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() + invite.duration_days);
    expiresAt = d.toISOString();
  }
  await env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan, status, payment_method, payment_ref, paid_at, expires_at, created_at, updated_at)
     VALUES (hex(randomblob(16)), ?, ?, 'active', 'invite_code', ?, datetime('now'), ?, datetime('now'), datetime('now'))`
  ).bind(user.id, invite.plan, code, expiresAt).run();
  await env.DB.prepare("UPDATE invite_codes SET used_count = used_count + 1 WHERE code = ?").bind(code).run();
  await env.DB.prepare(
    "INSERT INTO invite_code_usage (id, code, user_id, used_at) VALUES (hex(randomblob(16)), ?, ?, datetime('now'))"
  ).bind(code, user.id).run();
  await env.DB.prepare(
    `UPDATE users SET payment_status = 'active', geo_status = 'approved',
     role = CASE WHEN role IN ('translator', 'admin') THEN role ELSE 'verified' END,
     updated_at = datetime('now')
     WHERE id = ?`
  ).bind(user.id).run();
  return success({ data: { message: "Invite code redeemed", plan: invite.plan, expiresAt } });
}
__name(handleRedeemInviteCode, "handleRedeemInviteCode");

// src/routes/payment-links.ts
function getCookie2(req, name) {
  const h = req.headers.get("Cookie");
  if (!h)
    return null;
  const m = h.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}
__name(getCookie2, "getCookie");
async function getAuthUser2(req, env) {
  const token = getCookie2(req, "access_token") || req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token)
    return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload)
    return null;
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
}
__name(getAuthUser2, "getAuthUser");
async function handleGetPaymentLinks(req, env) {
  const user = await getAuthUser2(req, env);
  if (!user)
    return error("Unauthorized", 401);
  const links = await env.DB.prepare(
    "SELECT id, platform, platform_user_id, platform_email, linked_at FROM user_payment_links WHERE user_id = ?"
  ).bind(user.id).all();
  return success({ data: { links: links.results } });
}
__name(handleGetPaymentLinks, "handleGetPaymentLinks");
async function handleAddPaymentLink(req, env) {
  const user = await getAuthUser2(req, env);
  if (!user)
    return error("Unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid body", 400);
  }
  const { platform, platformUserId, platformEmail } = body;
  if (!platform || !platformUserId && !platformEmail) {
    return error("platform and at least one of platformUserId/platformEmail required", 400);
  }
  if (!["afdian", "kofi", "stripe"].includes(platform)) {
    return error("Invalid platform", 400);
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM user_payment_links WHERE user_id = ? AND platform = ?"
  ).bind(user.id, platform).first();
  if (existing) {
    await env.DB.prepare(
      "UPDATE user_payment_links SET platform_user_id = ?, platform_email = ?, linked_at = datetime('now') WHERE user_id = ? AND platform = ?"
    ).bind(platformUserId || null, platformEmail || null, user.id, platform).run();
    return success({ message: "Payment link updated" });
  }
  await env.DB.prepare(
    `INSERT INTO user_payment_links (id, user_id, platform, platform_user_id, platform_email, linked_at)
     VALUES (hex(randomblob(16)), ?, ?, ?, ?, datetime('now'))`
  ).bind(user.id, platform, platformUserId || null, platformEmail || null).run();
  return success({ message: "Payment link added" });
}
__name(handleAddPaymentLink, "handleAddPaymentLink");
async function handleRemovePaymentLink(req, env) {
  const user = await getAuthUser2(req, env);
  if (!user)
    return error("Unauthorized", 401);
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  if (!platform)
    return error("platform query param required", 400);
  await env.DB.prepare(
    "DELETE FROM user_payment_links WHERE user_id = ? AND platform = ?"
  ).bind(user.id, platform).run();
  return success({ message: "Payment link removed" });
}
__name(handleRemovePaymentLink, "handleRemovePaymentLink");

// src/routes/admin-payments.ts
function getCookie3(req, name) {
  const h = req.headers.get("Cookie");
  if (!h)
    return null;
  const m = h.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}
__name(getCookie3, "getCookie");
async function getAdminUser(req, env) {
  const token = getCookie3(req, "access_token") || req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token)
    return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload)
    return null;
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user || user.role !== "admin")
    return null;
  return user;
}
__name(getAdminUser, "getAdminUser");
async function handleListUnmatchedPayments(req, env) {
  const admin = await getAdminUser(req, env);
  if (!admin)
    return error("Forbidden", 403);
  const url = new URL(req.url);
  const pendingOnly = url.searchParams.get("pending") !== "false";
  const query = pendingOnly ? "SELECT * FROM unmatched_payments WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 100" : "SELECT * FROM unmatched_payments ORDER BY created_at DESC LIMIT 100";
  const payments = await env.DB.prepare(query).all();
  return success({ data: { payments: payments.results } });
}
__name(handleListUnmatchedPayments, "handleListUnmatchedPayments");
async function handleResolveUnmatchedPayment(req, env) {
  const admin = await getAdminUser(req, env);
  if (!admin)
    return error("Forbidden", 403);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid body", 400);
  }
  if (!body.paymentId || !body.userId) {
    return error("paymentId and userId required", 400);
  }
  const payment = await env.DB.prepare(
    "SELECT * FROM unmatched_payments WHERE id = ? AND resolved_at IS NULL"
  ).bind(body.paymentId).first();
  if (!payment)
    return error("Payment not found or already resolved", 404);
  const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(body.userId).first();
  if (!targetUser)
    return error("User not found", 404);
  const plan = body.plan || "all_groups";
  await env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan, status, payment_method, payment_ref, amount_cents, paid_at, approved_by, notes, created_at, updated_at)
     VALUES (hex(randomblob(16)), ?, ?, 'active', 'manual', ?, ?, datetime('now'), ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    body.userId,
    plan,
    payment.order_id,
    payment.amount ? Math.round(parseFloat(payment.amount) * 100) : null,
    admin.id,
    `Resolved from ${payment.platform} unmatched payment ${payment.id}`
  ).run();
  await env.DB.prepare(
    "UPDATE unmatched_payments SET resolved_at = datetime('now'), resolved_user_id = ? WHERE id = ?"
  ).bind(body.userId, body.paymentId).run();
  await env.DB.prepare(
    `UPDATE users SET payment_status = 'active', geo_status = 'approved',
     role = CASE WHEN role IN ('translator', 'admin') THEN role ELSE 'verified' END,
     updated_at = datetime('now')
     WHERE id = ?`
  ).bind(body.userId).run();
  return success({ data: { message: "Payment resolved and subscription created" } });
}
__name(handleResolveUnmatchedPayment, "handleResolveUnmatchedPayment");
async function handleListSubscriptions(req, env) {
  const admin = await getAdminUser(req, env);
  if (!admin)
    return error("Forbidden", 403);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "active";
  const subs = await env.DB.prepare(
    `SELECT us.*, u.email, u.display_name
     FROM user_subscriptions us
     JOIN users u ON us.user_id = u.id
     WHERE us.status = ?
     ORDER BY us.created_at DESC LIMIT 100`
  ).bind(status).all();
  return success({ data: { subscriptions: subs.results } });
}
__name(handleListSubscriptions, "handleListSubscriptions");
async function handleAdminStats(req, env) {
  const admin = await getAdminUser(req, env);
  if (!admin)
    return error("Forbidden", 403);
  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM users WHERE payment_status = 'active') as paid_users,
      (SELECT COUNT(*) FROM users WHERE verification_status = 'pending') as pending_users,
      (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active') as active_subs,
      (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'expired') as expired_subs,
      (SELECT COUNT(*) FROM unmatched_payments WHERE resolved_at IS NULL) as unmatched_pending,
      (SELECT COUNT(*) FROM invite_codes WHERE (expires_at IS NULL OR expires_at > datetime('now')) AND used_count < max_uses) as active_codes
  `).first();
  return success({ data: { stats } });
}
__name(handleAdminStats, "handleAdminStats");

// src/routes/admin-verification.ts
function getCookie4(req, name) {
  const h = req.headers.get("Cookie");
  if (!h)
    return null;
  const m = h.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}
__name(getCookie4, "getCookie");
async function getAdminUser2(req, env) {
  const token = getCookie4(req, "access_token") || req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token)
    return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload)
    return null;
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user || user.role !== "admin")
    return null;
  return user;
}
__name(getAdminUser2, "getAdminUser");
async function handleListVerifications(req, env) {
  const admin = await getAdminUser2(req, env);
  if (!admin)
    return error("Forbidden", 403);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  let query;
  if (status === "all") {
    query = `SELECT id, email, display_name, avatar_url, role, verification_status, geo_status, payment_status, created_at, updated_at
             FROM users WHERE verification_status != 'none'
             ORDER BY CASE verification_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 END, updated_at DESC
             LIMIT 200`;
  } else {
    query = `SELECT id, email, display_name, avatar_url, role, verification_status, geo_status, payment_status, created_at, updated_at
             FROM users WHERE verification_status = '${status}'
             ORDER BY updated_at DESC LIMIT 200`;
  }
  const users = await env.DB.prepare(query).all();
  return success({ data: { users: users.results } });
}
__name(handleListVerifications, "handleListVerifications");
async function handleResolveVerification(req, env) {
  const admin = await getAdminUser2(req, env);
  if (!admin)
    return error("Forbidden", 403);
  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid body", 400);
  }
  if (!body.userId || !body.action) {
    return error("userId and action (approve/reject) required", 400);
  }
  if (!["approve", "reject"].includes(body.action)) {
    return error("action must be approve or reject", 400);
  }
  const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(body.userId).first();
  if (!targetUser)
    return error("User not found", 404);
  if (body.action === "approve") {
    await env.DB.prepare(
      `UPDATE users SET verification_status = 'approved', geo_status = 'approved', updated_at = datetime('now')
       WHERE id = ?`
    ).bind(body.userId).run();
  } else {
    await env.DB.prepare(
      `UPDATE users SET verification_status = 'rejected', updated_at = datetime('now')
       WHERE id = ?`
    ).bind(body.userId).run();
  }
  console.log(`[Admin] Verification ${body.action}d for user ${body.userId} by admin ${admin.id}`);
  return success({ data: { message: `Verification ${body.action}d` } });
}
__name(handleResolveVerification, "handleResolveVerification");
async function handleRequestVerification(req, env) {
  const token = getCookie4(req, "access_token") || req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token)
    return error("Unauthorized", 401);
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload)
    return error("Unauthorized", 401);
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user)
    return error("Unauthorized", 401);
  if (user.verification_status === "approved") {
    return success({ data: { message: "Already verified", status: "approved" } });
  }
  if (user.verification_status === "pending") {
    return success({ data: { message: "Verification request already submitted", status: "pending" } });
  }
  await env.DB.prepare(
    `UPDATE users SET verification_status = 'pending', updated_at = datetime('now')
     WHERE id = ?`
  ).bind(user.id).run();
  return success({ data: { message: "Verification request submitted", status: "pending" } });
}
__name(handleRequestVerification, "handleRequestVerification");

// src/routes/community.ts
function getAccessToken6(req) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}
__name(getAccessToken6, "getAccessToken");
async function getAuthUser3(req, env) {
  const token = getAccessToken6(req);
  if (!token)
    return null;
  const payload = await verifyAccessToken(token, env.JWT_SECRET);
  if (!payload)
    return null;
  return { userId: payload.sub, role: payload.role };
}
__name(getAuthUser3, "getAuthUser");
function nanoid() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
__name(nanoid, "nanoid");
var _alistTokenCache = null;
async function getAlistToken(env) {
  const now = Date.now();
  if (_alistTokenCache && _alistTokenCache.expiresAt > now) {
    return _alistTokenCache.token;
  }
  const alistUrl = env.ALIST_URL || "https://gallery.46log.com";
  const resp = await fetch(`${alistUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: env.ALIST_USER,
      password: env.ALIST_PASS
    })
  });
  const data = await resp.json();
  if (data.code !== 200 || !data.data?.token) {
    throw new Error(`Alist login failed: ${JSON.stringify(data)}`);
  }
  _alistTokenCache = {
    token: data.data.token,
    expiresAt: now + 11 * 24 * 60 * 60 * 1e3
  };
  return data.data.token;
}
__name(getAlistToken, "getAlistToken");
async function uploadToAlist(env, filePath, fileData, contentType) {
  const alistUrl = env.ALIST_URL || "https://gallery.46log.com";
  const token = await getAlistToken(env);
  const resp = await fetch(`${alistUrl}/api/fs/put`, {
    method: "PUT",
    headers: {
      "Authorization": token,
      "File-Path": encodeURI(filePath),
      "Content-Type": contentType,
      "Content-Length": String(fileData.byteLength)
    },
    body: fileData
  });
  if (!resp.ok) {
    console.error(`[Alist] Upload failed: ${resp.status} ${await resp.text()}`);
    return false;
  }
  const data = await resp.json();
  return data.code === 200;
}
__name(uploadToAlist, "uploadToAlist");
async function deleteFromAlist(env, dirPath, names) {
  const alistUrl = env.ALIST_URL || "https://gallery.46log.com";
  const token = await getAlistToken(env);
  await fetch(`${alistUrl}/api/fs/remove`, {
    method: "POST",
    headers: {
      "Authorization": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ dir: dirPath, names })
  });
}
__name(deleteFromAlist, "deleteFromAlist");
async function handleListWorks(req, env) {
  const url = new URL(req.url);
  const group = url.searchParams.get("group") || "";
  const member = url.searchParams.get("member") || "";
  const sort = url.searchParams.get("sort") || "latest";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
  const offset = (page - 1) * limit;
  const auth = await getAuthUser3(req, env);
  let where = "w.status = 'published'";
  const params = [];
  if (group) {
    where += " AND w.group_style = ?";
    params.push(group);
  }
  if (member) {
    where += " AND w.member_name = ?";
    params.push(member);
  }
  const orderBy = sort === "popular" ? "w.like_count DESC, w.created_at DESC" : "w.created_at DESC";
  const countStmt = env.DB.prepare(
    `SELECT COUNT(*) as total FROM community_works w WHERE ${where}`
  );
  params.forEach((p, i) => countStmt.bind(p));
  const countParams = [...params];
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM community_works w WHERE ${where}`
  ).bind(...countParams).first();
  const total = countResult?.total || 0;
  const queryParams = [...params, limit, offset];
  const works = await env.DB.prepare(`
    SELECT w.id, w.image_key, w.thumbnail_key, w.member_name, w.romaji_name,
           w.group_style, w.theme, w.like_count, w.view_count, w.allow_download,
           w.user_id, w.created_at,
           u.display_name as author_name, u.avatar_url as author_avatar
    FROM community_works w
    LEFT JOIN users u ON w.user_id = u.id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...queryParams).all();
  const workIds = (works.results || []).map((w) => w.id);
  let likedSet = /* @__PURE__ */ new Set();
  if (auth && workIds.length > 0) {
    const placeholders = workIds.map(() => "?").join(",");
    const likes = await env.DB.prepare(
      `SELECT work_id FROM community_likes WHERE user_id = ? AND work_id IN (${placeholders})`
    ).bind(auth.userId, ...workIds).all();
    likedSet = new Set((likes.results || []).map((l) => l.work_id));
  }
  const galleryBase = "https://gallery.46log.com/d/community";
  return success({
    data: {
      works: (works.results || []).map((w) => ({
        id: w.id,
        imageUrl: `${galleryBase}/${w.thumbnail_key || w.image_key}`,
        fullImageUrl: `${galleryBase}/${w.image_key}`,
        memberName: w.member_name,
        romajiName: w.romaji_name,
        groupStyle: w.group_style,
        theme: w.theme,
        likeCount: w.like_count,
        liked: likedSet.has(w.id),
        allowDownload: w.allow_download === 1,
        author: w.user_id ? {
          id: w.user_id,
          displayName: w.author_name || "\u533F\u540D",
          avatarUrl: w.author_avatar
        } : { id: null, displayName: "\u533F\u540D", avatarUrl: null },
        createdAt: w.created_at
      })),
      total,
      page,
      hasMore: offset + limit < total
    }
  });
}
__name(handleListWorks, "handleListWorks");
async function handleGetWork(req, env, workId) {
  const auth = await getAuthUser3(req, env);
  const work = await env.DB.prepare(`
    SELECT w.*, u.display_name as author_name, u.avatar_url as author_avatar
    FROM community_works w
    LEFT JOIN users u ON w.user_id = u.id
    WHERE w.id = ? AND w.status = 'published'
  `).bind(workId).first();
  if (!work)
    return error("\u4F5C\u54C1\u4E0D\u5B58\u5728", 404);
  await env.DB.prepare(
    "UPDATE community_works SET view_count = view_count + 1 WHERE id = ?"
  ).bind(workId).run();
  let liked = false;
  if (auth) {
    const like = await env.DB.prepare(
      "SELECT 1 FROM community_likes WHERE user_id = ? AND work_id = ?"
    ).bind(auth.userId, workId).first();
    liked = !!like;
  }
  const galleryBase = "https://gallery.46log.com/d/community";
  return success({
    data: {
      id: work.id,
      imageUrl: `${galleryBase}/${work.thumbnail_key || work.image_key}`,
      fullImageUrl: `${galleryBase}/${work.image_key}`,
      memberName: work.member_name,
      romajiName: work.romaji_name,
      groupStyle: work.group_style,
      theme: work.theme,
      likeCount: work.like_count + 1,
      // already incremented
      viewCount: work.view_count + 1,
      liked,
      allowDownload: work.allow_download === 1,
      author: work.user_id ? {
        id: work.user_id,
        displayName: work.author_name || "\u533F\u540D",
        avatarUrl: work.author_avatar
      } : { id: null, displayName: "\u533F\u540D", avatarUrl: null },
      createdAt: work.created_at
    }
  });
}
__name(handleGetWork, "handleGetWork");
async function handleCreateWork(req, env) {
  const auth = await getAuthUser3(req, env);
  let formData;
  try {
    formData = await req.formData();
  } catch {
    return error("\u65E0\u6548\u7684\u8BF7\u6C42\u4F53\uFF0C\u9700\u8981 multipart/form-data", 400);
  }
  const image = formData.get("image");
  const thumbnail = formData.get("thumbnail");
  const memberName = formData.get("memberName");
  const romajiName = formData.get("romajiName");
  const groupStyle = formData.get("groupStyle");
  const theme = formData.get("theme");
  const allowDownload = formData.get("allowDownload") !== "0" ? 1 : 0;
  const isAnonymous = formData.get("anonymous") === "1";
  const authorId = isAnonymous ? null : auth?.userId ?? null;
  if (!image)
    return error("\u7F3A\u5C11\u56FE\u7247\u6587\u4EF6", 400);
  if (!memberName)
    return error("\u7F3A\u5C11\u6210\u5458\u540D", 400);
  if (!groupStyle)
    return error("\u7F3A\u5C11\u56E2\u4F53\u4FE1\u606F", 400);
  if (image.size > 10 * 1024 * 1024)
    return error("\u56FE\u7247\u6587\u4EF6\u8FC7\u5927 (\u6700\u592710MB)", 400);
  const id = nanoid();
  const safeName = memberName.replace(/[^a-zA-Z0-9\u3000-\u9fff\u4e00-\u9fff\u3040-\u30ff]/g, "_");
  const imageKey = `works/${id}/${safeName}.png`;
  const thumbKey = thumbnail ? `works/${id}/${safeName}_thumb.webp` : null;
  const imageData = await image.arrayBuffer();
  const uploadOk = await uploadToAlist(env, `/community/${imageKey}`, imageData, "image/png");
  if (!uploadOk)
    return error("\u56FE\u7247\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", 500);
  if (thumbnail) {
    const thumbData = await thumbnail.arrayBuffer();
    const thumbOk = await uploadToAlist(env, `/community/${thumbKey}`, thumbData, "image/webp");
    if (!thumbOk) {
      console.error(`[Community] Thumbnail upload failed for ${id}, continuing without thumbnail`);
    }
  }
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
    allowDownload
  ).run();
  const galleryBase = "https://gallery.46log.com/d/community";
  return success({
    data: {
      id,
      imageUrl: `${galleryBase}/${thumbKey || imageKey}`,
      fullImageUrl: `${galleryBase}/${imageKey}`
    }
  }, 201);
}
__name(handleCreateWork, "handleCreateWork");
async function handleDeleteWork(req, env, workId) {
  const auth = await getAuthUser3(req, env);
  if (!auth)
    return error("\u9700\u8981\u767B\u5F55", 401);
  const work = await env.DB.prepare(
    "SELECT id, user_id, image_key FROM community_works WHERE id = ?"
  ).bind(workId).first();
  if (!work)
    return error("\u4F5C\u54C1\u4E0D\u5B58\u5728", 404);
  if (work.user_id !== auth.userId && auth.role !== "admin") {
    return error("\u65E0\u6743\u5220\u9664\u6B64\u4F5C\u54C1", 403);
  }
  await env.DB.prepare(
    "UPDATE community_works SET status = 'deleted', updated_at = datetime('now') WHERE id = ?"
  ).bind(workId).run();
  deleteFromAlist(env, "/community/works", [workId]).catch(console.error);
  return success({ message: "\u4F5C\u54C1\u5DF2\u5220\u9664" });
}
__name(handleDeleteWork, "handleDeleteWork");
async function handleToggleLike(req, env, workId) {
  const auth = await getAuthUser3(req, env);
  if (!auth)
    return error("\u9700\u8981\u767B\u5F55\u624D\u80FD\u70B9\u8D5E", 401);
  const work = await env.DB.prepare(
    "SELECT id, like_count FROM community_works WHERE id = ? AND status = 'published'"
  ).bind(workId).first();
  if (!work)
    return error("\u4F5C\u54C1\u4E0D\u5B58\u5728", 404);
  const existing = await env.DB.prepare(
    "SELECT 1 FROM community_likes WHERE user_id = ? AND work_id = ?"
  ).bind(auth.userId, workId).first();
  let liked;
  let newCount;
  if (existing) {
    await env.DB.prepare(
      "DELETE FROM community_likes WHERE user_id = ? AND work_id = ?"
    ).bind(auth.userId, workId).run();
    await env.DB.prepare(
      "UPDATE community_works SET like_count = MAX(0, like_count - 1), updated_at = datetime('now') WHERE id = ?"
    ).bind(workId).run();
    liked = false;
    newCount = Math.max(0, work.like_count - 1);
  } else {
    await env.DB.prepare(
      "INSERT INTO community_likes (user_id, work_id) VALUES (?, ?)"
    ).bind(auth.userId, workId).run();
    await env.DB.prepare(
      "UPDATE community_works SET like_count = like_count + 1, updated_at = datetime('now') WHERE id = ?"
    ).bind(workId).run();
    liked = true;
    newCount = work.like_count + 1;
  }
  return success({ data: { liked, likeCount: newCount } });
}
__name(handleToggleLike, "handleToggleLike");
async function handleMyWorks(req, env) {
  const auth = await getAuthUser3(req, env);
  if (!auth)
    return error("\u9700\u8981\u767B\u5F55", 401);
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
  const offset = (page - 1) * limit;
  const countResult = await env.DB.prepare(
    "SELECT COUNT(*) as total FROM community_works WHERE user_id = ? AND status != 'deleted'"
  ).bind(auth.userId).first();
  const total = countResult?.total || 0;
  const works = await env.DB.prepare(`
    SELECT id, image_key, thumbnail_key, member_name, romaji_name,
           group_style, theme, like_count, view_count, allow_download, status, created_at
    FROM community_works
    WHERE user_id = ? AND status != 'deleted'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(auth.userId, limit, offset).all();
  const galleryBase = "https://gallery.46log.com/d/community";
  const userRow = await env.DB.prepare(
    "SELECT id, display_name, avatar_url FROM users WHERE id = ?"
  ).bind(auth.userId).first();
  const author = {
    id: auth.userId,
    displayName: userRow?.display_name || auth.userId,
    avatarUrl: userRow?.avatar_url || null
  };
  return success({
    data: {
      works: (works.results || []).map((w) => ({
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
        author
      })),
      total,
      page,
      hasMore: offset + limit < total
    }
  });
}
__name(handleMyWorks, "handleMyWorks");

// src/index.ts
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    const origin = req.headers.get("Origin");
    if (method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), env, origin);
    }
    let res;
    try {
      if (path === "/api/auth/register" && method === "POST") {
        res = await handleRegister(req, env);
      } else if (path === "/api/auth/login" && method === "POST") {
        res = await handleLogin(req, env);
      } else if (path === "/api/auth/logout" && method === "POST") {
        res = await handleLogout(req, env);
      } else if (path === "/api/auth/me" && method === "GET") {
        res = await handleMe(req, env);
      } else if (path === "/api/auth/refresh" && method === "POST") {
        res = await handleRefresh(req, env);
      } else if (path === "/api/auth/verify" && method === "GET") {
        res = await handleVerify(req, env);
      } else if (path === "/api/auth/geo-check" && method === "GET") {
        const country = req.cf?.country || "";
        res = new Response(JSON.stringify({ country }), {
          headers: { "Content-Type": "application/json" }
        });
      } else if (path === "/api/auth/discord" && method === "GET") {
        res = await handleDiscordRedirect(req, env);
      } else if (path === "/api/auth/callback/discord" && method === "GET") {
        res = await handleDiscordCallback(req, env);
      } else if (path === "/api/auth/google" && method === "GET") {
        res = await handleGoogleRedirect(req, env);
      } else if (path === "/api/auth/callback/google" && method === "GET") {
        res = await handleGoogleCallback(req, env);
      } else if (path === "/api/user/profile" && method === "GET") {
        res = await handleGetProfile(req, env);
      } else if (path === "/api/user/profile" && method === "PUT") {
        res = await handleUpdateProfile(req, env);
      } else if (path === "/api/user/preferences" && method === "GET") {
        res = await handleGetPreferences(req, env);
      } else if (path === "/api/user/preferences" && method === "PUT") {
        res = await handleUpdatePreferences(req, env);
      } else if (path === "/api/user/favorites" && method === "GET") {
        res = await handleGetFavorites(req, env);
      } else if (path === "/api/user/favorites" && method === "PUT") {
        res = await handleUpdateFavorites(req, env);
      } else if (path === "/api/user/password" && method === "PUT") {
        res = await handleChangePassword(req, env);
      } else if (path === "/api/user/bookmarks" && method === "GET") {
        res = await handleGetBookmarks(req, env);
      } else if (path === "/api/user/bookmarks" && method === "POST") {
        res = await handleAddBookmark(req, env);
      } else if (path === "/api/user/bookmarks" && method === "DELETE") {
        res = await handleRemoveBookmark(req, env);
      } else if (path === "/api/webhook/kofi" && method === "POST") {
        res = await handleKofiWebhook(req, env);
      } else if (path === "/api/auth/redeem-invite" && method === "POST") {
        res = await handleRedeemInviteCode(req, env);
      } else if (path === "/api/user/payment-links" && method === "GET") {
        res = await handleGetPaymentLinks(req, env);
      } else if (path === "/api/user/payment-links" && method === "POST") {
        res = await handleAddPaymentLink(req, env);
      } else if (path === "/api/user/payment-links" && method === "DELETE") {
        res = await handleRemovePaymentLink(req, env);
      } else if (path === "/api/manage/invite-codes" && method === "POST") {
        res = await handleCreateInviteCode(req, env);
      } else if (path === "/api/manage/invite-codes" && method === "GET") {
        res = await handleListInviteCodes(req, env);
      } else if (path === "/api/manage/unmatched-payments" && method === "GET") {
        res = await handleListUnmatchedPayments(req, env);
      } else if (path === "/api/manage/unmatched-payments/resolve" && method === "POST") {
        res = await handleResolveUnmatchedPayment(req, env);
      } else if (path === "/api/manage/subscriptions" && method === "GET") {
        res = await handleListSubscriptions(req, env);
      } else if (path === "/api/manage/stats" && method === "GET") {
        res = await handleAdminStats(req, env);
      } else if (path === "/api/manage/verifications" && method === "GET") {
        res = await handleListVerifications(req, env);
      } else if (path === "/api/manage/verifications/resolve" && method === "POST") {
        res = await handleResolveVerification(req, env);
      } else if (path === "/api/user/request-verification" && method === "POST") {
        res = await handleRequestVerification(req, env);
      } else if (path === "/api/community/works" && method === "GET") {
        res = await handleListWorks(req, env);
      } else if (path === "/api/community/works" && method === "POST") {
        res = await handleCreateWork(req, env);
      } else if (path === "/api/community/my-works" && method === "GET") {
        res = await handleMyWorks(req, env);
      } else if (path.startsWith("/api/community/works/") && path.endsWith("/like") && method === "POST") {
        const workId = path.slice("/api/community/works/".length, -"/like".length);
        res = await handleToggleLike(req, env, workId);
      } else if (path.startsWith("/api/community/works/") && method === "GET") {
        const workId = path.slice("/api/community/works/".length);
        res = await handleGetWork(req, env, workId);
      } else if (path.startsWith("/api/community/works/") && method === "DELETE") {
        const workId = path.slice("/api/community/works/".length);
        res = await handleDeleteWork(req, env, workId);
      } else {
        res = error("Not found", 404);
      }
    } catch (e) {
      console.error("[Auth Worker] Error:", e);
      res = error("Internal server error", 500);
    }
    return withCors(res, env, origin);
  },
  async scheduled(event, env, ctx) {
    console.log("[Cron] Running scheduled maintenance...");
    const expired = await env.DB.prepare(`
      UPDATE user_subscriptions SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')
    `).run();
    console.log(`[Cron] Expired ${expired.meta.changes} subscriptions`);
    const downgraded = await env.DB.prepare(`
      UPDATE users SET payment_status = 'expired', updated_at = datetime('now')
      WHERE payment_status = 'active'
        AND id NOT IN (SELECT user_id FROM user_subscriptions WHERE status = 'active')
        AND role NOT IN ('admin', 'translator')
    `).run();
    console.log(`[Cron] Downgraded ${downgraded.meta.changes} users`);
    const cleanResolved = await env.DB.prepare(`
      DELETE FROM unmatched_payments
      WHERE resolved_at IS NOT NULL AND created_at < datetime('now', '-30 days')
    `).run();
    console.log(`[Cron] Cleaned ${cleanResolved.meta.changes} resolved unmatched payments`);
    const cleanOrphaned = await env.DB.prepare(`
      DELETE FROM unmatched_payments
      WHERE resolved_at IS NULL AND created_at < datetime('now', '-90 days')
    `).run();
    console.log(`[Cron] Cleaned ${cleanOrphaned.meta.changes} orphaned unmatched payments`);
    const cleanCodes = await env.DB.prepare(`
      DELETE FROM invite_codes
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now', '-30 days')
    `).run();
    console.log(`[Cron] Cleaned ${cleanCodes.meta.changes} expired invite codes`);
    const cleanSubs = await env.DB.prepare(`
      DELETE FROM user_subscriptions
      WHERE status IN ('expired', 'cancelled') AND updated_at < datetime('now', '-180 days')
    `).run();
    console.log(`[Cron] Cleaned ${cleanSubs.meta.changes} old subscriptions`);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error2 = reduceError(e);
    return Response.json(error2, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-yh8Obg/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-yh8Obg/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
