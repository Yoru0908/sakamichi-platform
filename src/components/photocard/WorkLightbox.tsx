/** Lightbox modal for viewing a community work */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, Download, Trash2, Bookmark, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import ReportDialog from '@/components/shared/ReportDialog';
import SharePanel from '@/components/shared/SharePanel';
import { useStore } from '@nanostores/react';
import { $auth } from '@/stores/auth';
import { toggleLike, deleteWork, toggleBookmark, toggleStamp, STAMP_DEFS } from '@/utils/community-api';
import type { CommunityWork, StampCounts, StampType } from '@/utils/community-api';
import { buildPhotocardAuthorPath, buildPhotocardWorkPath } from './photocard-community-links';

const groupColors: Record<string, string> = {
  '櫻坂46': 'var(--color-brand-sakura)',
  '日向坂46': 'var(--color-brand-hinata)',
  '乃木坂46': 'var(--color-brand-nogi)',
  '乃木坂46②': 'var(--color-brand-nogi)',
};

interface Props {
  work: CommunityWork;
  onClose: () => void;
  onLikeUpdate: (id: string, liked: boolean, likeCount: number) => void;
  onBookmarkUpdate: (id: string, bookmarked: boolean) => void;
  onStampUpdate: (id: string, stamps: StampCounts, myStamps: StampType[]) => void;
  onDelete: (id: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function WorkLightbox({ work, onClose, onLikeUpdate, onBookmarkUpdate, onStampUpdate, onDelete, onPrev, onNext }: Props) {
  const auth = useStore($auth);
  const [liking, setLiking] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [stamps, setStamps] = useState<StampCounts>(work.stamps ?? { totoi: 0, numa: 0, ose: 0, kami: 0, yusho: 0 });
  const [myStamps, setMyStamps] = useState<StampType[]>(work.myStamps ?? []);
  const [stampingType, setStampingType] = useState<StampType | null>(null);

  const handleStamp = async (type: StampType) => {
    if (!auth.isLoggedIn || stampingType) return;
    setStampingType(type);
    const alreadyStamped = myStamps.includes(type);
    const newStamps = { ...stamps, [type]: alreadyStamped ? Math.max(0, stamps[type] - 1) : stamps[type] + 1 };
    const newMyStamps = alreadyStamped ? myStamps.filter(s => s !== type) : [...myStamps, type];
    setStamps(newStamps);
    setMyStamps(newMyStamps);
    onStampUpdate(work.id, newStamps, newMyStamps);
    try {
      const res = await toggleStamp(work.id, type);
      const confirmed = { ...newStamps, [type]: res.count };
      const confirmedMy = res.stamped ? [...(alreadyStamped ? myStamps.filter(s => s !== type) : myStamps), type] : myStamps.filter(s => s !== type);
      setStamps(confirmed);
      setMyStamps(confirmedMy);
      onStampUpdate(work.id, confirmed, confirmedMy);
    } catch {
      setStamps(stamps);
      setMyStamps(myStamps);
      onStampUpdate(work.id, stamps, myStamps);
    } finally {
      setStampingType(null);
    }
  };

  const color = groupColors[work.groupStyle] || '#6b7280';
  const isOwner = auth.isLoggedIn && auth.userId === work.author.id;
  const isAdmin = auth.role === 'admin';
  const canDelete = isOwner || isAdmin;
  const authorPath = buildPhotocardAuthorPath(work.author.id);

  const handleLike = async () => {
    if (!auth.isLoggedIn || liking) return;
    setLiking(true);
    try {
      const result = await toggleLike(work.id);
      onLikeUpdate(work.id, result.liked, result.likeCount);
    } catch (e) {
      console.error('Like failed:', e);
    } finally {
      setLiking(false);
    }
  };

  const handleBookmark = async () => {
    if (!auth.isLoggedIn || bookmarking) return;
    setBookmarking(true);
    try {
      const result = await toggleBookmark(work.id);
      onBookmarkUpdate(work.id, result.bookmarked);
    } catch (e) {
      console.error('Bookmark failed:', e);
    } finally {
      setBookmarking(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteWork(work.id);
      onDelete(work.id);
      onClose();
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleDownload = async () => {
    if (!work.allowDownload && !isAdmin) return;
    setDownloading(true);
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
      // CORS fallback: open in new tab
      window.open(work.fullImageUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  const formattedDate = (() => {
    try {
      const d = new Date(work.createdAt);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return work.createdAt;
    }
  })();

  // Lock body scroll while open + keyboard nav
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onPrev, onNext]);

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      {/* Content — flex column so info panel always visible */}
      <div
        className="relative flex flex-col w-full rounded-2xl bg-[var(--bg-primary)] shadow-2xl overflow-hidden"
        style={{ maxWidth: 480, maxHeight: 'calc(100vh - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
          style={{ zIndex: 10 }}
        >
          <X size={18} />
        </button>

        {/* Prev/Next arrows */}
        {onPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            style={{ zIndex: 10 }}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {onNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            style={{ zIndex: 10 }}
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* Image — shrinks to give room for info panel */}
        <div className="relative flex-shrink overflow-hidden" style={{ minHeight: 0 }}>
          <img
            src={work.fullImageUrl}
            alt={`${work.memberName} - ${work.theme || ''}`}
            className="w-full h-auto block"
            style={{ maxHeight: '60vh', objectFit: 'contain', background: 'var(--bg-tertiary)' }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{ backgroundColor: color }}
          />
        </div>

        {/* Info — always visible at bottom */}
        <div className="flex-shrink-0 p-5">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {work.memberName}
              <span className="text-sm font-normal text-[var(--text-tertiary)] ml-2">
                {work.groupStyle}
              </span>
            </h3>
            {work.theme && (
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">{work.theme}</p>
            )}
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {authorPath ? (
                <a href={authorPath} onClick={(e) => e.stopPropagation()} className="hover:underline text-[var(--text-secondary)]">by {work.author.displayName}</a>
              ) : (
                <span>by {work.author.displayName}</span>
              )} · {formattedDate}
            </p>
          </div>

          {/* Stamp bar */}
          <div className="mt-4 pt-4 border-t border-[var(--border-primary)]">
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
                    style={{ width: 48, height: 48 }}
                  >
                    <svg viewBox="0 0 48 48" width="48" height="48" style={{ overflow: 'visible' }}>
                      <defs>
                        <filter id={`ink-${def.id}`}>
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
                        filter={`url(#ink-${def.id})`}
                      />
                      <text
                        x="24" y="26"
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize="20" fontWeight="700" fontFamily="serif"
                        fill={def.color}
                        opacity={active ? 1 : 0.5}
                        filter={`url(#ink-${def.id})`}
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
              {!auth.isLoggedIn && (
                <span className="text-[10px] text-[var(--text-tertiary)] ml-1">登录后可盖章</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-3 sm:flex sm:flex-wrap sm:items-center">
            <button
              onClick={handleLike}
              disabled={!auth.isLoggedIn || liking}
              className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                work.liked
                  ? 'border-red-200 bg-red-50 text-red-500 dark:border-red-800 dark:bg-red-900/20'
                  : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              } ${!auth.isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={!auth.isLoggedIn ? '登录后可点赞' : ''}
            >
              <Heart size={14} className={work.liked ? 'fill-red-500' : ''} />
              <span>{work.likeCount}</span>
            </button>

            {(work.allowDownload || isAdmin) && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Download size={14} />
                {downloading ? '...' : '下载原图'}
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
              title={!auth.isLoggedIn ? '登录后可收藏' : work.bookmarked ? '取消收藏' : '收藏'}
            >
              <Bookmark size={14} className={work.bookmarked ? 'fill-amber-500' : ''} />
              {work.bookmarked ? '已收藏' : '收藏'}
            </button>

            <SharePanel
              config={{
                url: `${typeof window !== 'undefined' ? window.location.origin : 'https://46log.com'}${buildPhotocardWorkPath(work.id)}`,
                title: `${work.memberName} (${work.groupStyle}) — 生写卡片`,
                imageUrl: work.fullImageUrl,
              }}
              className="w-full sm:w-auto"
              buttonClassName="w-full sm:w-auto justify-center whitespace-nowrap"
            />

            <div className="hidden sm:block sm:flex-1" />

            {auth.isLoggedIn && !canDelete && (
              <button
                onClick={() => setShowReport(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-1 px-2 py-2 text-xs rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors whitespace-nowrap"
                title="举报"
              >
                <Flag size={12} />
              </button>
            )}

            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors whitespace-nowrap ${
                  confirmDelete
                    ? 'bg-red-500 text-white'
                    : 'text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                <Trash2 size={14} />
                {confirmDelete ? '确认删除' : '删除'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return (
    <>
      {createPortal(modal, document.body)}
      {showReport && createPortal(
        <ReportDialog
          targetType="community_work"
          targetId={work.id}
          onClose={() => setShowReport(false)}
        />,
        document.body,
      )}
    </>
  );
}
