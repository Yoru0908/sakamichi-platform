import { useState, useEffect } from 'react';
import { X, Megaphone } from 'lucide-react';

const STORAGE_KEY = 'announcement-dismissed';
const ANNOUNCEMENT_ID = 'beta-msg-open-2026-03';

export default function AnnouncementBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== ANNOUNCEMENT_ID) {
      setVisible(true);
    }
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
          <strong>公告：</strong>投喂系统正在上线中，部分功能仍在紧急制作。MSG 消息存档暂时对所有用户开放，后续将逐步接入订阅权限。
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
