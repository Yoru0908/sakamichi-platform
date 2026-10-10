// 巡礼ルート共有: URL (?route=) の符号化と、番号付きリストの PNG 生成。
// 依存なし。サイトごとの地点キー規則は呼び出し側が持つ（ここでは文字列として扱う）。
// 現在地・進捗は共有しない。地点キーと移動方法だけを運ぶ。

export type ShareMode = 'transit' | 'walking' | 'driving';
export type ShareStop = { name: string; address?: string; lat: number; lng: number; color?: string };
export type SharedRoute = { keys: string[]; mode: ShareMode };

export const ROUTE_PARAM = 'route';
export const MODE_LABEL: Record<ShareMode, string> = { transit: '電車', walking: '徒歩', driving: '車' };

const MAX_PARAM_LENGTH = 4096;
const MAX_KEY_LENGTH = 200;
const isMode = (v: unknown): v is ShareMode => v === 'transit' || v === 'walking' || v === 'driving';

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value: string): string => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bin = atob(padded);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeRoute(keys: string[], mode: ShareMode): string {
  return toBase64Url(JSON.stringify({ v: 1, m: mode, k: keys }));
}

/** 壊れた/過大/未知バージョンの入力は null。呼び出し側は何も変えない。 */
export function decodeRoute(param: string | null | undefined, maxStops = 12): SharedRoute | null {
  if (!param || param.length > MAX_PARAM_LENGTH) return null;
  try {
    const data = JSON.parse(fromBase64Url(param)) as { v?: unknown; m?: unknown; k?: unknown };
    if (data.v !== 1 || !isMode(data.m) || !Array.isArray(data.k)) return null;
    const keys = [...new Set(data.k.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= MAX_KEY_LENGTH))];
    return keys.length ? { keys: keys.slice(0, maxStops), mode: data.m } : null;
  } catch {
    return null;
  }
}

/** 現在のページ（= 地点キーが有効なデータセット）に対する共有 URL。他のクエリは持ち越さない。 */
export function buildShareUrl(origin: string, pathname: string, keys: string[], mode: ShareMode): string {
  return `${origin}${pathname}?${ROUTE_PARAM}=${encodeRoute(keys, mode)}`;
}

export const routeLetter = (index: number): string => (index < 26 ? String.fromCharCode(65 + index) : String(index + 1));

/**
 * 409 のとき、自分の編集（base → local の差分）を相手の最新（current）に載せ直す。
 * 追加と削除は個別に反映。並べ替えだけなら自分の順序を優先し、相手が足した地点は末尾に残す。
 */
export function rebaseKeys(base: string[], local: string[], current: string[], maxStops: number): string[] {
  const added = local.filter((k) => !base.includes(k));
  const removed = base.filter((k) => !local.includes(k));
  if (added.length === 0 && removed.length === 0) {
    const mine = local.filter((k) => current.includes(k));
    return [...mine, ...current.filter((k) => !mine.includes(k))].slice(0, maxStops);
  }
  const next = current.filter((k) => !removed.includes(k));
  return [...next, ...added.filter((k) => !next.includes(k))].slice(0, maxStops);
}

// ---- 画像 -------------------------------------------------------------------------------

const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","PingFang SC","Microsoft YaHei",sans-serif';
const WIDTH = 1080;
const PAD = 56;
const ROW_H = 104;

type Options = { title?: string; mode: ShareMode; stops: ShareStop[]; siteName: string; accent?: string };

const ellipsize = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
};

