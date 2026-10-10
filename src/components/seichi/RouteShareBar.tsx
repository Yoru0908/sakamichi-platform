import { useState } from 'react';
import { ImageDown, Link2, Users, LogOut } from 'lucide-react';
import {
  buildShareUrl, copyText, renderRouteImage, shareOrDownloadImage,
  type ShareMode, type ShareStop,
} from './route-share';
import type { RouteRoomApi } from './use-route-room';

type Props = {
  keys: string[];
  stops: ShareStop[];
  mode: ShareMode;
  /** 画像の透かし。省略時は現在のホスト名。 */
  siteName?: string;
  /** サイトごとのボタン見た目（Tailwind クラス）。 */
  buttonClass: string;
  onNotice: (message: string) => void;
  /** 共同編集。サーバーが無い環境では available=false で非表示。 */
  room?: RouteRoomApi;
  title?: string;
};

/** 路線を画像（A=地点名の一覧 + 略図）または ?route= リンクで共有する。 */
export default function RouteShareBar({ keys, stops, mode, siteName, buttonClass, onNotice, room, title = '巡礼ルート' }: Props) {
  const [busy, setBusy] = useState(false);
  const link = () => buildShareUrl(location.origin, location.pathname, keys, mode);

  const shareImage = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await renderRouteImage({ title, mode, stops, siteName: siteName ?? location.host });
      const result = await shareOrDownloadImage(blob, { filename: 'seichi-route.png', title, text: `${title}\n${link()}` });
      if (result === 'shared') onNotice('画像を共有しました');
      if (result === 'downloaded') onNotice('画像を保存しました');
    } catch (error) {
      console.warn('Failed to create the route share image:', error);
      onNotice('画像を作成できませんでした');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    const url = link();
    if (await copyText(url)) onNotice('リンクをコピーしました');
    else window.prompt('リンクをコピーしてください', url);
  };

  const copyInvite = async () => {
    if (!room?.inviteUrl) return;
    if (await copyText(room.inviteUrl)) onNotice('招待リンクをコピーしました（リンクを知っている人は誰でも編集できます）');
    else window.prompt('招待リンクをコピーしてください', room.inviteUrl);
  };
  const showRoom = !!room && (room.available || !!room.roomId);
  const live = !!room?.roomId;
  const label = 'min-w-0 truncate';
  const cols = live ? 'grid-cols-4' : showRoom ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className={`grid gap-2 ${cols}`} data-route-share data-route-room={live ? 'live' : undefined}>
      <button type="button" onClick={shareImage} disabled={busy || stops.length === 0} className={buttonClass} aria-label="画像で共有">
        <ImageDown size={16} className="shrink-0" />
        <span className={label}>{busy ? '作成中' : '画像'}</span>
      </button>
      <button type="button" onClick={copyLink} disabled={keys.length === 0} className={buttonClass} aria-label="ルートのリンクをコピー">
        <Link2 size={16} className="shrink-0" />
        <span className={label}>リンク</span>
      </button>
      {showRoom && room && (live ? (
        <>
          <button type="button" onClick={copyInvite} className={`${buttonClass} relative`} aria-label="共同編集中。招待リンクをコピー"
            title={room.status === 'offline' ? 'オフライン · 再接続を待っています' : 'リンクを知っている人は誰でも編集できます'}>
            <Users size={16} className="shrink-0" />
            <span className={label}>招待</span>
            <span aria-hidden="true" className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${room.status === 'offline' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          </button>
          <button type="button" onClick={room.leave} className={buttonClass} aria-label="共同編集を終了">
            <LogOut size={16} className="shrink-0" />
            <span className={label}>終了</span>
          </button>
        </>
      ) : (
        <button type="button" onClick={room.start} disabled={keys.length === 0} className={buttonClass} data-route-room="start" aria-label="共同編集を始める">
          <Users size={16} className="shrink-0" />
          <span className={label}>共同編集</span>
        </button>
      ))}
    </div>
  );
}
