import type { RepoData } from '@/types/repo';
import { GROUP_META } from '@/types/repo';
import { proxyImageUrl } from '@/utils/proxy-image';
import RepoMemberImage from '../RepoMemberImage';

interface Props {
  data: RepoData;
}

function Avatar({ src, memberName, fallbackChar, color, size = 32 }: { src?: string; memberName?: string; fallbackChar: string; color: string; size?: number }) {
  return (
    <RepoMemberImage
      memberName={memberName}
      preferredSrc={src}
      alt=""
      className="rounded-sm object-cover object-top shrink-0"
      style={{ width: size, height: size, backgroundColor: '#f0f0f0' }}
      fallback={(
        <div
          className="rounded-sm shrink-0 flex items-center justify-center text-white font-bold"
          style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.35 }}
        >
          {fallbackChar}
        </div>
      )}
    />
  );
}

export default function OshiColorTemplate({ data }: Props) {
  const group = GROUP_META[data.groupId];

  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ width: 380 }}>
      {/* Elegant header with group color */}
      <div
        className="px-6 pt-6 pb-5 text-white"
        style={{ background: `linear-gradient(135deg, ${group.color} 0%, ${group.lightColor} 100%)` }}
      >
        <div className="flex items-center gap-4">
          {/* Member avatar */}
          <RepoMemberImage
            memberName={data.memberName}
            preferredSrc={data.memberImageUrl}
            alt={data.memberName}
            className="w-20 h-20 rounded-sm object-cover object-top border-2 border-white/40"
            fallback={(
              <div className="w-20 h-20 rounded-sm border-2 border-white/40 flex items-center justify-center bg-white/20 text-2xl font-bold">
                {data.memberName.charAt(0)}
              </div>
            )}
          />
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
            <div className="text-[10px] opacity-60 mb-0.5">♠ ニックネーム</div>
            <div className="text-base font-semibold" style={{ color: '#4ECDC4' }}>
              {data.nickname}<span className="opacity-50 font-normal text-sm">様</span>
            </div>
          </div>
        )}
      </div>

      {/* Chat content on soft background */}
      <div className="px-5 py-4 space-y-2.5" style={{ backgroundColor: group.bgColor }}>
        {data.messages.map(msg => {
          if (msg.speaker === 'narration') {
            return (
              <div key={msg.id} className="text-center space-y-1.5">
                {msg.imageUrl && <img src={proxyImageUrl(msg.imageUrl) ?? msg.imageUrl} alt="" className="max-h-28 rounded-lg object-contain mx-auto" />}
                {msg.text && <div className="text-[11px] px-4" style={{ color: group.color, opacity: 0.6 }}>（{msg.text}）</div>}
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex items-start gap-2.5 ${msg.speaker === 'me' ? 'flex-row-reverse' : ''}`}>
              <Avatar
                src={msg.speaker === 'member' ? data.memberImageUrl : data.userAvatar}
                memberName={msg.speaker === 'member' ? data.memberName : undefined}
                fallbackChar={msg.speaker === 'member' ? data.memberName.charAt(0) : '自'}
                color={msg.speaker === 'member' ? group.color : '#9ca3af'}
                size={40}
              />
              <div
                data-repo-bubble
                data-repo-bubble-min-height="42px"
                className={`max-w-[75%] px-3.5 py-2.5 text-[15px] leading-[1.5] whitespace-pre-wrap break-words ${
                  msg.speaker === 'me'
                    ? 'rounded-2xl rounded-br-sm text-white'
                    : 'bg-white rounded-2xl rounded-bl-sm text-gray-900 shadow-sm'
                }`}
                style={msg.speaker === 'me' ? { backgroundColor: group.color } : undefined}
              >
                <span data-repo-bubble-text data-repo-line-height="1.55">{msg.text}</span>
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
