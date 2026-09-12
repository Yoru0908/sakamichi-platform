export const NARRATION_COLORS = [
  { label: '浅橙', color: '#d97706' },
  { label: '浅粉', color: '#db2777' },
  { label: '浅蓝', color: '#2563eb' },
  { label: '灰色', color: '#64748b' },
] as const;

export function normalizeNarrationColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

export function readNarrationColor(messages: { narrationColor?: string }[]): string | undefined {
  return messages.map(message => normalizeNarrationColor(message.narrationColor)).find(Boolean);
}

// Store a uniform optional style in the existing messages JSON, including dialog
// rows so the selection survives a draft with no narration yet. No schema change.
export function withNarrationColor<T extends { narrationColor?: string }>(messages: T[], value?: string): T[] {
  const color = normalizeNarrationColor(value);
  return messages.map(message => {
    const { narrationColor: _old, ...rest } = message;
    return (color ? { ...rest, narrationColor: color } : rest) as T;
  });
}

export function narrationPalette(value: unknown): { color: string; backgroundColor: string } | undefined {
  const hex = normalizeNarrationColor(value);
  if (!hex) return undefined;
  const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
  const mix = (white: number) => '#' + rgb.map(channel => Math.round(channel * (1 - white) + 255 * white).toString(16).padStart(2, '0')).join('');
  // Darken text and tint background using opaque hex colors only. Avoid alpha,
  // filters or new CSS color functions in the SVG/Canvas export path.
  const text = '#' + rgb.map(channel => Math.round(channel * 0.45).toString(16).padStart(2, '0')).join('');
  return { color: text, backgroundColor: mix(0.92) };
}
