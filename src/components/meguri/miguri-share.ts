// ミーグリ共有画像 (2026-10-26): the dashboard's current view (期間 · グループ · 種類) as one Japanese 1080×1350 card.
// The card text is always Japanese, whatever the UI language. It never carries future dates, venues or account info.
// Period, card data and post text are pure (tested); the canvas drawing below is thin.
import type { MiguriEntry, MiguriGroupId } from '@/utils/auth-api';
import { entryLotteryCounts, isMiguriLotteryResult, lotteryResultCounts, type aggregateMiguriDashboard } from './meguri-helpers.ts';
import { miguriTranslator } from '../../i18n/miguri.ts';

export type MiguriPeriod = 'all' | number;
type Dashboard = ReturnType<typeof aggregateMiguriDashboard>;
export type CardEntry = Parameters<typeof isMiguriLotteryResult>[0];

export const yearOf = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : null);

/** Years that have records, newest first. From the data, not the clock: a recap posted in January still finds last year. */
export function miguriYears(entries: Array<Pick<MiguriEntry, 'date'>>): number[] {
  return [...new Set(entries.map((entry) => yearOf(entry.date)).filter((year): year is number => year !== null))].sort((a, b) => b - a);
}

/** One year by the miguri date (JST calendar date). Entries without a date only count under 'all'. */
export function inMiguriPeriod<T extends Pick<MiguriEntry, 'date'>>(entries: T[], period: MiguriPeriod): T[] {
  return period === 'all' ? entries : entries.filter((entry) => yearOf(entry.date) === period);
}

export const GROUP_NAMES: Record<MiguriGroupId, string> = { nogizaka: '乃木坂46', sakurazaka: '櫻坂46', hinatazaka: '日向坂46' };

export type MiguriShareCard = {
  period: MiguriPeriod;
  title: [string, string];
  scope: string;
  range: string | null;
  spendYen: number;
  applied: number;
  won: number;
  rate: number | null;
  wonDays: number;
  wonMembers: number;
  /** The group with the most 当選枚数: picks the card style when it is left on 自動. */
  topGroup: MiguriGroupId | null;
  oshiType: string;
  ranking: Array<{ name: string; won: number }>;
  /** 当選枚数 per month (per year across several years), up to today. */
  series: { title: string; bars: Array<{ label: string; won: number }> };
};


/**
 * 当選枚数 by month (or by year when 全期間 spans several years). Only dates up to today: a future month would show the schedule.
 * Months in between with no win are 0, so the bars keep their calendar spacing.
 */
