import { useEffect, useRef, useState } from 'react';
import Danmaku from 'danmaku';
import { Send, Settings2, MessageSquare } from 'lucide-react';

interface DanmakuMessage {
  time: number;
  text: string;
  color?: string;
  type?: 'right' | 'top' | 'bottom';
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  danmakuContainerRef: React.RefObject<HTMLDivElement | null>;
  videoId: string;
  enabled?: boolean;
}

// ─── Main component: only renders the input bar ───
export default function DanmakuPlayer({ videoRef, danmakuContainerRef, videoId, enabled = true }: Props) {
  const danmakuRef = useRef<Danmaku | null>(null);
  const [inputText, setInputText] = useState('');
  const [danmakuEnabled, setDanmakuEnabled] = useState(enabled);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [danmakuCount, setDanmakuCount] = useState(0);

  // Initialize danmaku engine
  useEffect(() => {
    if (!danmakuContainerRef.current || !videoRef.current || !danmakuEnabled) return;

    const danmaku = new Danmaku({
      container: danmakuContainerRef.current,
      media: videoRef.current,
      speed: 144,
    });

    danmakuRef.current = danmaku;
    loadMessages();

    return () => {
      danmaku.destroy();
      danmakuRef.current = null;
    };
  }, [videoId, danmakuEnabled]);

  function loadMessages() {
    try {
      const stored = localStorage.getItem(`danmaku:${videoId}`);
      if (stored) {
        const data: DanmakuMessage[] = JSON.parse(stored);
        setDanmakuCount(data.length);
        data.forEach((msg) => {
          danmakuRef.current?.emit({
            text: msg.text,
            time: msg.time,
            mode: msg.type === 'top' ? 'top' : msg.type === 'bottom' ? 'bottom' : 'rtl',
            style: {
              color: msg.color || '#ffffff',
              fontSize: `${fontSize}px`,
              textShadow: '-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000',
            },
          });
        });
      }
    } catch {
      console.warn('Failed to load danmaku');
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || !videoRef.current) return;

    const msg: DanmakuMessage = {
      time: videoRef.current.currentTime,
      text: inputText.trim(),
      color: '#ffffff',
      type: 'right',
    };

    // Show immediately regardless of API
    danmakuRef.current?.emit({
      text: msg.text,
      mode: 'rtl',
      style: {
        color: '#ffffff',
        fontSize: `${fontSize}px`,
        textShadow: '-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000',
      },
    });
    setDanmakuCount(prev => prev + 1);
    setInputText('');

    // Persist to localStorage
    try {
      const stored = localStorage.getItem(`danmaku:${videoId}`);
      const existing: DanmakuMessage[] = stored ? JSON.parse(stored) : [];
      existing.push(msg);
      localStorage.setItem(`danmaku:${videoId}`, JSON.stringify(existing));
    } catch {
      // Storage full or unavailable
    }
  }

  return (
    <>
      {/* Input bar: rendered as normal flow below video */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-t"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
      >
        {/* Toggle */}
        <button
          onClick={() => setDanmakuEnabled(!danmakuEnabled)}
          className="shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
          style={{
            background: danmakuEnabled ? 'var(--color-brand-sakura)' : 'var(--bg-tertiary)',
            color: danmakuEnabled ? '#fff' : 'var(--text-tertiary)',
          }}
          title="开关弹幕"
        >
          <MessageSquare size={14} />
        </button>

        {/* Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={danmakuEnabled ? '发送弹幕...' : '弹幕已关闭'}
          disabled={!danmakuEnabled}
          className="flex-1 px-3 py-1.5 rounded-lg text-xs border focus:outline-none transition-colors"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        />

        {/* Send */}
        <button
          onClick={sendMessage}
          disabled={!danmakuEnabled || !inputText.trim()}
          className="shrink-0 p-1.5 rounded-lg transition-opacity disabled:opacity-30"
          style={{ color: 'var(--color-brand-sakura)' }}
        >
          <Send size={14} />
        </button>

        {/* Settings */}
        <div className="relative">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Settings2 size={14} />
          </button>

          {showSettings && (
            <div
              className="absolute bottom-full right-0 mb-2 w-56 rounded-lg border p-3 shadow-lg"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', zIndex: 30 }}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-primary)' }}>弹幕显示</span>
                  <button
                    onClick={() => setDanmakuEnabled(!danmakuEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors ${danmakuEnabled ? 'bg-[var(--color-brand-sakura)]' : 'bg-gray-400'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${danmakuEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>字号 {fontSize}px</label>
                  <input type="range" min="12" max="28" step="2" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-full h-1 appearance-none rounded-full" style={{ accentColor: 'var(--color-brand-sakura)' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Count */}
        <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {danmakuCount}条
        </span>
      </div>
    </>
  );
}
