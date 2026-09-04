interface JwtPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
  tokenType?: 'emergency_refresh';
}

const encoder = new TextEncoder();

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function base64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function signToken(payload: JwtPayload, secret: string): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const sigData = encoder.encode(`${header}.${payloadB64}`);
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, sigData);
  return `${header}.${payloadB64}.${base64url(sig)}`;
}

/** Sign a JWT access token (15 min) */
export async function signAccessToken(
  userId: string,
  role: string,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    sub: userId,
    role,
    iat: now,
    exp: now + 15 * 60,
  }, secret);
}

/** Short-lived fallback used only while the account-wide D1 quota is exhausted. */
export async function signEmergencyRefreshToken(
  userId: string,
  role: string,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    sub: userId,
    role,
    iat: now,
    exp: now + 24 * 60 * 60,
    tokenType: 'emergency_refresh',
  }, secret);
}

async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const key = await getKey(secret);
  const sigData = encoder.encode(`${headerB64}.${payloadB64}`);
  const sig = base64urlDecode(sigB64);

  const valid = await crypto.subtle.verify('HMAC', key, sig, sigData);
  if (!valid) return null;

  try {
    const payload: JwtPayload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(payloadB64)),
    );
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Verify a JWT access token. Returns payload or null. */
export async function verifyAccessToken(token: string, secret: string): Promise<JwtPayload | null> {
  const payload = await verifyToken(token, secret);
  return payload && !payload.tokenType ? payload : null;
}

export async function verifyEmergencyRefreshToken(token: string, secret: string): Promise<JwtPayload | null> {
  const payload = await verifyToken(token, secret);
  return payload?.tokenType === 'emergency_refresh' ? payload : null;
}
