import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { getRepoMemberImageCandidates } from '@/utils/repo-member-images';

interface Props {
  memberName?: string;
  preferredSrc?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  fallback: ReactNode;
}

export default function RepoMemberImage({ memberName = '', preferredSrc, alt, className, style, fallback }: Props) {
  const candidates = useMemo(
    () => getRepoMemberImageCandidates(memberName, preferredSrc),
    [memberName, preferredSrc],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  useEffect(() => {
    setCandidateIndex(0);
    setLoadedSrc(null);
  }, [memberName, preferredSrc]);

  const src = candidates[candidateIndex];

  useEffect(() => {
    let cancelled = false;
    setLoadedSrc(null);

    if (!src) return () => {
      cancelled = true;
    };

    const img = new Image();
    img.onload = () => {
      if (!cancelled) setLoadedSrc(src);
    };
    img.onerror = () => {
      if (!cancelled) setCandidateIndex((current) => current + 1);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src) return <>{fallback}</>;

  if (!loadedSrc) return <>{fallback}</>;

  return (
    <img
      src={loadedSrc}
      alt={alt}
      className={className}
      style={{
        ...style,
        objectFit: 'cover',
        objectPosition: 'center top',
      }}
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
}
