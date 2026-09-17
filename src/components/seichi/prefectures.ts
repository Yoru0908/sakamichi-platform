export const PREFECTURES = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'] as const;
export const UNCLASSIFIED = '未判定・海外';
type Point = number[];
type Polygon = Point[][];
export interface BoundaryCollection {
  type: 'FeatureCollection';
  features: { properties: { shapeISO: string }; geometry: { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] } }[];
}
interface GeoFeature {
  geometry: { coordinates: number[] };
  properties: { prefecture?: string; address?: string; sceneNote?: string };
}

function inRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function createPrefectureResolver(collection: BoundaryCollection) {
  const polygons = collection.features.flatMap(feature => {
    const code = Number(feature.properties.shapeISO?.replace(/^JP-/, ''));
    const name = PREFECTURES[code - 1];
    if (!name) return [];
    const shapes = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return shapes.filter(shape => shape[0]?.length >= 3).map(shape => {
      const xs = shape[0].map(point => point[0]), ys = shape[0].map(point => point[1]);
      return { name, shape, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    });
  });
  return (point: Point): string | undefined => {
    if (point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return undefined;
    const matches = new Set<string>();
    for (const polygon of polygons) {
      if (point[0] < polygon.minX || point[0] > polygon.maxX || point[1] < polygon.minY || point[1] > polygon.maxY) continue;
      if (inRing(point, polygon.shape[0]) && !polygon.shape.slice(1).some(hole => inRing(point, hole))) matches.add(polygon.name);
    }
    return matches.size === 1 ? [...matches][0] : undefined;
  };
}

export function getFeaturePrefecture(feature: GeoFeature, resolve?: (point: Point) => string | undefined): string {
  // Prefer geographic containment; explicit source fields/address are fallbacks
  // for simplified coastlines. Never infer from a venue name or nearest centroid.
  const geographic = resolve?.(feature.geometry.coordinates);
  if (geographic) return geographic;
  const explicit = feature.properties.prefecture;
  if (explicit && (PREFECTURES as readonly string[]).includes(explicit)) return explicit;
  const address = feature.properties.address || feature.properties.sceneNote?.match(/住所\s*[:：]\s*([^\n]+)/)?.[1] || '';
  const matches = PREFECTURES.filter(name => new RegExp(`(^|[\\s〒:：,、0-9-])${name}`).test(address));
  return matches.length === 1 ? matches[0] : UNCLASSIFIED;
}
