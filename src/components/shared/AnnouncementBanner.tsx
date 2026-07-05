import { useState, useEffect } from 'react';
import { X, Megaphone } from 'lucide-react';

const STORAGE_KEY = 'announcement-dismissed';
const ANNOUNCEMENT_ID = 'server-outage-2026-07';

export default function AnnouncementBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, ANNOUNCEMENT_ID);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="relative bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-center px-4 py-2.5 text-xs sm:text-sm leading-relaxed">
      <div className="max-w-3xl mx-auto flex items-center justify-center gap-2">
        <Megaphone size={14} className="shrink-0 hidden sm:block" />
        <span>
          <strong>公告：</strong>后端服务器故障中，MSG 推送、广播收听、新内容抓取等服务暂时不可用；已有博客内容可正常浏览。预计 7 月 3 日前恢复。
        </span>
      </div>
      <button
        onClick={dismiss}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/20 transition-colors cursor-pointer"
        title="关闭"
      >
        <X size={14} />
      </button>
    </div>
  );
}
