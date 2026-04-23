interface Env {
  VIDEO_BUCKET: R2Bucket;
  ALLOWED_ORIGINS: string;
  FETCH_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',');
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Block Japanese IPs for direct access (allow requests from our frontend)
    const cf = (request as any).cf;
    const country = cf?.country || '';
    if (country === 'JP' && url.pathname !== '/fetch') {
      const referer = request.headers.get('Referer') || '';
      const isFromOurSite = allowedOrigins.some((o) => origin.startsWith(o) || referer.startsWith(o));
      if (!isFromOurSite) {
        return new Response(JSON.stringify({ error: 'Access restricted in your region' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // FETCH endpoint: POST /fetch — pull file from URL into R2
    if (url.pathname === '/fetch' && request.method === 'POST') {
      const secret = request.headers.get('X-Fetch-Secret');
      if (secret !== env.FETCH_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
      try {
        const { sourceUrl, r2Key } = await request.json() as { sourceUrl: string; r2Key: string };
        if (!sourceUrl || !r2Key) {
          return new Response(JSON.stringify({ error: 'sourceUrl and r2Key required' }), { status: 400 });
        }
        const resp = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!resp.ok) {
          return new Response(JSON.stringify({ error: `Source returned ${resp.status}`, body: (await resp.text()).slice(0, 500) }), { status: 502 });
        }
        await env.VIDEO_BUCKET.put(r2Key, resp.body, {
          httpMetadata: { contentType: 'video/mp4' },
        });
        const obj = await env.VIDEO_BUCKET.head(r2Key);
        return new Response(JSON.stringify({ ok: true, key: r2Key, size: obj?.size }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    // Path format: /show-name/filename.mp4
    // or /list/show-name for listing files
    const path = decodeURIComponent(url.pathname.slice(1)); // remove leading /

    if (!path) {
      return new Response(JSON.stringify({ error: 'Path required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // LIST endpoint: /list/show-name
    if (path.startsWith('list/')) {
      const prefix = path.slice(5); // remove "list/"
      const listed = await env.VIDEO_BUCKET.list({ prefix: prefix ? `${prefix}/` : undefined });
      const files = listed.objects.map((obj) => ({
        name: obj.key.split('/').pop(),
        key: obj.key,
        size: obj.size,
        modified: obj.uploaded.toISOString(),
      }));
      return new Response(JSON.stringify(files), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET video file
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const object = await env.VIDEO_BUCKET.get(path, {
      range: request.headers,
      onlyIf: request.headers,
    });

    if (!object) {
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    const headers = new Headers(corsHeaders);
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=86400');

    if (object.range) {
      const r = object.range as { offset: number; length: number };
      headers.set('Content-Range', `bytes ${r.offset}-${r.offset + r.length - 1}/${object.size}`);
      headers.set('Content-Length', r.length.toString());
      return new Response(object.body, { status: 206, headers });
    }

    headers.set('Content-Length', object.size.toString());
    if (request.method === 'HEAD') {
      return new Response(null, { headers });
    }
    return new Response(object.body, { headers });
  },
};
