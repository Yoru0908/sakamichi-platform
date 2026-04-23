// geo-pass.ts — HMAC-signed geo_pass Cookie for JP geo-fence bypass
// Format: {userId}:{timestamp}:{uaHash}.{hmac_signature}

const GEO_PASS_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/**
 * Extract platform:browser_family from User-Agent (no version — survives browser updates)
 * e.g. "Mozilla/5.0 (Macintosh; ...) Chrome/122.0.0.0" → "mac:chrome"
 */
function extractUaFamily(ua: string): string {
  const platform = /Windows/.test(ua) ? 'win'
    : /Macintosh|Mac OS/.test(ua) ? 'mac'
    : /iPhone|iPad/.test(ua) ? 'ios'
    : /Android/.test(ua) ? 'android'
    : /Linux/.test(ua) ? 'linux' : 'unknown';
  const browser = /Edg\//.test(ua) ? 'edge'
    : /Firefox\//.test(ua) ? 'firefox'
    : /Chrome\//.test(ua) ? 'chrome'
    : /Safari\//.test(ua) ? 'safari' : 'other';
  return `${platform}:${browser}`;
}

/**
 * Compute UA hash (first 8 hex chars of SHA-256)
 */
async function computeUaHash(userAgent: string): Promise<string> {
  const family = extractUaFamily(userAgent);
  const hash = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(family)
  );
  return Array.from(new Uint8Array(hash).slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate geo_pass Cookie value
 */
export async function generateGeoPass(
  userId: string,
  secret: string,
  userAgent: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const uaHash = await computeUaHash(userAgent);
  const data = `${userId}:${timestamp}:${uaHash}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );

  const hmac = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${data}.${hmac}`;
}

/**
 * Verify geo_pass Cookie value (HMAC + expiry + UA device match)
 */
export async function verifyGeoPass(
  value: string,
  secret: string,
  userAgent: string
): Promise<{ valid: boolean; userId?: string; reason?: string }> {
  const dotIdx = value.lastIndexOf('.');
  if (dotIdx === -1) return { valid: false, reason: 'format' };

  const data = value.slice(0, dotIdx);
  const hmac = value.slice(dotIdx + 1);
  const parts = data.split(':');
  if (parts.length !== 3) return { valid: false, reason: 'format' };

  const [userId, timestamp, uaHash] = parts;
  const ts = parseInt(timestamp);

  // Expiry check
  if (Date.now() / 1000 - ts > GEO_PASS_MAX_AGE) {
    return { valid: false, reason: 'expired' };
  }

  // UA device match
  const currentUaHash = await computeUaHash(userAgent);
  if (uaHash !== currentUaHash) {
    return { valid: false, reason: 'device_mismatch' };
  }

  // HMAC signature verification
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const expectedSig = Uint8Array.from(
      atob(hmac.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      expectedSig,
      new TextEncoder().encode(data)
    );

    return valid ? { valid: true, userId } : { valid: false, reason: 'signature' };
  } catch {
    return { valid: false, reason: 'malformed_signature' };
  }
}

/**
 * Check if user qualifies for geo_pass issuance
 */
export function shouldIssueGeoPass(user: { geo_status: string | null; role: string }): boolean {
  return user.geo_status === 'approved'
    || user.role === 'translator'
    || user.role === 'admin';
}

/**
 * Build Set-Cookie header string for geo_pass
 */
export function geoPassCookieString(value: string, domain: string): string {
  return `geo_pass=${value}; HttpOnly; Secure; SameSite=Lax; Max-Age=${GEO_PASS_MAX_AGE}; Path=/; Domain=${domain}`;
}
