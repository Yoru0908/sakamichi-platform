// OAuth login CSRF protection. The provider echoes `state` back, so on its own it proves nothing: anyone can build a
// callback URL with their own code and a forged state (e.g. action "link" → their Discord linked to the victim's account).
// sealState() prefixes a random nonce and pins it in a short-lived cookie on this host; openState() only accepts a
// callback whose state carries the same nonce, i.e. one that started in this browser.
const COOKIE = 'oauth_nonce';
// Lax: sent on the provider's top-level GET redirect back to the callback, never on cross-site subrequests.
const ATTRS = 'HttpOnly; Secure; SameSite=Lax; Path=/api/auth/callback';

/** Redirect to the provider with a nonce-sealed state. `build` receives the state to put in the authorize URL. */
export function redirectWithState(innerState: string, build: (state: string) => string): Response {
  const nonce = crypto.randomUUID();
  return new Response(null, {
    status: 302,
    headers: { Location: build(`${nonce}.${innerState}`), 'Set-Cookie': `${COOKIE}=${nonce}; Max-Age=600; ${ATTRS}` },
  });
}

/** The inner state if the nonce matches this browser's cookie, else null. */
export function openState(req: Request, rawState: string | null): string | null {
  const dot = rawState?.indexOf('.') ?? -1;
  if (!rawState || dot <= 0) return null;
  const nonce = rawState.slice(0, dot);
  const cookie = req.headers.get('Cookie')?.match(/(?:^|;\s*)oauth_nonce=([^;]+)/)?.[1];
  return cookie && cookie === nonce ? rawState.slice(dot + 1) : null;
}

/** Clear the nonce once a callback used it (one state, one callback). */
export function clearState(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.append('Set-Cookie', `${COOKIE}=; Max-Age=0; ${ATTRS}`);
  return new Response(res.body, { status: res.status, headers });
}
