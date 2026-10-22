export type Coordinates = [longitude: number, latitude: number];

export const NEARBY_RADII_KM = [1, 5, 10, 25, 50, 100] as const;

export function isValidCoordinates(point: Coordinates): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
    && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
}

/** Great-circle distance in km, not walking/driving distance. GeoJSON uses [lng, lat]. */
export function distanceBetween(from: Coordinates, to: Coordinates): number {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) return Infinity;
  const radians = (value: number) => value * Math.PI / 180;
  const a = Math.sin(radians(to[1] - from[1]) / 2) ** 2
    + Math.cos(radians(from[1])) * Math.cos(radians(to[1]))
    * Math.sin(radians(to[0] - from[0]) / 2) ** 2;
  const bounded = Math.min(1, Math.max(0, a));
  return 6371 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

export function findNearby<T extends { geometry: { coordinates: Coordinates } }>(
  features: T[], origin: Coordinates, radiusKm: number,
): { feature: T; distanceKm: number }[] {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return [];
  return features
    .map(feature => ({ feature, distanceKm: distanceBetween(origin, feature.geometry.coordinates) }))
    .filter(item => Number.isFinite(item.distanceKm) && item.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function formatDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return '—';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} km`;
}

export function locationErrorMessage(code?: number): string {
  if (code === 1) return '現在地の利用が許可されていません。ブラウザのサイト設定で位置情報を許可して、もう一度お試しください。';
  if (code === 2) return '現在地を確認できませんでした。端末の位置情報設定と通信環境を確認してください。';
  if (code === 3) return '現在地の取得がタイムアウトしました。電波の届く場所でもう一度お試しください。';
  return 'このブラウザでは現在地を取得できません。位置情報に対応したブラウザでお試しください。';
}
