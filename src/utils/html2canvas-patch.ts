/**
 * html2canvas onclone 回调 — 修复 oklch() 颜色解析不兼容
 *
 * Tailwind CSS v4 使用 oklch() 颜色空间，但 html2canvas 不支持解析该函数。
 * 在克隆文档中，将 oklch() 替换为安全的 fallback 颜色，避免 "Attempting to
 * parse an unsupported color function" 错误。
 *
 * 修复策略：
 * - <style> 标签中的 oklch() → 替换为 fallback 颜色
 * - 内联 style 属性中的 oklch() → 替换为 fallback 颜色
 * - 使用近似中性色 #888 作为 fallback，不影响整体视觉效果
 */

const OKLCH_RE = /oklch\([^)]*\)/gi;
const OKLCH_FALLBACK = '#888888';

/**
 * 生成 html2canvas 的 onclone 回调，修复 oklch() 兼容性。
 */
export function createOklchPatchOnClone(): (clonedDoc: Document) => void {
  return (clonedDoc: Document) => {
    // 处理 <style> 标签
    clonedDoc.querySelectorAll('style').forEach((style) => {
      if (style.textContent) {
        style.textContent = style.textContent.replace(OKLCH_RE, OKLCH_FALLBACK);
      }
    });

    // 处理内联 style 属性
    clonedDoc.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style');
      if (style && OKLCH_RE.test(style)) {
        el.setAttribute('style', style.replace(OKLCH_RE, OKLCH_FALLBACK));
      }
    });

    // 处理 <link> 引用的外部样式表（内联化可能已被 html2canvas 处理，
    // 但如果有残留的 cross-origin 样式表，也需要处理）
    clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      // html2canvas 通常已将外部样式内联化，此处做兜底
      const sheet = (link as HTMLLinkElement).sheet;
      if (!sheet) return;
      try {
        for (let i = 0; i < sheet.cssRules.length; i++) {
          const rule = sheet.cssRules[i];
          if (rule instanceof CSSStyleRule) {
            const text = rule.cssText;
            if (OKLCH_RE.test(text)) {
              // 无法直接修改 CSSRule，跳过——主要靠 <style> 标签处理
            }
          }
        }
      } catch {
        // cross-origin stylesheet 无法访问 cssRules，忽略
      }
    });
  };
}

function extractCssUrls(value: string): string[] {
  const urls: string[] = [];
  const re = /url\((['"]?)(.*?)\1\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    if (match[2]) urls.push(match[2]);
  }
  return urls;
}

function waitForImage(src: string): Promise<void> {
  if (!src || src.startsWith('blob:')) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
    if (img.complete) resolve();
  });
}

/**
 * html2canvas can snapshot before React-rendered images or CSS background images
 * have finished loading. Wait for both image types so official member photos from
 * member-images.json and uploaded data URLs are present in the exported PNG.
 */
export async function waitForHtml2CanvasImages(root: HTMLElement): Promise<void> {
  const imagePromises = Array.from(root.querySelectorAll('img')).map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (typeof img.decode === 'function') {
      return img.decode().catch(() => undefined);
    }
    return new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  });

  const backgroundUrls = new Set<string>();
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const bg = window.getComputedStyle(el).backgroundImage;
    for (const url of extractCssUrls(bg)) backgroundUrls.add(url);
  });

  await Promise.all([
    ...imagePromises,
    ...Array.from(backgroundUrls).map(waitForImage),
    document.fonts?.ready ?? Promise.resolve(),
  ]);
}
