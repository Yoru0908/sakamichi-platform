import type { RepoData } from '@/types/repo';
import { GROUP_META } from '@/types/repo';
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

export default function MeguriTemplate({ data }: Props) {
  const group = GROUP_META[data.groupId];

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100" style={{ width: 380 }}>
      {/* Header */}
      <div className="flex items-start gap-4 p-5 pb-4" style={{ background: `linear-gradient(135deg, ${group.bgColor} 0%, white 100%)` }}>
        {/* Member photo or fallback */}
        <RepoMemberImage
          memberName={data.memberName}
          preferredSrc={data.memberImageUrl}
          alt={data.memberName}
          className="w-20 h-24 rounded-sm object-cover object-top shadow-sm"
          style={{ backgroundColor: group.bgColor }}
          fallback={(
            <div
              className="w-20 h-24 rounded-sm flex items-center justify-center text-white text-2xl font-bold shadow-sm"
              style={{ backgroundColor: group.color }}
            >
              {data.memberName.charAt(0)}
            </div>
          )}
        />
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="text-sm font-bold" style={{ color: group.color }}>{data.groupName}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {data.eventDate}（{getDayOfWeek(data.eventDate)}）
          </div>
          <div className="text-sm font-semibold mt-1.5">
            第{data.slotNumber}部　{data.memberName}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">枚数 {data.ticketCount}</div>
        </div>
      </div>

      {/* Nickname - centered like reference site */}
      {data.nickname && (
        <div className="text-center py-3 border-b border-gray-100 mx-5">
          <div className="text-[10px] text-gray-400 mb-1">♠ ニックネーム</div>
          <div className="text-base font-semibold" style={{ color: '#4ECDC4' }}>
            {data.nickname}<span className="text-gray-400 font-normal text-sm">様</span>
          </div>
        </div>
      )}

      {/* Divider (only if no nickname) */}
      {!data.nickname && <div className="h-px bg-gray-100 mx-5" />}

      {/* Chat bubbles */}
      <div className="px-4 py-4 space-y-2.5">
        {data.messages.map(msg => {
          if (msg.speaker === 'narration') {
            return (
              <div key={msg.id} className="text-center space-y-1.5">
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="" className="max-h-28 rounded-lg object-contain mx-auto" />
                )}
                {msg.text && (
                  <div className="text-[11px] italic text-gray-400 px-4">（{msg.text}）</div>
                )}
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${msg.speaker === 'me' ? 'flex-row-reverse' : ''}`}>
              <Avatar
                src={msg.speaker === 'member' ? data.memberImageUrl : data.userAvatar}
                memberName={msg.speaker === 'member' ? data.memberName : undefined}
                fallbackChar={msg.speaker === 'member' ? data.memberName.charAt(0) : '自'}
                color={msg.speaker === 'member' ? group.color : '#9ca3af'}
                size={30}
              />
              <div
                className={`max-w-[70%] px-3 py-2 text-[13px] leading-[1.6] whitespace-pre-wrap break-words ${
                  msg.speaker === 'me'
                    ? 'bg-gray-100 rounded-2xl rounded-br-sm text-gray-800'
                    : 'bg-white border border-gray-200 rounded-2xl rounded-bl-sm text-gray-800'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer watermark */}
      <div className="text-center pb-3 pt-1">
        <span className="text-[10px] text-gray-300 tracking-wider">Repo Generator</span>
      </div>
    </div>
  );
}

function getDayOfWeek(dateStr: string): string {
  try {
    const parts = dateStr.replace(/\//g, '-').split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  } catch { return ''; }
}
