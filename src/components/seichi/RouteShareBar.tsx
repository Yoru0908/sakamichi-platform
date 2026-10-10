import { useState } from 'react';
import { ImageDown, Link2 } from 'lucide-react';
import {
  buildShareUrl, copyText, renderRouteImage, shareOrDownloadImage,
  type ShareMode, type ShareStop,
} from './route-share';

type Props = {
  keys: string[];
  stops: ShareStop[];
  mode: ShareMode;
  /** 画像の透かし。省略時は現在のホスト名。 */
  siteName?: string;
  /** サイトごとのボタン見た目（Tailwind クラス）。 */
  buttonClass: string;
  onNotice: (message: string) => void;
  title?: string;
};

/** 路線を画像（A=地点名の一覧 + 略図）または ?route= リンクで共有する。 */
export default function RouteShareBar({ keys, stops, mode, siteName, buttonClass, onNotice, title = '巡礼ルート' }: Props) {
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

  return (
    <div className="grid grid-cols-2 gap-2" data-route-share>
      <button type="button" onClick={shareImage} disabled={busy || stops.length === 0} className={buttonClass}>
        <ImageDown size={15} />
        {busy ? '作成中…' : '画像で共有'}
      </button>
      <button type="button" onClick={copyLink} disabled={keys.length === 0} className={buttonClass}>
        <Link2 size={15} />
        リンクをコピー
      </button>
    </div>
  );
}
