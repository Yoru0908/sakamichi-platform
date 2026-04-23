import { useState } from 'react';
import { REACTION_TYPES, ATMOSPHERE_TAGS, GROUP_META } from '@/types/repo';
import type { ReactionType } from '@/types/repo';
import { reactToRepo } from '@/utils/auth-api';
import type { RepoWorkItem, RepoReaction } from '@/utils/auth-api';
import { getR2AvatarUrl } from '@/components/messages/msg-styles';

interface Props {
  repo: RepoWorkItem;
  onReactionUpdate?: (workId: string, reactions: RepoReaction, myReactions: string[]) => void;
  onCardClick?: (repo: RepoWorkItem) => void;
}

function CardAvatar({ name, groupId }: { name: string; groupId: string }) {
  const [failed, setFailed] = useState(false);
  const group = (GROUP_META as Record<string, any>)[groupId];
  const color = group?.color || '#888';
  const src = getR2AvatarUrl(name);

  if (failed) {
    return (
      <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: color }}>
        {name.charAt(0)}
      </div>
    );
  }
  return <img src={src} alt={name} className="w-10 h-10 rounded-full object-cover object-top bg-gray-100" onError={() => setFailed(true)} />;
}

export default function RepoCard({ repo, onReactionUpdate, onCardClick }: Props) {
  const [reactions, setReactions] = useState<RepoReaction>(repo.reactions);
  const [myReactions, setMyReactions] = useState<string[]>(repo.myReactions || []);
  const [pending, setPending] = useState(false);

  const group = (GROUP_META as Record<string, any>)[repo.groupId];
  const groupColor: string = group?.color || '#888';
  const groupBgColor: string = group?.bgColor || '#f5f5f5';
  const groupName: string = group?.name || repo.groupId;

  async function handleReact(type: ReactionType) {
    if (pending) return;
    setPending(true);

    const alreadyReacted = myReactions.includes(type);
    const newCount = alreadyReacted
      ? Math.max(0, reactions[type] - 1)
      : reactions[type] + 1;
    const newReactions = { ...reactions, [type]: newCount };
    const newMyReactions = alreadyReacted
      ? myReactions.filter(r => r !== type)
      : [...myReactions, type];

    // Optimistic update
    setReactions(newReactions);
    setMyReactions(newMyReactions);
    onReactionUpdate?.(repo.id, newReactions, newMyReactions);

    try {
      const res = await reactToRepo(repo.id, type);
      if (res.success && res.data) {
        const confirmedReactions = { ...newReactions, [type]: res.data.count };
        const confirmedMyReactions = res.data.reacted
          ? [...(alreadyReacted ? myReactions.filter(r => r !== type) : myReactions), type]
          : myReactions.filter(r => r !== type);
        setReactions(confirmedReactions);
        setMyReactions(confirmedMyReactions);
        onReactionUpdate?.(repo.id, confirmedReactions, confirmedMyReactions);
      }
    } catch {
      // Rollback on error
      setReactions(reactions);
      setMyReactions(myReactions);
      onReactionUpdate?.(repo.id, reactions, myReactions);
    } finally {
      setPending(false);
    }
  }

  const previewMessages = repo.messages.slice(0, 3);
  const tags = ATMOSPHERE_TAGS.filter(t => repo.tags.includes(t.id));

  return (
    <div
      className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onCardClick?.(repo)}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3 pb-2">
        <CardAvatar name={repo.memberName} groupId={repo.groupId} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{repo.memberName}</div>
          <div className="text-[11px] text-gray-400">
            <span style={{ color: groupColor }}>{groupName}</span>
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
              style={msg.speaker === 'member' ? { backgroundColor: groupBgColor } : undefined}
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
          const active = myReactions.includes(rt.id);
          return (
            <button
              key={rt.id}
              type="button"
              onClick={e => { e.stopPropagation(); handleReact(rt.id); }}
              disabled={pending}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors text-xs ${
                active ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              }`}
              title={rt.label}
            >
              <span>{rt.emoji}</span>
              {count > 0 && <span className={`text-[10px] ${active ? 'text-gray-600' : 'text-gray-400'}`}>{count}</span>}
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
