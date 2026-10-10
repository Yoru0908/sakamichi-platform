import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUTE_PARAM, rebaseKeys, type ShareMode } from './route-share';

// 共同編集ルームのクライアント。ルートの正本は各ページの既存ローカル状態のまま、
// ルーム中だけ「ローカル ⇄ サーバー」を同期する（5秒ポーリング、楽観ロック + 再適用）。
export const ROOM_PARAM = 'room';
const POLL_MS = 5000;
const PUSH_DELAY_MS = 600;
const ID_RE = /^[a-z2-9]{10}$/;

export type RoomStatus = 'off' | 'live' | 'offline';
type Room = { id: string; keys: string[]; mode: ShareMode; version: number; title: string };

type Options = {
  keys: string[];
  mode: ShareMode;
  /** 既存のローカル復元が終わり、validKey が使えるようになったら true。 */
  ready: boolean;
  validKey: (key: string) => boolean;
  maxStops: number;
  /** サーバー状態をローカルへ反映（進捗はここで触らない）。 */
  apply: (keys: string[], mode: ShareMode) => void;
  onNotice: (message: string) => void;
  onJoined?: () => void;
  apiBase?: string;
};

export type RouteRoomApi = {
  available: boolean;
  roomId: string | null;
  status: RoomStatus;
  inviteUrl: string | null;
  start: () => Promise<void>;
  leave: () => void;
};

const toRoom = (raw: { id?: string; keys: string[]; mode: ShareMode; version: number; title?: string }, id: string): Room =>
  ({ id, keys: raw.keys, mode: raw.mode, version: raw.version, title: raw.title ?? '' });

