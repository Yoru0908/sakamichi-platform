import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { ArrowLeft, Bookmark, Download, Flag, Heart, Loader2, Trash2 } from 'lucide-react';
import { $auth } from '@/stores/auth';
import ReportDialog from '@/components/shared/ReportDialog';
import SharePanel from '@/components/shared/SharePanel';
import { buildPhotocardAuthorPath, buildPhotocardWorkPath } from './photocard-community-links';
import { deleteWork, getWork, toggleBookmark, toggleLike, toggleStamp, STAMP_DEFS, type CommunityWorkDetail, type StampCounts, type StampType } from '@/utils/community-api';

const groupColors: Record<string, string> = {
  '櫻坂46': 'var(--color-brand-sakura)',
  '日向坂46': 'var(--color-brand-hinata)',
  '乃木坂46': 'var(--color-brand-nogi)',
  '乃木坂46②': 'var(--color-brand-nogi)',
};

interface Props {
  workId?: string;
}

export default function PhotocardWorkDetailPage({ workId }: Props) {
  const auth = useStore($auth);
  const [resolvedWorkId, setResolvedWorkId] = useState(workId || '');
  const [work, setWork] = useState<CommunityWorkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liking, setLiking] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [stamps, setStamps] = useState<StampCounts>({ totoi: 0, numa: 0, ose: 0, kami: 0, yusho: 0 });
  const [myStamps, setMyStamps] = useState<StampType[]>([]);
  const [stampingType, setStampingType] = useState<StampType | null>(null);

  useEffect(() => {
    if (workId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';
    if (id) setResolvedWorkId(id);
  }, [workId]);

  useEffect(() => {
    if (!resolvedWorkId) {
      setLoading(false);
      setError('缺少作品 ID');
      return;
    }
    let cancelled = false;
    setLoading(true);
    getWork(resolvedWorkId).then((data) => {
      if (cancelled) return;
      setWork(data);
      setStamps(data.stamps);
      setMyStamps(data.myStamps || []);
      setError(null);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : '加载失败');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [resolvedWorkId]);

  const color = work ? groupColors[work.groupStyle] || '#6b7280' : '#6b7280';
  const isOwner = auth.isLoggedIn && auth.userId === work?.author.id;
  const isAdmin = auth.role === 'admin';
  const canDelete = !!work && (isOwner || isAdmin);
  const authorPath = useMemo(() => buildPhotocardAuthorPath(work?.author.id ?? null), [work?.author.id]);
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${buildPhotocardWorkPath(resolvedWorkId)}`
    : `https://46log.com${buildPhotocardWorkPath(resolvedWorkId)}`;

  const handleLike = async () => {
    if (!work || !auth.isLoggedIn || liking) return;
    setLiking(true);
    try {
      const result = await toggleLike(work.id);
      setWork(prev => prev ? { ...prev, liked: result.liked, likeCount: result.likeCount } : prev);
    } finally {
      setLiking(false);
    }
  };

  const handleBookmark = async () => {
    if (!work || !auth.isLoggedIn || bookmarking) return;
    setBookmarking(true);
    try {
      const result = await toggleBookmark(work.id);
      setWork(prev => prev ? { ...prev, bookmarked: result.bookmarked } : prev);
    } finally {
      setBookmarking(false);
    }
  };

  const handleStamp = async (type: StampType) => {
    if (!work || !auth.isLoggedIn || stampingType) return;
    setStampingType(type);
    const alreadyStamped = myStamps.includes(type);
    const newStamps = { ...stamps, [type]: alreadyStamped ? Math.max(0, stamps[type] - 1) : stamps[type] + 1 };
    const newMyStamps = alreadyStamped ? myStamps.filter(s => s !== type) : [...myStamps, type];
    setStamps(newStamps);
    setMyStamps(newMyStamps);
    try {
      const result = await toggleStamp(work.id, type);
      const confirmed = { ...newStamps, [type]: result.count };
      const confirmedMy = result.stamped ? [...(alreadyStamped ? myStamps.filter(s => s !== type) : myStamps), type] : myStamps.filter(s => s !== type);
      setStamps(confirmed);
      setMyStamps(confirmedMy);
    } catch {
      setStamps(stamps);
      setMyStamps(myStamps);
    } finally {
      setStampingType(null);
    }
  };

  const handleDelete = async () => {
    if (!work || deleting) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteWork(work.id);
      window.location.href = '/photocard';
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleDownload = async () => {
    if (!work || (!work.allowDownload && !isAdmin)) return;
    const filename = `${work.memberName}_${work.groupStyle}_${work.id}.png`;
    try {
      const resp = await fetch(work.fullImageUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(work.fullImageUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center text-[var(--text-tertiary)]">
        <Loader2 size={24} className="mx-auto mb-3 animate-spin" />
        作品加载中...
      </div>
    );
  }

  if (!work || error) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="text-lg font-semibold text-[var(--text-primary)] mb-2">作品不存在或暂时无法打开</div>
        <div className="text-sm text-[var(--text-tertiary)] mb-6">{error || '请返回社区重新选择作品'}</div>
        <a href="/photocard" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-brand-sakura)' }}>
          <ArrowLeft size={14} /> 返回社区
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <a href="/photocard" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand-sakura)] hover:underline mb-4">
        <ArrowLeft size={14} /> 返回生写卡片社区
      </a>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden shadow-sm">
          <img src={work.fullImageUrl} alt={`${work.memberName} - ${work.theme || ''}`} className="w-full h-auto block" style={{ background: 'var(--bg-tertiary)' }} />
          <div className="h-1" style={{ backgroundColor: color }} />
        </div>
        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 shadow-sm space-y-5 lg:sticky lg:top-20">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{work.memberName}</h1>
            <div className="text-sm text-[var(--text-tertiary)] mt-1">{work.groupStyle}</div>
            {work.theme && <p className="text-sm text-[var(--text-secondary)] mt-3">{work.theme}</p>}
            <div className="text-xs text-[var(--text-tertiary)] mt-3">
              {authorPath ? (
                <a href={authorPath} className="hover:underline text-[var(--text-secondary)]">by {work.author.displayName}</a>
              ) : (
                <span>by {work.author.displayName}</span>
              )}
              <span> · {new Date(work.createdAt).toLocaleDateString('ja-JP')}</span>
              <span> · {work.viewCount} 次浏览</span>
            </div>
          </div>

          <div className="border-t border-[var(--border-primary)] pt-4">
            <div className="text-[10px] text-[var(--text-tertiary)] mb-2 font-medium tracking-widest uppercase">共感スタンプ</div>
            <div className="flex items-center gap-2 flex-wrap">
              {STAMP_DEFS.map(def => {
                const count = stamps[def.id];
                const active = myStamps.includes(def.id);
                const isStamping = stampingType === def.id;
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => handleStamp(def.id)}
                    disabled={!auth.isLoggedIn || !!stampingType}
                    title={!auth.isLoggedIn ? 'ログインして共感しよう' : def.phrase}
                    className={`relative flex flex-col items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                      active ? 'scale-110' : 'hover:scale-105'
                    }`}
                    style={{ width: 52, height: 52 }}
                  >
                    <svg viewBox="0 0 48 48" width="52" height="52" style={{ overflow: 'visible' }}>
                      <defs>
                        <filter id={`detail-ink-${def.id}`}>
                          <feTurbulence type="fractalNoise" baseFrequency="0.065" numOctaves="3" seed="2" />
                          <feDisplacementMap in="SourceGraphic" scale={active ? '1.5' : '0.8'} xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                      </defs>
                      <rect
                        x="3" y="3" width="42" height="42" rx="4"
                        fill={active ? def.color : 'transparent'}
                        stroke={def.color}
                        strokeWidth={active ? '2.5' : '1.5'}
                        opacity={active ? 0.15 : 0.4}
                        filter={`url(#detail-ink-${def.id})`}
                      />
                      <text
                        x="24" y="26"
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize="20" fontWeight="700" fontFamily="serif"
                        fill={def.color}
                        opacity={active ? 1 : 0.5}
                        filter={`url(#detail-ink-${def.id})`}
                        style={{ letterSpacing: 0, transform: `rotate(${active ? -3 : 0}deg)`, transformOrigin: '24px 24px', transition: 'transform 0.2s' }}
                      >
                        {def.kanji}
                      </text>
                      {isStamping && (
                        <circle cx="24" cy="24" r="20" fill="none" stroke={def.color} strokeWidth="2" opacity="0.6">
                          <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="0.6s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </svg>
                    {count > 0 && (
                      <span
                        className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                        style={{ backgroundColor: def.color }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {!auth.isLoggedIn && <div className="text-[10px] text-[var(--text-tertiary)] mt-2">登录后可盖章</div>}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              onClick={handleLike}
              disabled={!auth.isLoggedIn || liking}
              className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                work.liked
                  ? 'border-red-200 bg-red-50 text-red-500 dark:border-red-800 dark:bg-red-900/20'
                  : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              } ${!auth.isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Heart size={14} className={work.liked ? 'fill-red-500' : ''} />
              <span>{work.likeCount}</span>
            </button>
            {(work.allowDownload || isAdmin) && (
              <button onClick={handleDownload} className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors whitespace-nowrap">
                <Download size={14} /> 下载原图
              </button>
            )}
            <button
              onClick={handleBookmark}
              disabled={!auth.isLoggedIn || bookmarking}
              className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                work.bookmarked
                  ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-900/20'
                  : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              } ${!auth.isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Bookmark size={14} className={work.bookmarked ? 'fill-amber-500' : ''} />
              {work.bookmarked ? '已收藏' : '收藏'}
            </button>
            <SharePanel
              config={{
                url: shareUrl,
                title: `${work.memberName} (${work.groupStyle}) — 生写卡片`,
                imageUrl: work.fullImageUrl,
              }}
              className="w-full sm:w-auto"
              buttonClassName="w-full sm:w-auto justify-center whitespace-nowrap"
            />
          </div>

          <div className="flex items-center justify-end gap-2 flex-wrap">
            {auth.isLoggedIn && !canDelete && (
              <button onClick={() => setShowReport(true)} className="flex items-center gap-1 px-2 py-2 text-xs rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Flag size={12} /> 举报
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                  confirmDelete
                    ? 'bg-red-500 text-white'
                    : 'text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                <Trash2 size={14} />
                {confirmDelete ? '确认删除' : deleting ? '删除中...' : '删除'}
              </button>
            )}
          </div>
        </div>
      </div>
      {showReport && (
        <ReportDialog
          targetType="community_work"
          targetId={work.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
