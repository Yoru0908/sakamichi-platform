const UPSTREAM_BASE = 'https://api.46log.com/api/miguri/calendar';
const CACHE_TTL = 900;

const FEED_PATHS: Record<string, string> = {
  nogizaka: 'official/nogizaka.ics',
  sakurazaka: 'official/sakurazaka.ics',
  hinatazaka: 'official/hinatazaka.ics',
  lottery: 'lottery/all-groups.ics',
};

type ScheduleFunctionContext = {
  params: Record<string, string | string[]>;
  request: Request;
};

export const onRequest = async ({ params, request }: ScheduleFunctionContext) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const group = Array.isArray(params.group) ? params.group[0] : params.group;
  const feedPath = group ? FEED_PATHS[group] : undefined;
  if (!feedPath) {
    return new Response('Unknown schedule feed', { status: 404 });
  }

  try {
    const upstream = await fetch(`${UPSTREAM_BASE}/${feedPath}`, {
      headers: {
        Accept: 'text/calendar',
        'User-Agent': 'sakamichi-platform-schedule/1.0',
      },
    });

    if (!upstream.ok) {
      return new Response(`Schedule upstream error: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
        'X-Content-Type-Options': 'nosniff',
        'X-Schedule-Feed': group,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(`Schedule proxy error: ${message}`, { status: 502 });
  }
};
