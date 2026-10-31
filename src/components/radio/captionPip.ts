// Floating caption window.
// - Desktop Chrome/Edge/Firefox: Document Picture-in-Picture, the caption panel itself is rendered
//   into an always-on-top window (see openDocumentPip).
// - Elsewhere (Android Chrome, Safari): captions are drawn on a canvas that plays as a muted video,
//   and that video goes into classic video Picture-in-Picture (CanvasPip).

export interface PipLine { seq: number; ja: string; zh: string }
export type PipKind = 'document' | 'video' | null;

const W = 960;   // 2.29:1, inside Android's PiP aspect-ratio limit (2.39:1)
const H = 420;
const PAD = 36;
const FONT = '"PingFang SC","Hiragino Sans","Noto Sans CJK SC","Noto Sans JP","Microsoft YaHei",sans-serif';

declare global {
  interface Window {
    documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<Window> };
  }
}

export function pipKind(): PipKind {
  if (typeof window === 'undefined') return null;
  if (window.documentPictureInPicture) return 'document';
  const canCapture = typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  return document.pictureInPictureEnabled && canCapture ? 'video' : null;
}

/** Opens an always-on-top window carrying this page's styles and theme. */
export async function openDocumentPip(width = 520, height = 220): Promise<Window> {
  const win = await window.documentPictureInPicture!.requestWindow({ width, height });
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
    win.document.head.appendChild(node.cloneNode(true));
  });
  const root = win.document.documentElement;
  root.className = document.documentElement.className;
  for (const attr of Array.from(document.documentElement.attributes)) {
    if (attr.name.startsWith('data-')) root.setAttribute(attr.name, attr.value);
  }
  win.document.title = 'AI字幕 · 46log';
  Object.assign(win.document.body.style, { margin: '0', background: 'var(--bg-primary)' });
  return win;
}

/** Splits text into rows no wider than maxWidth (character-based: Japanese/Chinese have no spaces). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxRows: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const ch of text) {
    if (row && ctx.measureText(row + ch).width > maxWidth) {
      rows.push(row);
      row = '';
    }
    row += ch;
  }
  if (row) rows.push(row);
  if (rows.length > maxRows) rows.splice(0, rows.length - maxRows, '…' + rows[rows.length - maxRows].slice(1));
  return rows;
}

export class CanvasPip {
  private canvas = document.createElement('canvas');
  private video = document.createElement('video');
  private ctx = this.canvas.getContext('2d')!;

  constructor(onClose: () => void) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.video.muted = true;
    this.video.playsInline = true;
    // Kept in the DOM (Safari wants that) but out of sight.
    Object.assign(this.video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', bottom: '0', left: '0' });
    this.draw([], true, false, '');
    this.video.srcObject = this.canvas.captureStream(4);
    this.video.addEventListener('leavepictureinpicture', onClose);
    document.body.appendChild(this.video);
    this.video.play().catch(() => { /* starts on the user's click instead */ });
  }

  get active(): boolean {
    return document.pictureInPictureElement === this.video;
  }

  async open(): Promise<void> {
    if (this.video.paused) await this.video.play();
    await this.video.requestPictureInPicture();
  }

  /** Leaves PiP but keeps the video ready, so the next tap can open it again. */
  close(): void {
    if (this.active) document.exitPictureInPicture().catch(() => {});
  }

  destroy(): void {
    if (this.active) document.exitPictureInPicture().catch(() => {});
    (this.video.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop());
    this.video.remove();
  }

  /** Newest line at the bottom, the previous one above it dimmed — same as the inline panel. */
  draw(lines: PipLine[], showJa: boolean, stale: boolean, waiting: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#16161a';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = '#F19DB5';
    ctx.fillText('AI字幕', PAD, 22);
    if (!lines.length) {
      ctx.font = `28px ${FONT}`;
      ctx.fillStyle = '#9a9aa3';
      ctx.fillText(waiting, PAD, H - PAD - 34);
      return;
    }
    let bottom = H - PAD;
    [...lines].reverse().forEach((line, i) => {
      ctx.font = `bold 46px ${FONT}`;
      const zh = wrap(ctx, line.zh || line.ja, W - 2 * PAD, 2);
      ctx.font = `28px ${FONT}`;
      const ja = showJa && line.zh ? wrap(ctx, line.ja, W - 2 * PAD, 2) : [];
      const height = zh.length * 58 + (ja.length ? 6 + ja.length * 38 : 0);
      if (i > 0 && bottom - height < 64) return;  // no room for the previous line
      let y = bottom - height;
      ctx.globalAlpha = i > 0 || stale ? 0.45 : 1;
      ctx.font = `bold 46px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      zh.forEach(row => { ctx.fillText(row, PAD, y); y += 58; });
      ctx.font = `28px ${FONT}`;
      ctx.fillStyle = '#b4b4bd';
      y += 6;
      ja.forEach(row => { ctx.fillText(row, PAD, y); y += 38; });
      ctx.globalAlpha = 1;
      bottom -= height + 26;
    });
  }
}
