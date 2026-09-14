import { domToPng } from 'modern-screenshot';
import { waitForHtml2CanvasImages } from '@/utils/html2canvas-patch';

const EXPORT_PIXEL_RATIO = 3;

function safeFilePart(value: string) {
  return (value || 'repo')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'repo';
}

function markExportRoot(root: HTMLElement) {
  root.setAttribute('data-repo-exporting', 'true');
  return () => root.removeAttribute('data-repo-exporting');
}

/**
 * 将元素内所有 <img> 的 src 替换为 data URL。
 */
async function inlineImages(root: HTMLElement): Promise<void> {
  const imgs = root.querySelectorAll('img');
  await Promise.all(Array.from(imgs).map(async (img) => {
    const src = img.src;
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      img.setAttribute('src', dataUrl);
    } catch {
      // fetch 失败则跳过
    }
  }));
}

/** Keep fractional CSS borders from snapping to 1px in the SVG image renderer.
 * At desktop display scaling (e.g. 150%), a 1px border can measure 0.666667px.
 * The clone retains the original width/height, but rasterizing a real border
 * steals text width and causes an extra line. Paint solid borders as inset
 * shadows and reserve their original space with padding, only in the clone.
 */
function preserveBorderLayout(node: Node): void {
  if (!(node instanceof HTMLElement)) return;
  const style = node.style;
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const borders = sides.map(side => ({
    side,
    width: parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0,
    color: style.getPropertyValue(`border-${side}-color`),
    type: style.getPropertyValue(`border-${side}-style`),
  }));
  if (!borders.some(b => b.width > 0 && !Number.isInteger(b.width)) || borders.some(b => b.width > 0 && b.type !== 'solid')) return;

  const first = borders[0];
  const uniform = borders.every(b => b.width === first.width && b.color === first.color);
  const shadows = uniform ? [`inset 0 0 0 ${first.width}px ${first.color}`] : borders.filter(b => b.width > 0).map(b => {
    const x = b.side === 'left' ? b.width : b.side === 'right' ? -b.width : 0;
    const y = b.side === 'top' ? b.width : b.side === 'bottom' ? -b.width : 0;
    return `inset ${x}px ${y}px 0 ${b.color}`;
  });
  if (style.boxShadow && style.boxShadow !== 'none') shadows.push(style.boxShadow);
  for (const { side, width } of borders) {
    if (!width) continue;
    const padding = parseFloat(style.getPropertyValue(`padding-${side}`)) || 0;
    style.setProperty(`border-${side}-width`, '0px');
    style.setProperty(`padding-${side}`, `${padding + width}px`);
  }
  style.boxShadow = shadows.join(', ');
}

export async function exportRepoElementAsPng(root: HTMLElement, filename: string): Promise<void> {
  await root.ownerDocument.fonts.ready;
  await waitForHtml2CanvasImages(root);
  // Let image onLoad-driven landscape sizing commit before measuring the clone.
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const unmark = markExportRoot(root);

  try {
    // 先把图片转成 data URL
    await inlineImages(root);

    // modern-screenshot 是 html-to-image 的改进版
    // 修复了 Safari/WebKit 的 SVG foreignObject 图片解码问题
    const dataUrl = await domToPng(root, {
      scale: EXPORT_PIXEL_RATIO,
      backgroundColor: '#ffffff',
      fixSvgXmlDecode: true,
      onCloneEachNode: preserveBorderLayout,
    });

    // 下载：iOS 不支持 <a download>，用 Blob + URL.createObjectURL
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      const blob = await (await fetch(dataUrl)).blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      const link = document.createElement('a');
      link.download = safeFilePart(filename);
      link.href = dataUrl;
      link.click();
    }
  } finally {
    unmark();
  }
}
