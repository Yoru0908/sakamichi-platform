import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, MessageCircle, Image, Italic } from 'lucide-react';
import type { Message } from '@/types/repo';

interface Props {
  messages: Message[];
  onChange: (messages: Message[]) => void;
  memberName: string;
  groupColor: string;
}

let msgCounter = 100;
function nextId() { return `msg_${++msgCounter}`; }

export default function ChatEditor({ messages, onChange, memberName, groupColor }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function addMessage(speaker: 'me' | 'member' | 'narration') {
    const newMsg: Message = { id: nextId(), speaker, text: '' };
    onChange([...messages, newMsg]);
    setTimeout(() => setEditingId(newMsg.id), 50);
  }

  function addImageMessage() {
    const url = prompt('画像URLを入力してください（または後で貼り付け）');
    if (url !== null) {
      const newMsg: Message = { id: nextId(), speaker: 'narration', text: '', imageUrl: url || '' };
      onChange([...messages, newMsg]);
    }
  }

  function updateMessage(id: string, updates: Partial<Message>) {
    onChange(messages.map(m => m.id === id ? { ...m, ...updates } : m));
  }

  function deleteMessage(id: string) {
    onChange(messages.filter(m => m.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function cycleSpeaker(id: string) {
    const cycle: Record<string, 'me' | 'member' | 'narration'> = { me: 'member', member: 'narration', narration: 'me' };
    onChange(messages.map(m =>
      m.id === id ? { ...m, speaker: cycle[m.speaker] || 'me' } : m
    ));
  }

  const handleImageUpload = useCallback((msgId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        updateMessage(msgId, { imageUrl: e.target.result as string });
      }
    };
    reader.readAsDataURL(file);
  }, [messages]);

  useEffect(() => {
    if (editingId) {
      const el = document.getElementById(`msg-input-${editingId}`);
      el?.focus();
    }
  }, [editingId]);

  function getSpeakerLabel(speaker: string) {
    if (speaker === 'me') return '自';
    if (speaker === 'member') return 'M';
    return '★';
  }

  function getSpeakerColor(speaker: string) {
    if (speaker === 'me') return '#6b7280';
    if (speaker === 'member') return groupColor;
    return '#d97706';
  }

  function getPlaceholder(speaker: string) {
    if (speaker === 'me') return 'あなたの発言...';
    if (speaker === 'member') return `${memberName || 'メンバー'}の発言...`;
    return '（ト書き・旁白を入力...）';
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500 mb-1">
        <MessageCircle size={12} className="inline mr-1" />
        対話内容
      </label>

      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`group flex items-start gap-1.5 ${
              msg.speaker === 'me' ? 'flex-row-reverse' :
              msg.speaker === 'narration' ? 'justify-center' : ''
            }`}
          >
            {/* Speaker indicator */}
            {msg.speaker !== 'narration' && (
              <button
                type="button"
                onClick={() => cycleSpeaker(msg.id)}
                className="shrink-0 mt-1 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white transition-colors cursor-pointer"
                style={{ backgroundColor: getSpeakerColor(msg.speaker) }}
                title="クリックで話者切替 (自→M→ト書き)"
              >
                {getSpeakerLabel(msg.speaker)}
              </button>
            )}

            {/* Bubble / Narration */}
            {msg.speaker === 'narration' ? (
              <div className="flex-1 min-w-0">
                {/* Image area */}
                {msg.imageUrl !== undefined && (
                  <div className="mb-1.5">
                    {msg.imageUrl ? (
                      <div className="relative group/img">
                        <img src={msg.imageUrl} alt="" className="max-h-32 rounded-lg object-contain mx-auto" />
                        <button
                          type="button"
                          onClick={() => updateMessage(msg.id, { imageUrl: '' })}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-[10px] opacity-0 group-hover/img:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="block cursor-pointer">
                        <div className="border-2 border-dashed border-amber-300 rounded-lg py-3 text-center text-xs text-amber-500 hover:bg-amber-50 transition-colors">
                          📷 クリックで画像をアップロード
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => e.target.files?.[0] && handleImageUpload(msg.id, e.target.files[0])}
                        />
                      </label>
                    )}
                  </div>
                )}
                {/* Narration text */}
                <div className="relative rounded-xl px-3 py-1.5 bg-amber-50 border border-amber-200 text-center">
                  {editingId === msg.id ? (
                    <textarea
                      id={`msg-input-${msg.id}`}
                      value={msg.text}
                      onChange={e => updateMessage(msg.id, { text: e.target.value })}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingId(null); } }}
                      placeholder={getPlaceholder(msg.speaker)}
                      className="w-full bg-transparent outline-none resize-none text-xs italic text-amber-700 leading-relaxed min-h-[1.2em] text-center"
                      rows={1}
                    />
                  ) : (
                    <div onClick={() => setEditingId(msg.id)} className="cursor-text min-h-[1.2em] text-xs italic text-amber-700 whitespace-pre-wrap">
                      {msg.text || <span className="text-amber-400">（ト書きを入力...）</span>}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className={`flex-1 min-w-0 relative rounded-2xl px-3 py-2 text-sm ${
                  msg.speaker === 'me'
                    ? 'bg-gray-100 rounded-tr-sm'
                    : 'bg-white border border-gray-200 rounded-tl-sm'
                }`}
              >
                {editingId === msg.id ? (
                  <textarea
                    id={`msg-input-${msg.id}`}
                    value={msg.text}
                    onChange={e => updateMessage(msg.id, { text: e.target.value })}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingId(null); } }}
                    placeholder={getPlaceholder(msg.speaker)}
                    className="w-full bg-transparent outline-none resize-none text-sm leading-relaxed min-h-[1.5em]"
                    rows={Math.max(1, msg.text.split('\n').length)}
                  />
                ) : (
                  <div onClick={() => setEditingId(msg.id)} className="cursor-text min-h-[1.5em] whitespace-pre-wrap break-words">
                    {msg.text || <span className="text-gray-300 italic">{getPlaceholder(msg.speaker)}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Delete */}
            <button
              type="button"
              onClick={() => deleteMessage(msg.id)}
              className="shrink-0 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400"
              title="削除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Add buttons - member left, narration center, me right (matching bubble positions) */}
      <div className="grid grid-cols-4 gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => addMessage('member')}
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-xl border border-dashed text-[11px] hover:opacity-90 transition-opacity"
          style={{ borderColor: groupColor, backgroundColor: groupColor + '10', color: groupColor }}
        >
          <Plus size={12} /> {memberName ? memberName.slice(0, 3) : 'M'}
        </button>
        <button
          type="button"
          onClick={() => addMessage('narration')}
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-xl border border-dashed border-amber-300 text-[11px] text-amber-600 hover:bg-amber-50 transition-colors"
        >
          <Italic size={12} /> ト書き
        </button>
        <button
          type="button"
          onClick={addImageMessage}
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-xl border border-dashed border-blue-300 text-[11px] text-blue-500 hover:bg-blue-50 transition-colors"
        >
          <Image size={12} /> 画像
        </button>
        <button
          type="button"
          onClick={() => addMessage('me')}
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-xl border border-dashed border-gray-300 text-[11px] text-gray-500 hover:border-gray-400 transition-colors"
        >
          <Plus size={12} /> 自分
        </button>
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-1">
        💡 話者アイコンをクリックで切替（自→M→ト書き）
      </p>
    </div>
  );
}