export function useRouteRoom(options: Options): RouteRoomApi {
  const latest = useRef(options);
  latest.current = options;
  const apiBase = options.apiBase ?? '/api/route-rooms';
  const [available, setAvailable] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<RoomStatus>('off');
  const server = useRef<Room | null>(null);
  const idRef = useRef<string | null>(null);
  const busy = useRef(false);
  const joined = useRef(false);
  const probed = useRef(false);

  const storageKey = () => `seichi-room:${location.pathname}`;
  const remember = (id: string | null) => {
    try { id ? localStorage.setItem(storageKey(), id) : localStorage.removeItem(storageKey()); } catch { /* storage may be unavailable */ }
  };
  const call = useCallback((path: string, init?: RequestInit) =>
    fetch(`${apiBase}${path}`, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }), [apiBase]);

  const drop = (message: string) => {
    idRef.current = null;
    server.current = null;
    setRoomId(null);
    setStatus('off');
    remember(null);
    latest.current.onNotice(message);
  };
  const adopt = (room: Room) => {
    server.current = room;
    const { validKey, apply } = latest.current;
    apply(room.keys.filter(validKey), room.mode);
  };
  const matchesServer = () => {
    const room = server.current;
    if (!room) return true;
    const { keys, mode, validKey } = latest.current;
    const remote = room.keys.filter(validKey);
    return room.mode === mode && remote.length === keys.length && remote.every((k, i) => k === keys[i]);
  };

  /** ローカルがサーバーと同じなら取得、違えば（相手の変更を載せ直して）送信。 */
  const sync = useCallback(async () => {
    const id = idRef.current;
    if (!id || !server.current || busy.current) return;
    busy.current = true;
    try {
      if (matchesServer()) {
        const res = await call(`/${id}`);
        if (res.status === 404) { drop('共同編集ルームが見つかりません（期限切れ）'); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = toRoom(await res.json(), id);
        if (next.version > server.current.version) adopt(next);
        setStatus('live');
        return;
      }
      const { keys, mode, validKey, maxStops, onNotice } = latest.current;
      // この端末で解決できない地点（古いデータ等）は、他の人のものを消さないよう末尾に残す。
      let room = server.current;
      let payload = [...keys, ...room.keys.filter((k) => !validKey(k))].slice(0, maxStops);
      let payloadMode = mode;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const res = await call(`/${id}`, { method: 'PUT', body: JSON.stringify({ keys: payload, mode: payloadMode, title: room.title, baseVersion: room.version }) });
        if (res.status === 404) { drop('共同編集ルームが見つかりません（期限切れ）'); return; }
        if (res.ok) {
          const { version } = await res.json() as { version: number };
          server.current = { ...room, keys: payload, mode: payloadMode, version };
          if (attempt > 0) { latest.current.apply(payload.filter(validKey), payloadMode); onNotice('他の人の変更と統合しました'); }
          setStatus('live');
          return;
        }
        if (res.status !== 409) throw new Error(`HTTP ${res.status}`);
        const current = toRoom(await res.json(), id);
        if (attempt === 0) {
          payload = rebaseKeys(room.keys, payload, current.keys, maxStops);
          payloadMode = payloadMode !== room.mode ? payloadMode : current.mode;
          room = current;
          continue;
        }
        adopt(current);
        onNotice('他の人の変更が先に反映されました');
      }
    } catch (error) {
      console.warn('route room sync failed:', error);
      setStatus('offline');
    } finally {
      busy.current = false;
    }
  }, [call]);

  const probe = useCallback(async () => {
    if (probed.current) return available;
    probed.current = true;
    try {
      const res = await call('/_');
      const ok = res.ok;
      setAvailable(ok);
      return ok;
    } catch {
      return false;
    }
  }, [call, available]);

  // 参加: ?room= の招待リンク、または前回参加したルーム。ローカル復元（ready）の後にだけ動く。
  useEffect(() => {
    if (!options.ready || joined.current) return;
    joined.current = true;
    const url = new URL(window.location.href);
    const invited = url.searchParams.get(ROOM_PARAM);
    if (invited !== null) {
      url.searchParams.delete(ROOM_PARAM);
      url.searchParams.delete(ROUTE_PARAM); // room が優先
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    let id = invited;
    if (id === null) { try { id = localStorage.getItem(storageKey()); } catch { id = null; } }
    if (!id) return;
    void (async () => {
      if (!(await probe())) return;
      if (!ID_RE.test(id!)) { if (invited !== null) latest.current.onNotice('招待リンクを読み取れませんでした'); remember(null); return; }
      try {
        const res = await call(`/${id}`);
        if (res.status === 404) { remember(null); if (invited !== null) latest.current.onNotice('共同編集ルームが見つかりません（期限切れ）'); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const room = toRoom(await res.json(), id!);
        const { keys, validKey, onNotice, onJoined } = latest.current;
        const different = room.keys.filter(validKey).join('\n') !== keys.join('\n');
        if (invited !== null && keys.length > 0 && different
          && !window.confirm(`共同編集ルーム（${room.keys.length}地点）に参加します。現在のルートは置き換えられます。よろしいですか？`)) return;
        idRef.current = id!;
        adopt(room);
        setRoomId(id!);
        setStatus('live');
        remember(id!);
        if (invited !== null) { onJoined?.(); onNotice('共同編集に参加しました'); }
      } catch (error) {
        console.warn('route room join failed:', error);
        if (invited !== null) latest.current.onNotice('共同編集ルームに接続できませんでした');
      }
    })();
  }, [options.ready]);

  // ルートを作り始めたら一度だけ利用可否を確認（無い環境ではボタンを出さない）。
  const hasStops = options.keys.length > 0;
  useEffect(() => { if (options.ready && hasStops) void probe(); }, [options.ready, hasStops]);

  // ローカル編集 → 送信
  const keySignature = `${options.mode}|${options.keys.join('\n')}`;
  useEffect(() => {
    if (!roomId) return;
    const timer = setTimeout(() => { void sync(); }, PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [keySignature, roomId, sync]);

  // 他の人の変更 → 取得
  useEffect(() => {
    if (!roomId) return;
    const tick = () => { if (document.visibilityState === 'visible') void sync(); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick); };
  }, [roomId, sync]);

  const start = useCallback(async () => {
    const { keys, mode, onNotice } = latest.current;
    try {
      const res = await call('', { method: 'POST', body: JSON.stringify({ keys, mode }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { id } = await res.json() as { id: string };
      idRef.current = id;
      server.current = { id, keys, mode, version: 1, title: '' };
      setRoomId(id);
      setStatus('live');
      remember(id);
      onNotice('共同編集を始めました。招待リンクを共有してください');
    } catch (error) {
      console.warn('route room create failed:', error);
      onNotice('共同編集を始められませんでした');
    }
  }, [call]);

  const leave = useCallback(() => drop('共同編集を終了しました（ルートはこの端末に残ります）'), []);

  const inviteUrl = roomId && typeof location !== 'undefined' ? `${location.origin}${location.pathname}?${ROOM_PARAM}=${roomId}` : null;
  return { available, roomId, status, inviteUrl, start, leave };
}
