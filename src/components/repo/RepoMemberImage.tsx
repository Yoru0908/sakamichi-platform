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

  useEffect(() => {
    setCandidateIndex(0);
  }, [memberName, preferredSrc]);

  const src = candidates[candidateIndex];

  if (!src) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
}
