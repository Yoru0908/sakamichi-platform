import { useState } from 'react';
import type { RepoData } from '@/types/repo';
import { GROUP_META } from '@/types/repo';

interface Props {
  data: RepoData;
}

export default function OshiColorTemplate({ data }: Props) {
  const group = GROUP_META[data.groupId];
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ width: 380 }}>
      {/* Elegant header with group color */}
      <div
        className="px-6 pt-6 pb-5 text-white"
        style={{ background: `linear-gradient(135deg, ${group.color} 0%, ${group.lightColor} 100%)` }}
      >
        <div className="flex items-center gap-4">
          {/* Member avatar */}
          {!imgFailed && data.memberImageUrl ? (
            <img
              src={data.memberImageUrl}
              alt={data.memberName}
              className="w-16 h-16 rounded-full object-cover object-top border-2 border-white/40"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="w-16 h-16 rounded-full border-2 border-white/40 flex items-center justify-center bg-white/20 text-xl font-bold">
              {data.memberName.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold">{data.memberName}</div>
            <div className="text-xs opacity-80 mt-0.5">{data.groupName}</div>
            <div className="text-[11px] opacity-60 mt-1">
              {data.eventDate} ・ 第{data.slotNumber}部 ・ 枚数{data.ticketCount}
            </div>
          </div>
        </div>
        {data.nickname && (
          <div className="mt-3 text-center">
            <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-medium">
              ♠ {data.nickname}様
            </span>
          </div>
        )}
      </div>

      {/* Chat content on soft background */}
      <div className="px-5 py-4 space-y-2.5" style={{ backgroundColor: group.bgColor }}>
        {data.messages.map(msg => {
          if (msg.speaker === 'narration') {
            return (
              <div key={msg.id} className="text-center space-y-1.5">
                {msg.imageUrl && <img src={msg.imageUrl} alt="" className="max-h-28 rounded-lg object-contain mx-auto" />}
                {msg.text && <div className="text-[11px] italic px-4" style={{ color: group.color, opacity: 0.6 }}>（{msg.text}）</div>}
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex ${msg.speaker === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-3.5 py-2 text-[13px] leading-[1.6] whitespace-pre-wrap break-words ${
                  msg.speaker === 'me'
                    ? 'rounded-2xl rounded-br-sm text-white'
                    : 'bg-white rounded-2xl rounded-bl-sm text-gray-800 shadow-sm'
                }`}
                style={msg.speaker === 'me' ? { backgroundColor: group.color } : undefined}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="py-2.5 text-center" style={{ backgroundColor: group.bgColor }}>
        <span className="text-[10px] tracking-wider" style={{ color: group.color, opacity: 0.3 }}>Repo Generator</span>
      </div>
    </div>
  );
}
