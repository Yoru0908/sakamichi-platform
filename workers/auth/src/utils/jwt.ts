import type { Env } from '../types';

interface JwtPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
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

/** Sign a JWT access token (15 min) */
export async function signAccessToken(
  userId: string,
  role: string,
  secret: string,
): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    role,
    iat: now,
    exp: now + 15 * 60, // 15 minutes
  };
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const sigData = encoder.encode(`${header}.${payloadB64}`);

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, sigData);

  return `${header}.${payloadB64}.${base64url(sig)}`;
}

/** Verify a JWT access token. Returns payload or null. */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
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
