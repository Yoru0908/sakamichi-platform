/**
 * html2canvas onclone 回调 — 修复 oklch() 颜色解析不兼容
 *
 * Tailwind CSS v4 使用 oklch() 颜色空间，但 html2canvas 不支持解析该函数。
 * 浏览器的 getComputedStyle 和 canvas fillStyle 也不会把 oklch 转成 rgb，
 * 所以必须用纯 JS 实现 oklch → rgb 转换。
 *
 * 修复策略：
 * - 用纯 JS oklch→rgb 转换函数
 * - onclone 回调中替换 <style> 标签和所有内联 style 中的 oklch()
 * - html2canvas 克隆时会把 computed style 内联到每个元素，也需替换
 */

const OKLCH_RE = /oklch\([^)]*\)/gi;

function hasOklch(value: string): boolean {
  return /oklch\(/i.test(value);
}

/**
 * 纯 JS 实现 oklch → rgb 转换。
 * oklch(L C H) where L=lightness[0,1], C=chroma, H=hue[0,360]
 * 通过 OKLab 中间色彩空间转换到 sRGB。
 */
function oklchToRgb(oklchStr: string): string {
  // 解析 oklch(L C H / A) 或 oklch(L C H)
  const match = oklchStr.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/i);
  if (!match) return 'rgb(0,0,0)';

  const L = parseFloat(match[1]);
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]);
  const A = match[4] ? parseFloat(match[4]) : 1;

  // oklch → oklab
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // oklab → linear sRGB
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380041 * l + 2.6097574051 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // linear sRGB → sRGB (gamma correction)
  const gammaCorrect = (c: number) => {
    const sign = c < 0 ? -1 : 1;
    const abs = Math.abs(c);
    if (abs <= 0.0031308) return sign * 12.92 * abs;
    return sign * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
  };

  r = gammaCorrect(r);
  g = gammaCorrect(g);
  bl = gammaCorrect(bl);

  // 裁剪到 [0, 1] 再乘 255
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const r255 = Math.round(clamp(r) * 255);
  const g255 = Math.round(clamp(g) * 255);
  const b255 = Math.round(clamp(bl) * 255);

  if (A < 1) {
    return `rgba(${r255},${g255},${b255},${A})`;
  }
  return `rgb(${r255},${g255},${b255})`;
}

// 缓存转换结果
const oklchCache = new Map<string, string>();

function replaceOklch(text: string): string {
  return text.replace(OKLCH_RE, (match) => {
    const cached = oklchCache.get(match);
    if (cached) return cached;
    const rgb = oklchToRgb(match);
    oklchCache.set(match, rgb);
    return rgb;
  });
}

/**
 * 生成 html2canvas 的 onclone 回调，修复 oklch() 兼容性。
 */
export function createOklchPatchOnClone(root: HTMLElement): (clonedDoc: Document) => void {
  return (clonedDoc: Document) => {
    // 处理 <style> 标签
    clonedDoc.querySelectorAll('style').forEach((style) => {
      if (style.textContent && hasOklch(style.textContent)) {
        style.textContent = replaceOklch(style.textContent);
      }
    });

    // 处理所有元素的内联 style 属性
    // html2canvas 克隆时会把 computed style 内联到每个元素的 style 属性，
    // 其中可能包含大量 oklch() 值，必须全部替换
    clonedDoc.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      const style = el.getAttribute('style');
      if (style && hasOklch(style)) {
        el.setAttribute('style', replaceOklch(style));
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