// 緯度経度 → 画面座標。底図は描かない（タイルは cross-origin で canvas を汚染し toBlob が失敗する）。
const projector = (stops: ShareStop[], x: number, y: number, w: number, h: number) => {
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const xs = stops.map((s) => s.lng), ys = stops.map((s) => merc(s.lat));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const MIN_SPAN = (0.004 * Math.PI) / 180; // 点が1つ/極端に近い時に拡大しすぎない
  const spanX = Math.max(((maxX - minX) * Math.PI) / 180, MIN_SPAN), spanY = Math.max(maxY - minY, MIN_SPAN);
  const inner = 64; // 点の半径ぶんの余白
  const scale = Math.min((w - inner * 2) / spanX, (h - inner * 2) / spanY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return (s: ShareStop): [number, number] => [
    x + w / 2 + (s.lng - cx) * (Math.PI / 180) * scale,
    y + h / 2 - (merc(s.lat) - cy) * scale,
  ];
};

// 近すぎる点を互いに押し離して文字を読めるようにする（略図なので位置は概算）。
const separate = (pts: [number, number][], minX: number, minY: number, maxX: number, maxY: number): [number, number][] => {
  const out = pts.map(([x, y]) => [x, y] as [number, number]);
  const gap = 62;
  for (let round = 0; round < 60; round += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const dx = out[j][0] - out[i][0] || 0.01 * (j - i), dy = out[j][1] - out[i][1];
        const d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        const push = (gap - d) / 2 / (d || 1);
        out[i][0] -= dx * push; out[i][1] -= dy * push;
        out[j][0] += dx * push; out[j][1] += dy * push;
        moved = true;
      }
    }
    out.forEach((p) => { p[0] = Math.min(maxX, Math.max(minX, p[0])); p[1] = Math.min(maxY, Math.max(minY, p[1])); });
    if (!moved) break;
  }
  return out;
};

export async function renderRouteImage({ title = '巡礼ルート', mode, stops, siteName, accent = '#e8789a' }: Options): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const mapH = 460;
  const headerH = 168;
  const height = PAD + headerH + mapH + 40 + stops.length * ROW_H + 40 + 72 + PAD / 2;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.scale(2, 2);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, WIDTH, 14);

  // 見出し
  ctx.fillStyle = '#1b1b1f';
  ctx.font = `700 56px ${FONT}`;
  ctx.fillText(ellipsize(ctx, title, WIDTH - PAD * 2), PAD, PAD + 70);
  ctx.fillStyle = '#6b6f76';
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(`${stops.length}地点 · ${MODE_LABEL[mode]}`, PAD, PAD + 122);

  // 略図
  const mapY = PAD + headerH, mapW = WIDTH - PAD * 2;
  ctx.fillStyle = '#f4f5f7';
  ctx.beginPath();
  ctx.roundRect(PAD, mapY, mapW, mapH, 28);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#e4e6ea';
  ctx.lineWidth = 2;
  for (let gx = PAD + 92; gx < PAD + mapW; gx += 92) { ctx.beginPath(); ctx.moveTo(gx, mapY); ctx.lineTo(gx, mapY + mapH); ctx.stroke(); }
  for (let gy = mapY + 92; gy < mapY + mapH; gy += 92) { ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(PAD + mapW, gy); ctx.stroke(); }
  const project = projector(stops, PAD, mapY, mapW, mapH);
  const pts = separate(stops.map(project), PAD + 34, mapY + 34, PAD + mapW - 34, mapY + mapH - 34);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.font = `800 26px ${FONT}`;
  pts.forEach(([px, py], i) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, 27, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = stops[i].color || accent;
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(routeLetter(i), px, py + 9);
  });
  ctx.restore();
  ctx.textAlign = 'left';

  // 番号付きリスト（A = 地点名）
  let y = mapY + mapH + 40;
  stops.forEach((stop, i) => {
    if (i) { ctx.strokeStyle = '#eceef1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(WIDTH - PAD, y); ctx.stroke(); }
    ctx.fillStyle = stop.color || accent;
    ctx.beginPath(); ctx.arc(PAD + 30, y + ROW_H / 2, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(routeLetter(i), PAD + 30, y + ROW_H / 2 + 11);
    ctx.textAlign = 'left';
    const textX = PAD + 84, textW = WIDTH - PAD - textX;
    ctx.fillStyle = '#1b1b1f';
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(ellipsize(ctx, stop.name, textW), textX, y + (stop.address ? 44 : 60));
    if (stop.address) {
      ctx.fillStyle = '#7b7f87';
      ctx.font = `400 26px ${FONT}`;
      ctx.fillText(ellipsize(ctx, stop.address, textW), textX, y + 82);
    }
    y += ROW_H;
  });

  // フッター
  ctx.fillStyle = '#9a9ea6';
  ctx.font = `600 26px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(siteName, WIDTH - PAD, height - PAD / 2 - 8);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

/** 共有シート → 失敗/非対応ならダウンロード。戻り値で実際に何が起きたかを返す。 */
export async function shareOrDownloadImage(blob: Blob, opts: { filename: string; title: string; text: string }): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], opts.filename, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title, text: opts.text });
      return 'shared';
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return 'downloaded';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
