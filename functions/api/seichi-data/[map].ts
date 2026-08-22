const CACHE_TTL = 300;
const MIN_OVERSEA_FEATURES = 100;
const SOURCES: Record<string, string> = {
  oversea: 'https://raw.githubusercontent.com/Yoru0908/sakamichi-platform/sakamichi-platform/public/seichi/oversea.geojson',
};

type SeichiDataContext = {
  params: Record<string, string | string[]>;
  request: Request;
};

export const onRequest = async ({ params, request }: SeichiDataContext) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const map = Array.isArray(params.map) ? params.map[0] : params.map;
  const source = map ? SOURCES[map] : undefined;
  if (!source) return new Response('Unknown seichi map', { status: 404 });

  try {
    const upstream = await fetch(source, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'sakamichi-platform-seichi-sync/1.0',
      },
      cf: { cacheTtl: CACHE_TTL },
    } as RequestInit);
    if (!upstream.ok) {
      return new Response(`Seichi data upstream error: ${upstream.status}`, { status: 502 });
    }

    const text = await upstream.text();
    const data = JSON.parse(text) as { type?: string; features?: unknown[] };
    if (
      data.type !== 'FeatureCollection' ||
      !Array.isArray(data.features) ||
      (map === 'oversea' && data.features.length < MIN_OVERSEA_FEATURES)
    ) {
      return new Response('Seichi data failed validation', { status: 502 });
    }

    return new Response(request.method === 'HEAD' ? null : text, {
      status: 200,
      headers: {
        'Content-Type': 'application/geo+json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}, stale-if-error=86400`,
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'X-Seichi-Map': map,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(`Seichi data proxy error: ${message}`, { status: 502 });
  }
};