export function wonSeries(entries: CardEntry[], period: MiguriPeriod, today: string): MiguriShareCard['series'] {
  const rows = entries
    .filter(isMiguriLotteryResult)
    .map((entry) => ({ date: entry.date, won: lotteryResultCounts(entry).won }))
    .filter((row) => yearOf(row.date) !== null && row.date <= today && row.won > 0);
  const byYear = period === 'all' && new Set(rows.map((row) => row.date.slice(0, 4))).size > 1;
  const sums = new Map<number, number>();
  for (const row of rows) {
    const key = byYear ? Number(row.date.slice(0, 4)) : Number(row.date.slice(0, 4)) * 12 + Number(row.date.slice(5, 7)) - 1;
    sums.set(key, (sums.get(key) ?? 0) + row.won);
  }
  const keys = [...sums.keys()];
  const bars: Array<{ label: string; won: number }> = [];
  for (let key = Math.min(...keys); key <= Math.max(...keys); key += 1) {
    bars.push({ label: byYear ? String(key) : `${(key % 12) + 1}月`, won: sums.get(key) ?? 0 });
  }
  return { title: byYear ? '年ごとの当選枚数' : '月ごとの当選枚数', bars };
}

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
  const wonByGroup = new Map<MiguriGroupId, number>();
  for (const entry of entries.filter(isMiguriLotteryResult)) {
    if (entry.group) wonByGroup.set(entry.group, (wonByGroup.get(entry.group) ?? 0) + lotteryResultCounts(entry).won);
  }
  const topGroup = [...wonByGroup.entries()].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const groups = new Set(entries.map((entry) => entry.group).filter(Boolean));
  const only = group !== 'all' ? group : groups.size === 1 ? ([...groups][0] as MiguriGroupId) : null;
  const ja = miguriTranslator('ja'), spent = dashboard.totalPaidSpendYen > 0;
  return {
    period,
    title: period === 'all' ? ['これまでの', 'ミーグリ'] : [`${period}年`, 'ミーグリまとめ'],
    scope: [only ? GROUP_NAMES[only] : 'すべてのグループ', category].filter(Boolean).join(' · '),
    range: dates.length ? `${dates[0].replaceAll('-', '.')} – ${dates[dates.length - 1].replaceAll('-', '.')}` : null,
    spendYen: Math.round(dashboard.totalPaidSpendYen),
    applied: dashboard.totalApplied,
    won: dashboard.totalWon,
    rate: dashboard.totalApplied > 0 ? dashboard.winRate : null,
    wonMembers: won.size,
    topGroup,
    wonDays: new Set(entries.filter((entry) => yearOf(entry.date) !== null && entryLotteryCounts(entry).won > 0).map((entry) => entry.date)).size,
    // Without prices the shares fall back to ticket counts, and 推しタイプ (a spend concentration) would say DD.
    oshiType: spent ? ja(`oshi_${dashboard.oshiType}` as Parameters<typeof ja>[0]) : '—',
    ranking: [...won.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ja'))
      .slice(0, 3)
      .map(([name, count]) => ({ name, won: count })),
    series: wonSeries(entries, period, today),
  };
}

