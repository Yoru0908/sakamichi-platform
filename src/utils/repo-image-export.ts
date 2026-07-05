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

export async function exportRepoElementAsPng(root: HTMLElement, filename: string): Promise<void> {
  await waitForHtml2CanvasImages(root);
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
