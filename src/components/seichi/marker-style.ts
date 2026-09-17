export type MarkerKind = 'music' | 'vlog' | 'tv' | 'book' | 'blog' | 'person' | 'live' | 'place';
type FeatureLike = { properties: { category?: string; subcategory?: string } };
const svg = (body: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const MARKER_STYLES = {
  music: { label: 'MV・楽曲', color: '#be185d', tint: '#fdf2f8', svg: svg('<rect x="3" y="5" width="18" height="15" rx="3"/><path d="m3 9 18-4M7 4l3 4m4-5 3 4m-7 6 5 3-5 3z"/>') },
  vlog: { label: 'Vlog・動画', color: '#1d4ed8', tint: '#eff6ff', svg: svg('<rect x="3" y="6" width="13" height="13" rx="3"/><path d="m16 10 5-3v11l-5-3"/>') },
  tv: { label: '番組・映像', color: '#6d28d9', tint: '#f5f3ff', svg: svg('<rect x="3" y="7" width="18" height="13" rx="3"/><path d="m8 3 4 4 4-4M9 17h6"/>') },
  book: { label: '雑誌・写真集', color: '#a16207', tint: '#fefce8', svg: svg('<path d="M12 5v15M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/>') },
  blog: { label: 'Blog・SNS', color: '#0f766e', tint: '#f0fdfa', svg: svg('<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M7 9h10M7 13h6"/>') },
  person: { label: '個人PV・サイン', color: '#9a3412', tint: '#fff7ed', svg: svg('<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>') },
  live: { label: 'ライブ・舞台', color: '#4338ca', tint: '#eef2ff', svg: svg('<path d="M4 8a3 3 0 0 1 3-3h13v5a2 2 0 0 0 0 4v5H7a3 3 0 0 1-3-3v-2a2 2 0 0 0 0-4zM15 5v3m0 3v2m0 3v3"/>') },
  place: { label: 'その他の地点', color: '#475569', tint: '#f8fafc', svg: svg('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>') },
} as const;

export function getMarkerKind(feature: FeatureLike): MarkerKind {
  const category = feature.properties.category || '';
  if (/個人PV|サイン/.test(category)) return 'person';
  if (/ヒット祈願|ひなあい/.test(category)) return 'tv';
  if (/MV|PV|ジャケット|シングル・アルバム.*ロケ地/.test(category)) return 'music';
  if (/Vlog|ちゃんねる|チャンネル|CD特典/.test(category)) return 'vlog';
  if (/テレビ|番組|映画|ドラマ/.test(category)) return 'tv';
  if (/雑誌|写真集|グラビア|新聞/.test(category)) return 'book';
  if (/blog|ブログ|SNS|MSG/i.test(category)) return 'blog';
  if (/Live|ライブ|舞台|Event/i.test(category)) return 'live';
  return 'place';
}

/** Only trusted SVG constants and route labels enter HTML, never source names/colors. */
export function markerHtml(kind: MarkerKind, selected: boolean, routeLabel = '', visited = false, active = false) {
  const style = MARKER_STYLES[kind];
  const safeLabel = /^[A-Z0-9]{1,3}$/.test(routeLabel) ? routeLabel : '';
  const route = Boolean(safeLabel);
  const content = route ? `${visited ? '✓' : safeLabel}<span class="seichi-marker-route-icon">${style.svg}</span>` : style.svg;
  const state = `${selected ? ' is-selected' : ''}${route ? ' is-route' : ''}${visited ? ' is-visited' : ''}${active ? ' is-active' : ''}`;
  return `<span class="seichi-marker-glyph${state}" data-marker-kind="${kind}" style="--marker-color:${style.color};--marker-tint:${style.tint}">${content}</span>`;
}
