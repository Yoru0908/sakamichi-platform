import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Download, Share2, Calendar, Ticket, Flag, Trash2 } from 'lucide-react';
import ReportDialog from '@/components/shared/ReportDialog';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import type { RepoWorkItem, RepoReaction } from '@/utils/auth-api';
import { deleteRepoWork, reactToRepo } from '@/utils/auth-api';
import type { RepoData, TemplateId, AtmosphereTag, GroupId } from '@/types/repo';
import { REACTION_TYPES, GROUP_META, ATMOSPHERE_TAGS } from '@/types/repo';
import MeguriTemplate from './templates/MeguriTemplate';
import LineTemplate from './templates/LineTemplate';
import OshiColorTemplate from './templates/OshiColorTemplate';
import RepoMemberImage from './RepoMemberImage';
import { getRepoCommunityPreferredMemberImageUrl } from './repo-community-avatar';

interface Props {
  repo: RepoWorkItem;
  onClose: () => void;
  onReactionUpdate?: (workId: string, reactions: RepoReaction, myReactions: string[]) => void;
  onDelete?: (workId: string) => void;
}

function buildRepoData(repo: RepoWorkItem): RepoData {
  const groupMeta = (GROUP_META as Record<string, any>)[repo.groupId];
  const memberImageUrl = getRepoCommunityPreferredMemberImageUrl({
    customMemberAvatar: repo.customMemberAvatar,
    memberId: repo.memberId,
    memberName: repo.memberName,
  });
  return {
    memberId: repo.memberId,
    memberName: repo.memberName,
    groupId: repo.groupId as GroupId,
    groupName: groupMeta?.name || repo.groupId,
    memberImageUrl,
    eventDate: repo.eventDate,
    eventType: repo.eventType,
    slotNumber: repo.slotNumber,
    ticketCount: repo.ticketCount,
    nickname: repo.nickname,
    messages: repo.messages.map((m, i) => ({ ...m, id: `m${i}` })),
    tags: repo.tags as AtmosphereTag[],
  };
}

function renderTemplate(template: string, data: RepoData) {
  switch (template as TemplateId) {
    case 'meguri':     return <MeguriTemplate data={data} />;
    case 'line':       return <LineTemplate data={data} />;
    case 'oshi-color': return <OshiColorTemplate data={data} />;
    default:           return <MeguriTemplate data={data} />;
  }
}

function MemberCircleAvatar({ memberName, memberImageUrl, color, size }: { memberName: string; memberImageUrl?: string; color: string; size: number }) {
  return (
    <RepoMemberImage
      memberName={memberName}
      preferredSrc={memberImageUrl}
      alt={memberName}
      className="rounded-full shrink-0 object-cover object-top"
      style={{ width: size, height: size, backgroundColor: '#f3f4f6' }}
      fallback={(
        <div
          className="rounded-full shrink-0 flex items-center justify-center text-white font-bold"
          style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.35 }}
        >
          {memberName.charAt(0)}
        </div>
      )}
    />
  );
}

