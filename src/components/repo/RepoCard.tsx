import { useState } from 'react';
import type { PublishedRepo, ReactionType } from '@/types/repo';
import { REACTION_TYPES, ATMOSPHERE_TAGS, GROUP_META } from '@/types/repo';

interface Props {
  repo: PublishedRepo;
}

function CardAvatar({ src, name, color }: { src: string; name: string; color: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: color }}>
        {name.charAt(0)}
      </div>
    );
  }
  return <img src={src} alt={name} className="w-10 h-10 rounded-full object-cover object-top bg-gray-100" onError={() => setFailed(true)} />;
}

export default function RepoCard({ repo }: Props) {
  const [reactions, setReactions] = useState(repo.reactions);
  const group = GROUP_META[repo.groupId];

  function handleReact(type: ReactionType) {
    setReactions(prev => ({ ...prev, [type]: prev[type] + 1 }));
    // TODO: POST /api/repos/:id/react
  }

  const previewMessages = repo.messages.slice(0, 3);
  const tags = ATMOSPHERE_TAGS.filter(t => repo.tags.includes(t.id));

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 pb-2">
        <CardAvatar src={repo.customMemberAvatar || repo.memberImageUrl} name={repo.memberName} color={group.color} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{repo.memberName}</div>
          <div className="text-[11px] text-gray-400">
            <span style={{ color: group.color }}>{repo.groupName}</span>
            <span className="mx-1">·</span>
            {repo.eventDate}
            <span className="mx-1">·</span>
            第{repo.slotNumber}部
          </div>
        </div>
      </div>

      {/* Chat preview */}
      <div className="px-3 pb-2 space-y-1.5">
        {previewMessages.map(msg => (
          <div key={msg.id} className={`flex ${msg.speaker === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-2.5 py-1.5 text-xs leading-relaxed truncate ${
                msg.speaker === 'me'
                  ? 'bg-gray-100 rounded-xl rounded-br-sm text-gray-700'
                  : 'rounded-xl rounded-bl-sm text-gray-700'
              }`}
              style={msg.speaker === 'member' ? { backgroundColor: group.bgColor } : undefined}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {repo.messages.length > 3 && (
          <div className="text-center text-[10px] text-gray-400">+{repo.messages.length - 3} more...</div>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {tags.map(tag => (
            <span key={tag.id} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-gray-50 text-[10px] text-gray-500">
              {tag.emoji} {tag.label}
            </span>
          ))}
        </div>
      )}

      {/* Reactions */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-gray-50">
        {REACTION_TYPES.map(rt => {
          const count = reactions[rt.id];
          return (
            <button
              key={rt.id}
              type="button"
              onClick={e => { e.stopPropagation(); handleReact(rt.id); }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors text-xs"
              title={rt.label}
            >
              <span>{rt.emoji}</span>
              {count > 0 && <span className="text-gray-400 text-[10px]">{count}</span>}
            </button>
          );
        })}
        <div className="flex-1" />
        {repo.userName && (
          <span className="text-[10px] text-gray-400 truncate max-w-[80px]">by {repo.userName}</span>
        )}
      </div>
    </div>
  );
}
