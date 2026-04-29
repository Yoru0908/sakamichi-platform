import { useEffect, useState } from 'react';
import { ArrowLeft, Image, Loader2 } from 'lucide-react';
import { listUserWorks, type CommunityWork, type StampCounts, type StampType } from '@/utils/community-api';
import WorkCard from './WorkCard';
import WorkLightbox from './WorkLightbox';

interface Props {
  userId?: string;
}

export default function PhotocardUserWorksPage({ userId }: Props) {
  const [resolvedUserId, setResolvedUserId] = useState(userId || '');
  const [works, setWorks] = useState<CommunityWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<CommunityWork | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    if (userId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('userId') || '';
    if (id) setResolvedUserId(id);
  }, [userId]);

  useEffect(() => {
    if (!resolvedUserId) {
      setLoading(false);
      setError('缺少用户 ID');
      return;
    }
    let cancelled = false;
    setLoading(true);
    listUserWorks(resolvedUserId, 1, 60).then((data) => {
      if (cancelled) return;
      setWorks(data.works);
      setError(null);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : '加载失败');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [resolvedUserId]);

  const handleLikeUpdate = (id: string, liked: boolean, likeCount: number) => {
    const update = (list: CommunityWork[]) => list.map(w => w.id === id ? { ...w, liked, likeCount } : w);
    setWorks(update);
    if (selectedWork?.id === id) setSelectedWork(prev => prev ? { ...prev, liked, likeCount } : prev);
  };

  const handleBookmarkUpdate = (id: string, bookmarked: boolean) => {
    const update = (list: CommunityWork[]) => list.map(w => w.id === id ? { ...w, bookmarked } : w);
    setWorks(update);
    if (selectedWork?.id === id) setSelectedWork(prev => prev ? { ...prev, bookmarked } : prev);
  };

  const handleStampUpdate = (id: string, stamps: StampCounts, myStamps: StampType[]) => {
    const update = (list: CommunityWork[]) => list.map(w => w.id === id ? { ...w, stamps, myStamps } : w);
    setWorks(update);
    if (selectedWork?.id === id) setSelectedWork(prev => prev ? { ...prev, stamps, myStamps } : prev);
  };

  const handleDelete = (id: string) => {
    setWorks(prev => prev.filter(w => w.id !== id));
    setSelectedWork(prev => prev?.id === id ? null : prev);
  };

  const authorName = works[0]?.author.displayName || '这位创作者';
  const goPrev = selectedIndex > 0 ? () => {
    const prev = works[selectedIndex - 1];
    if (prev) {
      setSelectedWork(prev);
      setSelectedIndex(selectedIndex - 1);
    }
  } : undefined;
  const goNext = selectedIndex < works.length - 1 ? () => {
    const next = works[selectedIndex + 1];
    if (next) {
      setSelectedWork(next);
      setSelectedIndex(selectedIndex + 1);
    }
  } : undefined;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <a href="/photocard" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand-sakura)] hover:underline mb-4">
        <ArrowLeft size={14} /> 返回生写卡片社区
      </a>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{authorName} 的作品</h1>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">共 {works.length} 张生写卡片</p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[var(--text-tertiary)]">
          <Loader2 size={24} className="mx-auto mb-3 animate-spin" />
          作品加载中...
        </div>
      ) : error ? (
        <div className="py-16 text-center">
          <div className="text-sm font-medium text-[var(--text-primary)] mb-2">作者作品暂时无法加载</div>
          <div className="text-xs text-[var(--text-tertiary)]">{error}</div>
        </div>
      ) : works.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
            <Image size={24} className="opacity-40" />
          </div>
          <div className="text-sm font-medium text-[var(--text-primary)] mb-1">这位创作者还没有公开作品</div>
          <div className="text-xs text-[var(--text-tertiary)]">回社区看看其他作品吧</div>
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 md:columns-4 gap-3 space-y-3">
          {works.map((work, index) => (
            <WorkCard
              key={work.id}
              work={work}
              onClick={() => {
                setSelectedWork(work);
                setSelectedIndex(index);
              }}
            />
          ))}
        </div>
      )}

      {selectedWork && (
        <WorkLightbox
          work={selectedWork}
          onClose={() => { setSelectedWork(null); setSelectedIndex(-1); }}
          onLikeUpdate={handleLikeUpdate}
          onBookmarkUpdate={handleBookmarkUpdate}
          onStampUpdate={handleStampUpdate}
          onDelete={handleDelete}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </div>
  );
}
