// ミーグリ共有画像 (2026-10-26): the dashboard's current view (期間 · グループ · 種類) as one Japanese 1080×1350 card.
// The card text is always Japanese, whatever the UI language. It never carries future dates, venues or account info.
// Period, card data and post text are pure (tested); the canvas drawing below is thin.
import type { MiguriEntry, MiguriGroupId } from '@/utils/auth-api';
import { entryLotteryCounts, isMiguriLotteryResult, lotteryResultCounts, type aggregateMiguriDashboard } from './meguri-helpers.ts';
import { miguriTranslator } from '../../i18n/miguri.ts';

export type MiguriPeriod = 'all' | number;
type Dashboard = ReturnType<typeof aggregateMiguriDashboard>;
type CardEntry = Parameters<typeof isMiguriLotteryResult>[0];

const yearOf = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : null);

/** Years that have records, newest first. From the data, not the clock: a recap posted in January still finds last year. */
export function miguriYears(entries: Array<Pick<MiguriEntry, 'date'>>): number[] {
  return [...new Set(entries.map((entry) => yearOf(entry.date)).filter((year): year is number => year !== null))].sort((a, b) => b - a);
}

/** One year by the miguri date (JST calendar date). Entries without a date only count under 'all'. */
export function inMiguriPeriod<T extends Pick<MiguriEntry, 'date'>>(entries: T[], period: MiguriPeriod): T[] {
  return period === 'all' ? entries : entries.filter((entry) => yearOf(entry.date) === period);
}

export const GROUP_NAMES: Record<MiguriGroupId, string> = { nogizaka: '乃木坂46', sakurazaka: '櫻坂46', hinatazaka: '日向坂46' };
const ACCENTS: Record<MiguriGroupId | 'all', string> = { all: '#5146e5', nogizaka: '#742581', sakurazaka: '#d9468f', hinatazaka: '#0a9bd6' };

export type MiguriShareCard = {
  period: MiguriPeriod;
  title: [string, string];
  scope: string;
  range: string | null;
  accent: string;
  spendYen: number;
  applied: number;
  won: number;
  rate: number | null;
  wonDays: number;
  wonMembers: number;
  oshiType: string;
  top: { name: string; share: number } | null;
  ranking: Array<{ name: string; won: number }>;
  categories: Array<{ label: string; share: number }>;
};

/**
 * `entries` and `dashboard` are the dashboard's filtered view. 応募 / 当選 / ranking count the same results as its 中签率,
 * so the card's numbers are the ones on screen.
 */