export default function RepoDetailModal({ repo, onClose, onReactionUpdate, onDelete }: Props) {
  const auth = useStore($auth);
  const templateRef = useRef<HTMLDivElement>(null);

  const [reactions, setReactions] = useState<RepoReaction>(repo.reactions);
  const [myReactions, setMyReactions] = useState<string[]>(repo.myReactions || []);
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const repoData = buildRepoData(repo);
  const group = (GROUP_META as Record<string, any>)[repo.groupId];
  const groupColor: string = group?.color || '#888';
  const tags = ATMOSPHERE_TAGS.filter(t => repo.tags.includes(t.id));
  const isOwner = auth.isLoggedIn && auth.userId === repo.userId;
  const canDelete = isOwner || auth.role === 'admin';

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleReact = useCallback(async (type: 'lemon' | 'sweet' | 'funny' | 'pray') => {
    if (pending || !auth.isLoggedIn) return;
    setPending(true);
    const alreadyReacted = myReactions.includes(type);
    const newReactions = { ...reactions, [type]: alreadyReacted ? Math.max(0, reactions[type] - 1) : reactions[type] + 1 };
    const newMyReactions = alreadyReacted ? myReactions.filter(r => r !== type) : [...myReactions, type];

    setReactions(newReactions);
    setMyReactions(newMyReactions);
    onReactionUpdate?.(repo.id, newReactions, newMyReactions);

    try {
      const res = await reactToRepo(repo.id, type);
      if (res.success && res.data) {
        const confirmed = { ...newReactions, [type]: res.data.count };
        const confirmedMy = res.data.reacted
          ? [...(alreadyReacted ? myReactions.filter(r => r !== type) : myReactions), type]
          : myReactions.filter(r => r !== type);
        setReactions(confirmed);
        setMyReactions(confirmedMy);
        onReactionUpdate?.(repo.id, confirmed, confirmedMy);
      }
    } catch {
      setReactions(reactions);
      setMyReactions(myReactions);
      onReactionUpdate?.(repo.id, reactions, myReactions);
    } finally {
      setPending(false);
    }
  }, [auth.isLoggedIn, pending, reactions, myReactions, repo.id, onReactionUpdate]);

  const handleDownload = useCallback(async () => {
    if (!templateRef.current || downloading) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(templateRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `repo_${repo.memberName}_${repo.eventDate.replace(/\//g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      alert('画像の生成に失敗しました。');
    } finally {
      setDownloading(false);
    }
  }, [downloading, repo.memberName, repo.eventDate]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/repo?id=${repo.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('链接已复制！');
      setTimeout(() => setShareMsg(null), 2000);
    } catch {
      setShareMsg(url);
    }
  }, [repo.id]);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await deleteRepoWork(repo.id);
      if (res.success) {
        onDelete?.(repo.id);
        onClose();
      }
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [confirmDelete, deleting, onClose, onDelete, repo.id]);

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[var(--bg-primary)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] transition-colors"
          aria-label="閉じる"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <MemberCircleAvatar
            memberName={repo.memberName}
            memberImageUrl={repoData.memberImageUrl}
            color={groupColor}
            size={40}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[var(--text-primary)]">{repo.memberName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: groupColor }}>
                {group?.name || repo.groupId}
              </span>
              {tags.map(t => (
                <span key={t.id} className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                  {t.emoji} {t.label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1"><Calendar size={11} />{repo.eventDate} · {repo.eventType}</span>
              <span>第{repo.slotNumber}部</span>
              <span className="flex items-center gap-1"><Ticket size={11} />{repo.ticketCount}枚</span>
            </div>
          </div>
        </div>

        {/* Template render */}
        <div className="px-5 pb-4 flex justify-center">
          <div
            ref={templateRef}
            className="inline-block rounded-xl overflow-hidden shadow-sm"
            style={{ maxWidth: '100%' }}
          >
            {renderTemplate(repo.template, repoData)}
          </div>
        </div>

        {/* Full conversation */}
        <div className="px-5 pb-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mb-2">
            完整对话 · {repo.messages.length}通
          </div>
          <div
            className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 space-y-2 max-h-64 overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {repo.messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 ${msg.speaker === 'me' ? 'flex-row-reverse' : ''}`}
              >
                {msg.speaker !== 'narration' && (
                  msg.speaker === 'me' ? (
                    <div
                      className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
                      style={{ backgroundColor: '#9ca3af' }}
                    >
                      You
                    </div>
                  ) : (
                    <div className="mt-0.5">
                      <MemberCircleAvatar
                        memberName={repo.memberName}
                        memberImageUrl={repoData.memberImageUrl}
                        color={groupColor}
                        size={24}
                      />
                    </div>
                  )
                )}
                <div
                  className={`px-2.5 py-1.5 rounded-xl text-xs leading-relaxed max-w-[76%] ${
                    msg.speaker === 'narration'
                      ? 'text-center w-full text-[var(--text-tertiary)] text-[10px] italic'
                      : msg.speaker === 'me'
                        ? 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                        : 'text-[var(--text-primary)]'
                  }`}
                  style={msg.speaker === 'member' ? { backgroundColor: group?.bgColor || '#f5f5f5' } : undefined}
                >
                  {msg.imageUrl && <img src={msg.imageUrl} alt="" className="max-w-full rounded mb-1" />}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reaction bar */}
        <div className="px-5 pb-3 border-t border-[var(--border-primary)] pt-3">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-[var(--text-tertiary)] mr-1">共感</span>
            {REACTION_TYPES.map(rt => {
              const count = reactions[rt.id as keyof RepoReaction];
              const active = myReactions.includes(rt.id);
              return (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => handleReact(rt.id as 'lemon' | 'sweet' | 'funny' | 'pray')}
                  disabled={pending || !auth.isLoggedIn}
                  title={!auth.isLoggedIn ? 'ログインして共感しよう' : rt.label}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all border ${
                    active
                      ? 'bg-[var(--bg-secondary)] border-current font-semibold'
                      : 'bg-[var(--bg-primary)] border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-secondary)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  style={active ? { color: groupColor, borderColor: groupColor } : undefined}
                >
                  <span>{rt.emoji}</span>
                  <span className="font-medium">{rt.label}</span>
                  {count > 0 && <span className="ml-0.5 opacity-70">{count}</span>}
                </button>
              );
            })}
            {totalReactions > 0 && (
              <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                {totalReactions} 件の共感
              </span>
            )}
          </div>
          {!auth.isLoggedIn && (
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5">ログインすると共感できます</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] rounded-b-2xl">
          <div className="text-xs text-[var(--text-tertiary)]">
            {repo.userName && <span>by <strong>{repo.userName}</strong> · </span>}
            {new Date(repo.createdAt).toLocaleDateString('ja-JP')}
          </div>
          <div className="flex items-center gap-2">
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  confirmDelete
                    ? 'bg-red-500 text-white'
                    : 'border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                <Trash2 size={12} />
                {confirmDelete ? '确认删除' : deleting ? '删除中...' : '删除'}
              </button>
            )}
            {auth.isLoggedIn && (
              <button
                type="button"
                onClick={() => setShowReport(true)}
                className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="举报"
              >
                <Flag size={12} />
              </button>
            )}
            {shareMsg && (
              <span className="text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded-lg">{shareMsg}</span>
            )}
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <Share2 size={12} /> 分享
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[var(--text-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Download size={12} /> {downloading ? '生成中...' : '保存图片'}
            </button>
          </div>
        </div>
      </div>
      {showReport && (
        <ReportDialog
          targetType="repo_work"
          targetId={repo.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
