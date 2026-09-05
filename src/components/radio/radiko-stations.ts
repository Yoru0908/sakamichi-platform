// The backend catalogue is authoritative. Never invent client-only stations that
// /live/tune will reject, and never discard a backend region not yet listed here.
export const REGION_ORDER = ['関東', '山梨', '甲信越', '関西', '東海', '北海道', '九州', '全国', 'NHK'];

export function groupStationsByRegion<T extends { region: string }>(stations: readonly T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const station of stations) {
    const region = station.region?.trim() || 'その他';
    const list = groups.get(region) ?? [];
    list.push(station);
    groups.set(region, list);
  }
  const order = [...REGION_ORDER, ...[...groups.keys()].filter(region => !REGION_ORDER.includes(region))];
  return order.filter(region => groups.has(region)).map(region => [region, groups.get(region)!]);
}