export const pct = (value: number) => `${Math.round(value * 100)}%`;
const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`;

/** The post that goes with the image. Japanese, like the card. */
export function miguriShareText(card: MiguriShareCard, showSpend: boolean): string {
  return [
    card.title.join(''),
    `応募 ${card.applied}枚 → 当選 ${card.won}枚${card.rate === null ? '' : `（当選率 ${pct(card.rate)}）`}`,
    showSpend && card.spendYen > 0 ? `支払総額 ${yen(card.spendYen)}` : null,
    '#ミーグリまとめ',
    'https://46log.com/miguri',
  ].filter(Boolean).join('\n');
}

// ---- 画像 -------------------------------------------------------------------------------

const SANS = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","Noto Sans CJK JP",sans-serif';
const SERIF = `"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","Noto Serif CJK JP",${SANS}`;
const ROUND = `"Hiragino Maru Gothic ProN","Zen Maru Gothic",${SANS}`;
const MONO = `"SF Mono",Menlo,Consolas,"Liberation Mono",${SANS}`;
export const W = 1080;
export const H = 1350;
export const PAD = 72;
export const INNER = W - PAD * 2;

export const MIGURI_SHARE_STYLES = ['sakura', 'nogi', 'hinata', 'receipt', 'forest', 'sunny', 'swiss', 'night'] as const;
export type MiguriShareStyleId = (typeof MIGURI_SHARE_STYLES)[number];
/** 'auto' follows the group with the most 当選枚数. */
export type MiguriShareStyle = MiguriShareStyleId | 'auto';

type Strip = { kind: 'gradient'; from: string; to: string } | { kind: 'blocks'; color: string; on: number; off: number } | { kind: 'stripes'; a: string; b: string; size: number } | { kind: 'solid'; color: string };
export type Theme = {
  bg: string; ink: string; muted: string; panel: string | null; acc: string; hi: string; lo: string; track: string; line: string; onAcc: string;
  titleColor: string; brandColor: string;
  radius: number; lineWidth: number; dashed: boolean; marker: 'dot' | 'box' | 'square';
  body: string; title: string; num: string; strip: Strip; stripH: number;
};

const base = { onAcc: '#ffffff', radius: 36, lineWidth: 2, dashed: false, marker: 'dot' as const, body: SANS, title: SANS, num: SANS, stripH: 14 };
const THEMES: Record<MiguriShareStyleId, Theme> = {
  sakura: { ...base, bg: '#fffafb', ink: '#3b1f2a', muted: '#8d6674', panel: '#fdeaef', acc: '#d6456b', hi: '#d6456b', lo: '#f5c6d2', track: '#f8dde4', line: '#f1c9d3', titleColor: '#d6456b', brandColor: '#d6456b', title: SERIF, strip: { kind: 'gradient', from: '#f7b2c4', to: '#d6456b' } },
  nogi: { ...base, bg: '#fbf9fd', ink: '#2a1530', muted: '#7b6585', panel: '#f0e7f5', acc: '#7a2a8c', hi: '#7a2a8c', lo: '#d9c0e3', track: '#eadff0', line: '#dcc9e6', titleColor: '#7a2a8c', brandColor: '#7a2a8c', title: SERIF, strip: { kind: 'gradient', from: '#b27ac2', to: '#742581' } },
  hinata: { ...base, bg: '#f7fbfe', ink: '#10283a', muted: '#5d7d92', panel: '#e3f2fb', acc: '#0a8fd0', hi: '#0a8fd0', lo: '#b4dcf1', track: '#d6ebf7', line: '#bfe0f1', titleColor: '#0a8fd0', brandColor: '#0a8fd0', body: ROUND, title: ROUND, strip: { kind: 'gradient', from: '#7fd0f2', to: '#0a8fd0' } },
  receipt: { ...base, bg: '#fdfdfb', ink: '#161616', muted: '#6a6a66', panel: null, acc: '#161616', hi: '#e03a22', lo: '#bdbdb6', track: '#e6e6e0', line: '#161616', titleColor: '#161616', brandColor: '#161616', radius: 0, lineWidth: 3, dashed: true, marker: 'box', num: MONO, strip: { kind: 'blocks', color: '#161616', on: 18, off: 12 } },
  forest: { ...base, bg: '#124036', ink: '#f6f3ea', muted: '#9fc4b6', panel: '#1a5547', acc: '#ffb13b', hi: '#ffb13b', lo: '#3d8672', track: '#24634f', line: '#2d705d', onAcc: '#124036', titleColor: '#ffb13b', brandColor: '#ffb13b', radius: 44, body: ROUND, title: ROUND, strip: { kind: 'gradient', from: '#ffb13b', to: '#ff7a3b' } },
  sunny: { ...base, bg: '#ffdc4a', ink: '#2a1d00', muted: '#7a5d00', panel: '#fff6c9', acc: '#e8531a', hi: '#e8531a', lo: '#ffbf3a', track: '#ffe99a', line: '#2a1d00', titleColor: '#e8531a', brandColor: '#2a1d00', radius: 48, lineWidth: 3, body: ROUND, title: ROUND, strip: { kind: 'stripes', a: '#e8531a', b: '#2a1d00', size: 36 } },
  swiss: { ...base, bg: '#ffffff', ink: '#0d0d0d', muted: '#5b5b5b', panel: '#f0f0f0', acc: '#0d0d0d', hi: '#e30613', lo: '#cfcfcf', track: '#e4e4e4', line: '#0d0d0d', titleColor: '#e30613', brandColor: '#0d0d0d', radius: 0, lineWidth: 6, marker: 'square', stripH: 30, strip: { kind: 'solid', color: '#0d0d0d' } },
  night: { ...base, bg: '#1b181a', ink: '#f6eef0', muted: '#a8979c', panel: '#2a2528', acc: '#ff8fab', hi: '#ff8fab', lo: '#5a4650', track: '#3a3237', line: '#3a3237', onAcc: '#1b181a', titleColor: '#ff8fab', brandColor: '#ff8fab', strip: { kind: 'gradient', from: '#ff8fab', to: '#ffc9d6' } },
};
const GROUP_STYLE: Record<MiguriGroupId, MiguriShareStyleId> = { sakurazaka: 'sakura', nogizaka: 'nogi', hinatazaka: 'hinata' };

export const themeOf = (style: MiguriShareStyle, card: Pick<MiguriShareCard, 'topGroup'>): Theme => THEMES[resolveMiguriShareStyle(style, card)];

export function resolveMiguriShareStyle(style: MiguriShareStyle, card: Pick<MiguriShareCard, 'topGroup'>): MiguriShareStyleId {
  return style !== 'auto' ? style : card.topGroup ? GROUP_STYLE[card.topGroup] : 'sakura';
}

export type Ctx = CanvasRenderingContext2D;

/** Largest size ≤ `size` (down to `min`) at which the text fits; ellipsized if even `min` overflows. */
function fit(ctx: Ctx, text: string, maxWidth: number, weight: number, size: number, family: string, min = size * 0.6) {
  for (let s = size; s >= min; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return text;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

export type TextOptions = { weight?: number; size?: number; color?: string; align?: CanvasTextAlign; max?: number; family?: string };

export function draw(ctx: Ctx, text: string, x: number, y: number, { weight = 700, size = 32, color = '#000', align = 'left', max = INNER, family = SANS }: TextOptions = {}) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(fit(ctx, text, max, weight, size, family), x, y);
  ctx.textAlign = 'left';
}

export function box(ctx: Ctx, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(radius, h / 2, w / 2));
}

export function drawStrip(ctx: Ctx, theme: Theme) {
  const { strip, stripH } = theme;
  if (strip.kind === 'gradient') {
    const band = ctx.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, strip.from);
    band.addColorStop(1, strip.to);
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, stripH);
  } else if (strip.kind === 'solid') {
    ctx.fillStyle = strip.color;
    ctx.fillRect(0, 0, W, stripH);
  } else if (strip.kind === 'blocks') {
    ctx.fillStyle = strip.color;
    for (let x = 0; x < W; x += strip.on + strip.off) ctx.fillRect(x, 0, strip.on, stripH);
  } else {
    for (let x = 0, i = 0; x < W; x += strip.size, i += 1) {
      ctx.fillStyle = i % 2 ? strip.b : strip.a;
      ctx.fillRect(x, 0, strip.size, stripH);
    }
  }
}

export function rule(ctx: Ctx, theme: Theme, y: number) {
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = theme.lineWidth;
  ctx.setLineDash(theme.dashed ? [12, 9] : []);
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

export async function renderMiguriShareImage(card: MiguriShareCard, showSpend: boolean, style: MiguriShareStyle = 'auto'): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const theme = THEMES[resolveMiguriShareStyle(style, card)];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.lang = 'ja'; // Japanese glyph forms even when the page is zh-CN
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  if ('lang' in ctx) (ctx as Ctx & { lang: string }).lang = 'ja';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  drawStrip(ctx, theme);
  const text = (value: string, x: number, y: number, options: TextOptions = {}) => draw(ctx, value, x, y, { color: theme.ink, family: theme.body, ...options });

  text('46log MIGURI', PAD, 108, { size: 28, color: theme.brandColor, weight: 800 });
  text(card.period === 'all' ? 'ALL TIME' : String(card.period), W - PAD, 108, { size: 28, color: theme.muted, weight: 800, align: 'right', family: theme.num });
  text(card.title[0], PAD, 226, { size: 92, color: theme.titleColor, weight: 900, family: theme.title });
  text(card.title[1], PAD, 326, { size: 92, weight: 900, family: theme.title });
  text([card.range, card.scope].filter(Boolean).join(' · '), PAD, 382, { size: 30, color: theme.muted, weight: 500 });

  // 当選 / 当選率
  box(ctx, PAD, 420, INNER, 300, theme.radius);
  if (theme.panel) {
    ctx.fillStyle = theme.panel;
    ctx.fill();
  } else {
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 9]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  text('当選', PAD + 44, 484, { size: 30, color: theme.muted });
  const wonText = String(card.won);
  text(wonText, PAD + 40, 628, { size: 150, weight: 900, family: theme.num, max: 520 });
  const wonWidth = Math.min(ctx.measureText(wonText).width, 520);
  text('枚', PAD + 48 + wonWidth, 628, { size: 48, weight: 800 });
  text('当選率', W - PAD - 44, 484, { size: 30, color: theme.muted, align: 'right' });
  text(card.rate === null ? '—' : pct(card.rate), W - PAD - 44, 604, { size: 104, weight: 900, color: theme.hi, align: 'right', max: 360, family: theme.num });
  text(`応募 ${card.applied}枚 · 当選した日 ${card.wonDays}日`, PAD + 44, 668, { size: 28, color: theme.muted, weight: 600, max: INNER - 88 });
  text([`当選メンバー ${card.wonMembers}人`, card.oshiType !== '—' ? card.oshiType : null].filter(Boolean).join(' · '), PAD + 44, 704, { size: 28, color: theme.muted, weight: 600, max: INNER - 88 });

  // 当選枚数ランキング
  text('当選枚数ランキング', PAD, 792, { size: 32, weight: 800 });
  if (showSpend && card.spendYen > 0) text(`支払総額 ${yen(card.spendYen)}`, W - PAD, 792, { size: 28, weight: 800, align: 'right', color: theme.muted, max: 460, family: theme.num });
  const most = Math.max(1, ...card.ranking.map((row) => row.won));
  const barX = PAD + 360, barW = W - PAD - 150 - barX;
  card.ranking.forEach((row, index) => {
    const y = 814 + index * 58;
    if (theme.marker === 'dot') {
      ctx.fillStyle = theme.acc;
      ctx.beginPath();
      ctx.arc(PAD + 22, y + 22, 22, 0, Math.PI * 2);
      ctx.fill();
    } else {
      box(ctx, PAD + 1, y + 1, 42, 42, 0);
      if (theme.marker === 'square') {
        ctx.fillStyle = theme.acc;
        ctx.fill();
      } else {
        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    text(String(index + 1), PAD + 22, y + 32, { size: 26, color: theme.marker === 'box' ? theme.ink : theme.onAcc, weight: 800, align: 'center', family: theme.num });
    text(row.name, PAD + 64, y + 34, { size: 32, weight: 700, max: barX - PAD - 84 });
    ctx.fillStyle = theme.track;
    box(ctx, barX, y + 10, barW, 24, theme.radius / 3);
    ctx.fill();
    ctx.fillStyle = theme.acc;
    box(ctx, barX, y + 10, Math.max(24, (row.won / most) * barW), 24, theme.radius / 3);
    ctx.fill();
    text(`${row.won}枚`, W - PAD, y + 34, { size: 32, weight: 800, align: 'right', max: 140, family: theme.num });
  });
  if (!card.ranking.length) text('当選はまだありません', PAD, 846, { size: 28, color: theme.muted, weight: 500 });

  // 月ごと / 年ごと
  const { bars } = card.series;
  if (bars.length > 1) {
    text(card.series.title, PAD, 1040, { size: 28, weight: 800 });
    const top = Math.max(1, ...bars.map((bar) => bar.won));
    const gap = 16, barWidth = (INNER - gap * (bars.length - 1)) / bars.length, floor = 1226, maxHeight = 112;
    const peak = bars.findIndex((bar) => bar.won === top);
    bars.forEach((bar, index) => {
      const x = PAD + index * (barWidth + gap), height = Math.max(6, (bar.won / top) * maxHeight);
      ctx.fillStyle = index === peak ? theme.hi : theme.lo;
      box(ctx, x, floor - height, barWidth, height, theme.radius / 3);
      ctx.fill();
      ctx.fillRect(x, floor - Math.min(height, 8), barWidth, Math.min(height, 8)); // flat foot; only the top corners are round
      if (index === peak) text(String(bar.won), x + barWidth / 2, floor - height - 12, { size: 26, weight: 800, color: theme.hi, align: 'center', family: theme.num, max: barWidth + gap });
      text(bar.label, x + barWidth / 2, floor + 34, { size: 22, weight: 700, color: theme.muted, align: 'center', max: barWidth + gap });
    });
  }

  rule(ctx, theme, 1290);
  text('46log.com/miguri', PAD, 1328, { size: 26, color: theme.brandColor, weight: 800 });
  text('forTUNE music・Meets の記録から集計', W - PAD, 1328, { size: 22, color: theme.muted, weight: 500, align: 'right', max: 560 });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
