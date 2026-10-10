import { handleRouteRooms, type RoomDb } from '../../../src/server/route-rooms';

// 共同編集ルーム API。D1 binding `ROUTE_ROOMS_DB` が無い間は 503（フロントは共同編集を隠す）。
type RouteRoomsContext = {
  params: Record<string, string | string[]>;
  request: Request;
  env: { ROUTE_ROOMS_DB?: RoomDb };
};

export const onRequest = async ({ params, request, env }: RouteRoomsContext) => {
  const path = params.path;
  const sub = Array.isArray(path) && path.length ? `/${path.join('/')}` : '';
  return handleRouteRooms(request, env.ROUTE_ROOMS_DB, sub, { maxStops: 12 });
};
