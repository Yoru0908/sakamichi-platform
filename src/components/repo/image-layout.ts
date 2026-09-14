import type { Message } from '@/types/repo';
import { proxyImageUrl } from '../../utils/proxy-image';

const isPhoto = (message: Message) => message.speaker === 'narration' && !!message.imageUrl;

/** Pair only adjacent image rows, at most two. Never swallow intervening text. */
export function groupImageMessages(messages: Message[]): Message[][] {
  const rows: Message[][] = [];
  for (const message of messages) {
    const previous = rows.at(-1);
    if (message.imagePairWithPrevious === true && isPhoto(message) && previous?.length === 1 && isPhoto(previous[0])) {
      previous.push(message);
    } else rows.push([message]);
  }
  return rows;
}

export function canPairImage(messages: Message[], index: number): boolean {
  const previous = groupImageMessages(messages.slice(0, index)).at(-1);
  return !!messages[index] && isPhoto(messages[index]) && previous?.length === 1 && isPhoto(previous[0]);
}

/** Bake orientation into the stored pixels, so old clients/exports also see it.
 * PNG avoids cumulative JPEG damage. Bound decoded allocation and saved payload.
 */
export async function rotateRepoImage(source: string, direction: -1 | 1): Promise<string> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = proxyImageUrl(source) ?? source;
  await image.decode();
  if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 16_000_000) {
    throw new Error('图片过大，请先缩小到 1600 万像素以内');
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalHeight;
  canvas.height = image.naturalWidth;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理图片');
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(direction * Math.PI / 2);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const result = canvas.toDataURL('image/png');
    if (result.length > 12_000_000) throw new Error('旋转后的图片过大，请先压缩图片再试');
    return result;
  } finally { canvas.width = canvas.height = 0; }
}
