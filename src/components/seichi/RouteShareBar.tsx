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
    if (await copyText(room.inviteUrl)) onNotice('招待リンクをコピーしました');
    else window.prompt('招待リンクをコピーしてください', room.inviteUrl);
  };
  const showRoom = !!room && (room.available || !!room.roomId);

  return (
    <div className="space-y-2" data-route-share>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={shareImage} disabled={busy || stops.length === 0} className={buttonClass}>
          <ImageDown size={15} />
          {busy ? '作成中…' : '画像で共有'}
        </button>
        <button type="button" onClick={copyLink} disabled={keys.length === 0} className={buttonClass}>
          <Link2 size={15} />
          リンクをコピー
        </button>
      </div>
      {showRoom && room && (room.roomId ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-900" data-route-room="live">
          <p className="text-xs font-bold" role="status">
            共同編集中 · {room.status === 'offline' ? 'オフライン（再接続を待っています）' : '同期中'}
          </p>
          <p className="text-[11px] leading-relaxed">招待リンクを開いた人と同じルートを編集できます。リンクを知っている人は誰でも編集できます。</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={copyInvite} className={buttonClass}><Link2 size={15} />招待リンク</button>
            <button type="button" onClick={room.leave} className={buttonClass}><LogOut size={15} />終了</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={room.start} disabled={keys.length === 0} className={`${buttonClass} w-full`} data-route-room="start">
          <Users size={15} />
          共同編集を始める
        </button>
      ))}
    </div>
  );
}
