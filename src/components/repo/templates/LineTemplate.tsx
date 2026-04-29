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

export default function LineTemplate({ data }: Props) {
  const group = GROUP_META[data.groupId];

  return (
    <div className="rounded-xl overflow-hidden shadow-sm border border-gray-100" style={{ width: 380 }}>
      {/* LINE-style header */}
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: '#06C755' }}>
        <Avatar
          src={data.memberImageUrl}
          memberName={data.memberName}
          fallbackChar={data.memberName.charAt(0)}
          color="#04a648"
          size={36}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{data.memberName}</div>
          <div className="text-[10px] opacity-80">
            {data.groupName} ・ {data.eventDate} 第{data.slotNumber}部
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="bg-[#8CABD9] px-4 py-5 space-y-2.5">
        {/* Date pill */}
        <div className="text-center">
          <span className="inline-block px-3 py-0.5 rounded-full bg-black/20 text-white text-[10px]">
            {data.eventDate}
          </span>
        </div>

        {/* Nickname */}
        {data.nickname && (
          <div className="text-center py-1">
            <div className="text-[10px] text-white/50 mb-0.5">♠ ニックネーム</div>
            <div className="text-base font-semibold" style={{ color: '#4ECDC4' }}>
              {data.nickname}<span className="text-white/40 font-normal text-sm">様</span>
            </div>
          </div>
        )}

        {data.messages.map(msg => {
          if (msg.speaker === 'narration') {
            return (
              <div key={msg.id} className="text-center space-y-1.5">
                {msg.imageUrl && <img src={msg.imageUrl} alt="" className="max-h-28 rounded-lg object-contain mx-auto" />}
                {msg.text && <div className="text-[11px] italic text-white/60 px-4">（{msg.text}）</div>}
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${msg.speaker === 'me' ? 'flex-row-reverse' : ''}`}>
              {msg.speaker === 'member' && (
                <div className="shrink-0 flex flex-col items-center gap-0.5">
                  <Avatar src={data.memberImageUrl} memberName={data.memberName} fallbackChar={data.memberName.charAt(0)} color={group.color} size={28} />
                  <span className="text-[9px] text-white/80 max-w-[32px] truncate">{data.memberName.slice(0, 3)}</span>
                </div>
              )}
              <div
                className={`max-w-[70%] px-3 py-2 text-[13px] leading-[1.6] whitespace-pre-wrap break-words shadow-sm ${
                  msg.speaker === 'me'
                    ? 'bg-[#A8E063] rounded-2xl rounded-br-sm text-gray-800'
                    : 'bg-white rounded-2xl rounded-bl-sm text-gray-800'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="bg-[#8CABD9] text-center pb-3">
        <span className="text-[10px] text-white/40 tracking-wider">Repo Generator</span>
      </div>
    </div>
  );
}
