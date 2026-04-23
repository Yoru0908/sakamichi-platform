// geo-auth-worker — JP geo-fence guard for Tunnel domains
// Route: alist.46log.com, radio.46log.com, etc. (excluding api.46log.com and CF Pages)
// Validates geo_pass HMAC cookie for JP visitors

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const country = request.cf?.country || '';

    // Non-JP → pass through
    if (country !== 'JP') {
      return fetch(request);
    }

    // AList download paths → always allow (群友直链)
    if (pathname.startsWith('/d/') || pathname.startsWith('/p/')) {
      return fetch(request);
    }

    // Public paths → allow
    if (isPublicPath(pathname)) {
      return fetch(request);
    }

    // geo_pass 反伪造验证：有 cookie 才验证 HMAC，没 cookie 放行（WAF 负责主拦截）
    const geoPass = getCookie(request, 'geo_pass');
    if (geoPass) {
      const userAgent = request.headers.get('User-Agent') || '';
      const result = await verifyGeoPass(geoPass, env.GEO_PASS_SECRET, userAgent);
      if (result.valid) {
        return fetch(request);
      }
      // Invalid/spoofed cookie → block
      const accept = request.headers.get('Accept') || '';
      if (accept.includes('application/json') || request.headers.get('X-Requested-With')) {
        return Response.json(
          { error: 'geo_restricted', reason: 'invalid_geo_pass', loginUrl: 'https://46log.com/auth/login?reason=geo_restricted' },
          { status: 401 }
        );
      }
      const loginUrl = `https://46log.com/auth/login?reason=geo_restricted&redirect=${encodeURIComponent(url.href)}`;
      return Response.redirect(loginUrl, 302);
    }

    // No cookie → pass through (WAF Block JP rule handles primary blocking when enabled)
    return fetch(request);
  }
};

function isPublicPath(pathname) {
  const PUBLIC = ['/', '/favicon.ico'];
  if (PUBLIC.includes(pathname)) return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/_astro/')) return true;
  if (pathname.startsWith('/images/')) return true;
  return false;
}

function getCookie(request, name) {
  const str = request.headers.get('Cookie') || '';
  const match = str.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

// ── geo_pass HMAC verification (JS port of geo-pass.ts) ──

function extractUaFamily(ua) {
  const p = /Windows/.test(ua) ? 'win' : /Macintosh|Mac OS/.test(ua) ? 'mac'
    : /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android'
    : /Linux/.test(ua) ? 'linux' : 'unknown';
  const b = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox'
    : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
  return `${p}:${b}`;
}

async function computeUaHash(ua) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(extractUaFamily(ua)));
  return Array.from(new Uint8Array(hash).slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyGeoPass(value, secret, userAgent) {
  const dotIdx = value.lastIndexOf('.');
  if (dotIdx === -1) return { valid: false };
  const data = value.slice(0, dotIdx);
  const hmac = value.slice(dotIdx + 1);
  const parts = data.split(':');
  if (parts.length !== 3) return { valid: false };
  const [userId, timestamp, uaHash] = parts;

  // Expiry check (1 year)
  if (Date.now() / 1000 - parseInt(timestamp) > 365 * 24 * 60 * 60) {
    return { valid: false };
  }
  // UA device match
  const currentHash = await computeUaHash(userAgent);
  if (uaHash !== currentHash) return { valid: false };
  // HMAC verification
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sig = Uint8Array.from(
      atob(hmac.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key, sig, new TextEncoder().encode(data)
    );
    return valid ? { valid: true, userId } : { valid: false };
  } catch {
    return { valid: false };
  }
}