export function buildMiguriShareCard({ entries, dashboard, period, group, category, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) }: {
  entries: CardEntry[];
  dashboard: Dashboard;
  period: MiguriPeriod;
  group: MiguriGroupId | 'all';
  category: string | null;
  today?: string;
}): MiguriShareCard {
  // The date range stops at today (JST): an upcoming date, with the group, says where the person will be.
  const dates = entries.map((entry) => entry.date).filter((date) => yearOf(date) !== null && date <= today).sort();
  const won = new Map<string, number>();
  for (const entry of entries.filter(isMiguriLotteryResult)) {
    const counts = lotteryResultCounts(entry);
    if (counts.won > 0) won.set(entry.member, (won.get(entry.member) ?? 0) + counts.won);
  }
  const groups = new Set(entries.map((entry) => entry.group).filter(Boolean));
  const only = group !== 'all' ? group : groups.size === 1 ? ([...groups][0] as MiguriGroupId) : null;
  const ja = miguriTranslator('ja'), spent = dashboard.totalPaidSpendYen > 0;
  return {
    period,
    title: period === 'all' ? ['これまでの', 'ミーグリ'] : [`${period}年`, 'ミーグリまとめ'],
    scope: [only ? GROUP_NAMES[only] : 'すべてのグループ', category].filter(Boolean).join(' · '),
    range: dates.length ? `${dates[0].replaceAll('-', '.')} – ${dates[dates.length - 1].replaceAll('-', '.')}` : null,
    accent: ACCENTS[only ?? 'all'],
    spendYen: Math.round(dashboard.totalPaidSpendYen),
    applied: dashboard.totalApplied,
    won: dashboard.totalWon,
    rate: dashboard.totalApplied > 0 ? dashboard.winRate : null,
    wonMembers: won.size,
    wonDays: new Set(entries.filter((entry) => yearOf(entry.date) !== null && entryLotteryCounts(entry).won > 0).map((entry) => entry.date)).size,
    // Without prices the shares fall back to ticket counts, and 推しタイプ (a spend concentration) would say DD.
    oshiType: spent ? ja(`oshi_${dashboard.oshiType}` as Parameters<typeof ja>[0]) : '—',
    top: spent && dashboard.topMember ? { name: dashboard.topMember.name, share: dashboard.topMember.share } : null,
    ranking: [...won.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ja'))
      .slice(0, 3)
      .map(([name, count]) => ({ name, won: count })),
    categories: dashboard.categoryBreakdown.filter((item) => item.percentage > 0).map((item) => ({ label: item.label.replace('ミーグリ', ''), share: item.percentage })),
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`;

/** The post that goes with the image. Japanese, like the card. */
export function miguriShareText(card: MiguriShareCard, showSpend: boolean): string {
  return [
    card.title.join(''),
    `応募 ${card.applied}枚 → 当選 ${card.won}枚${card.rate === null ? '' : `（当選率 ${pct(card.rate)}）`}`,
    showSpend && card.spendYen > 0 ? `支払総額 ${yen(card.spendYen)}` : null,
    showSpend && card.top ? `推しタイプ：${card.oshiType}（支出の ${pct(card.top.share)} が ${card.top.name}）` : null,
    '#ミーグリまとめ',
    'https://46log.com/miguri',
  ].filter(Boolean).join('\n');
}

// ---- 画像 -------------------------------------------------------------------------------

const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","Noto Sans CJK JP",sans-serif';
const W = 1080;
const H = 1350;
const PAD = 72;
const INK = '#111827';
const MUTED = '#6b7280';
const PANEL = '#f4f5fa';
const CATEGORY_COLORS = ['#5146e5', '#65a99c', '#5195ca', '#c64d82', '#a1a1aa'];

type Ctx = CanvasRenderingContext2D;

/** Largest size ≤ `size` (down to `min`) at which the text fits; ellipsized if even `min` overflows. */
function fit(ctx: Ctx, text: string, maxWidth: number, weight: number, size: number, min = size * 0.6) {
  for (let s = size; s >= min; s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) return text;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function draw(ctx: Ctx, text: string, x: number, y: number, { weight = 700, size = 32, color = INK, align = 'left' as CanvasTextAlign, max = W - PAD * 2 } = {}) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(fit(ctx, text, max, weight, size), x, y);
  ctx.textAlign = 'left';
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 32);
  ctx.fill();
}

export async function renderMiguriShareImage(card: MiguriShareCard, showSpend: boolean): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.lang = 'ja'; // Japanese glyph forms even when the page is zh-CN
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  if ('lang' in ctx) (ctx as Ctx & { lang: string }).lang = 'ja';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, card.accent);
  band.addColorStop(1, '#ec4899');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 16);

  draw(ctx, '46log MIGURI', PAD, 108, { size: 28, color: card.accent, weight: 800 });
  draw(ctx, card.period === 'all' ? 'ALL TIME' : String(card.period), W - PAD, 108, { size: 28, color: MUTED, weight: 800, align: 'right' });
  draw(ctx, card.title[0], PAD, 226, { size: 92, color: card.accent, weight: 900 });
  draw(ctx, card.title[1], PAD, 326, { size: 92, weight: 900 });
  draw(ctx, [card.range, card.scope].filter(Boolean).join(' · '), PAD, 382, { size: 30, color: MUTED, weight: 500 });

  // 当選 / 当選率
  const inner = W - PAD * 2;
  panel(ctx, PAD, 420, inner, 280);
  draw(ctx, '当選', PAD + 44, 484, { size: 30, color: MUTED });
  ctx.font = `900 150px ${FONT}`;
  const wonText = String(card.won);
  ctx.fillStyle = INK;
  ctx.fillText(wonText, PAD + 40, 630);
  draw(ctx, '枚', PAD + 48 + ctx.measureText(wonText).width, 630, { size: 48, weight: 800 });
  draw(ctx, '当選率', W - PAD - 44, 484, { size: 30, color: MUTED, align: 'right' });
  draw(ctx, card.rate === null ? '—' : pct(card.rate), W - PAD - 44, 604, { size: 104, weight: 900, color: card.accent, align: 'right', max: 360 });
  draw(ctx, `応募 ${card.applied}枚 · 当選した日 ${card.wonDays}日`, PAD + 44, 672, { size: 30, color: MUTED, weight: 600, max: inner - 88 });

  // 支払総額 (or 当選したメンバー) | 推しタイプ
  const half = (inner - 24) / 2, right = PAD + half + 24;
  panel(ctx, PAD, 724, half, 190);
  if (showSpend && card.spendYen > 0) {
    draw(ctx, '支払総額', PAD + 36, 784, { size: 28, color: MUTED });
    draw(ctx, yen(card.spendYen), PAD + 36, 862, { size: 64, weight: 900, max: half - 72 });
    draw(ctx, 'CD代の目安（46logの計算）', PAD + 36, 896, { size: 20, color: MUTED, weight: 500, max: half - 72 });
  } else {
    draw(ctx, '当選したメンバー', PAD + 36, 784, { size: 28, color: MUTED });
    draw(ctx, `${card.wonMembers}人`, PAD + 36, 870, { size: 64, weight: 900, max: half - 72 });
  }
  panel(ctx, right, 724, half, 190);
  draw(ctx, '推しタイプ', right + 36, 784, { size: 28, color: MUTED });
  draw(ctx, card.oshiType, right + 36, 862, { size: 64, weight: 900, color: card.accent, max: half - 72 });
  if (showSpend && card.top) draw(ctx, `支出の ${pct(card.top.share)} が ${card.top.name}`, right + 36, 896, { size: 22, color: MUTED, weight: 600, max: half - 72 });

  // 当選枚数ランキング
  draw(ctx, '当選枚数ランキング', PAD, 984, { size: 32, weight: 800 });
  const most = Math.max(1, ...card.ranking.map((row) => row.won));
  const barX = PAD + 360, barW = W - PAD - 150 - barX;
  card.ranking.forEach((row, index) => {
    const y = 1010 + index * 62;
    ctx.fillStyle = card.accent;
    ctx.beginPath();
    ctx.arc(PAD + 22, y + 22, 22, 0, Math.PI * 2);
    ctx.fill();
    draw(ctx, String(index + 1), PAD + 22, y + 32, { size: 26, color: '#ffffff', weight: 800, align: 'center' });
    draw(ctx, row.name, PAD + 64, y + 34, { size: 32, weight: 700, max: barX - PAD - 84 });
    ctx.fillStyle = '#eceef4';
    ctx.beginPath();
    ctx.roundRect(barX, y + 10, barW, 24, 12);
    ctx.fill();
    ctx.fillStyle = card.accent;
    ctx.beginPath();
    ctx.roundRect(barX, y + 10, Math.max(24, (row.won / most) * barW), 24, 12);
    ctx.fill();
    draw(ctx, `${row.won}枚`, W - PAD, y + 34, { size: 32, weight: 800, align: 'right', max: 140 });
  });
  if (!card.ranking.length) draw(ctx, '当選はまだありません', PAD, 1046, { size: 28, color: MUTED, weight: 500 });

  // 種類
  // Category shares are shares of spend: with the amount hidden they would let サイン会 be back-calculated.
  if (showSpend && card.categories.length > 1) {
    let x = PAD;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PAD, 1210, inner, 18, 9);
    ctx.clip();
    card.categories.forEach((item, index) => {
      ctx.fillStyle = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
      ctx.fillRect(x, 1210, item.share * inner + 1, 18);
      x += item.share * inner;
    });
    ctx.restore();
    draw(ctx, card.categories.map((item) => `${item.label} ${pct(item.share)}`).join(' · '), PAD, 1262, { size: 24, color: MUTED, weight: 600 });
  }

  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(PAD, 1282, inner, 2);
  draw(ctx, '46log.com/miguri', PAD, 1322, { size: 26, color: card.accent, weight: 800 });
  draw(ctx, 'forTUNE music・Meets の記録から集計', W - PAD, 1322, { size: 22, color: MUTED, weight: 500, align: 'right', max: 560 });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
