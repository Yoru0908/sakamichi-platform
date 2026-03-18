import type { Env } from '../types';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function error(message: string, status = 400): Response {
  return json({ success: false, error: message, message }, status);
}

export function success(data: unknown = {}, status = 200): Response {
  return json({ success: true, ...data }, status);
}

export function setCookies(
  res: Response,
  cookies: { name: string; value: string; maxAge: number; path?: string }[],
): Response {
  const headers = new Headers(res.headers);
  for (const c of cookies) {
    headers.append(
      'Set-Cookie',
      `${c.name}=${c.value}; HttpOnly; Secure; SameSite=Lax; Max-Age=${c.maxAge}; Path=${c.path || '/'}`,
    );
  }
  return new Response(res.body, { status: res.status, headers });
}

export function clearCookies(res: Response, names: string[]): Response {
  const headers = new Headers(res.headers);
  for (const name of names) {
    headers.append(
      'Set-Cookie',
      `${name}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`,
    );
  }
  return new Response(res.body, { status: res.status, headers });
}

/** Add CORS headers (supports multiple origins via CORS_ORIGIN comma-separated) */
export function withCors(res: Response, env: Env, requestOrigin?: string | null): Response {
  const allowed = env.CORS_ORIGIN.split(',').map((s: string) => s.trim());
  const origin = requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : allowed[0];

  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers });
}
