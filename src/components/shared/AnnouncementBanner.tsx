import { useState, useEffect } from 'react';
import { X, Megaphone } from 'lucide-react';

const STORAGE_KEY = 'announcement-dismissed';
const ANNOUNCEMENT_ID = 'auth-maintenance-2026-09-05';

export default function AnnouncementBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(STORAGE_KEY) !== ANNOUNCEMENT_ID);
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
          <strong>公告：</strong>登录功能维护中。普通账号及 Google 登录暂时不可用；公开内容仍可正常浏览。预计日本时间 9 月 5 日 09:00 后恢复。
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
