import type { CSSProperties } from 'react';
import { narrationPalette } from './narration-color';

export default function NarrationText({ text, color, className, style }: {
  text: string;
  color?: string;
  className: string;
  style?: CSSProperties;
}) {
  const palette = narrationPalette(color);
  if (!palette) return <div className={className} style={style}>（{text}）</div>;
  return (
    <div data-repo-narration className="text-[11px] px-4 py-1 rounded-lg" style={{
      ...palette,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      lineHeight: 1.6,
      maxWidth: '100%',
    }}>（{text}）</div>
  );
}
