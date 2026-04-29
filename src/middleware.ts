import { defineMiddleware } from 'astro:middleware';

// Public paths that don't require geo_pass for JP visitors
const PUBLIC_PREFIXES = ['/_astro/', '/auth/', '/images/', '/favicon', '/prototypes/'];
const PUBLIC_EXACT = ['/', '/about', '/privacy', '/terms', '/contact', '/links'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname) || PUBLIC_EXACT.includes(pathname.replace(/\/$/, ''))) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

// ── geo_pass HMAC verification (same logic as Workers) ──

function extractUaFamily(ua: string): string {
  const p = /Windows/.test(ua) ? 'win' : /Macintosh|Mac OS/.test(ua) ? 'mac'
    : /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android'
    : /Linux/.test(ua) ? 'linux' : 'unknown';
  const b = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox'
    : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
  return `${p}:${b}`;
}

async function computeUaHash(ua: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(extractUaFamily(ua)));
  return Array.from(new Uint8Array(hash).slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyGeoPass(value: string, secret: string, userAgent: string): Promise<boolean> {
  const dotIdx = value.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const data = value.slice(0, dotIdx);
  const hmac = value.slice(dotIdx + 1);
  const parts = data.split(':');
  if (parts.length !== 3) return false;
  const [, timestamp, uaHash] = parts;

  // Expiry check (1 year)
  if (Date.now() / 1000 - parseInt(timestamp) > 365 * 24 * 60 * 60) return false;
  // UA device match
  const currentHash = await computeUaHash(userAgent);
  if (uaHash !== currentHash) return false;
  // HMAC signature verification
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sig = Uint8Array.from(
      atob(hmac.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)
    );
    return await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data));
  } catch {
    return false;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const country = context.request.headers.get('cf-ipcountry') || '';

  // Non-JP → pass through immediately
  if (country !== 'JP') return next();

  const pathname = new URL(context.request.url).pathname;

  // Public paths → allow
  if (isPublicPath(pathname)) return next();

  // Static assets (.css, .js, .png, .jpg, .svg, .woff2, etc.) → allow
  if (/\.\w{2,5}$/.test(pathname) && !pathname.endsWith('.html')) return next();

  // geo_pass 反伪造验证：有 cookie 才验证 HMAC，没 cookie 放行（WAF 负责主拦截）
  const cookieHeader = context.request.headers.get('Cookie');
  const geoPass = getCookie(cookieHeader, 'geo_pass');

  if (!geoPass) {
    // No cookie → pass through (WAF Block JP rule handles primary blocking when enabled)
    return next();
  }

  // Cookie exists → verify HMAC (anti-spoofing)
  const secret = (context.locals as any).runtime?.env?.GEO_PASS_SECRET
    || import.meta.env.GEO_PASS_SECRET
    || '';
  if (secret && await verifyGeoPass(geoPass, secret, context.request.headers.get('User-Agent') || '')) {
    return next();
  }

  // Invalid/spoofed cookie → redirect to login
  const redirectUrl = `${new URL(context.request.url).origin}/auth/login?reason=geo_restricted&redirect=${encodeURIComponent(context.request.url)}`;
  return context.redirect(redirectUrl, 302);
});
