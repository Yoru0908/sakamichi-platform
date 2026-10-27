// 年間ふりかえり (2026-10-27): one year of 握手会 / ライブ / サイン会 as a 1080×1350 card, in the same styles as the まとめ card.
// Only what happened up to today counts, so a recap posted in December never shows a January date. Money is not on this card.
import type { MiguriGroupId } from '@/utils/auth-api';
import { isMiguriLotteryResult, lotteryResultCounts, entryLotteryCounts } from './meguri-helpers.ts';
import { box, draw, drawStrip, H, INNER, PAD, pct, rule, themeOf, W, wonSeries, yearOf, type CardEntry, type MiguriShareCard, type MiguriShareStyle, type TextOptions } from './miguri-share.ts';

/** Seconds of talk per ticket, as the person gave them: online 9s; in person Tokyo about 6s, Kyoto about 8s. Estimates, shown as 約. */
export const TALK_SECONDS = { online: 9, tokyo: 6, kyoto: 8 } as const;
/** One signing (one member at one サイン会) takes about 2 minutes. The 口 count is how many were applied for, so it is not used. */
export const SIGN_MINUTES = 2;

export type MiguriRecapCard = {
  year: number;
  /** Lives marked in 参加ログ; null when the log could not be read (signed out, offline). */
  live: number | null;
  onlineDays: number;
  realDays: number;
  signEvents: number;
  won: number;
  applied: number;
  rate: number | null;
  minutes: number;
  topMember: { name: string; won: number } | null;
  topGroup: MiguriGroupId | null;
  series: MiguriShareCard['series'];
};

type RecapEntry = CardEntry & { eventSlug?: string | null; eventTitle?: string | null; venue?: string | null; source?: string; group?: MiguriGroupId | null };

const kindOf = (entry: RecapEntry) => (entry.category === 'サイン会' ? 'sign' : entry.category === 'リアミ' ? 'real' : 'online');

export function talkSecondsPerTicket(entry: RecapEntry): number {
  if (kindOf(entry) !== 'real') return TALK_SECONDS.online;
  return /京都|kyoto/i.test(entry.venue ?? '') ? TALK_SECONDS.kyoto : TALK_SECONDS.tokyo;
}

const NOT_A_LIVE = /ミーグリ|ミート|握手|サイン会|リアミ|Meet|オンライン/i;

/** 参加ログ records of that year that are marked as attended (not planned) and are not a 握手会 / サイン会. */
export function countAttendedLives(records: Array<{ id: string; date: string; title: string }>, year: number, today: string): number {
  return new Set(records.filter((record) => yearOf(record.date) === year && record.date <= today && !NOT_A_LIVE.test(record.title)).map((record) => record.id)).size;
}

export function buildMiguriRecapCard({ entries, year, live, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) }: {
  entries: RecapEntry[];
  year: number;
  live: number | null;
  today?: string;
}): MiguriRecapCard {
  const own = entries.filter((entry) => yearOf(entry.date) === year);
  const results = own.filter(isMiguriLotteryResult);
  let applied = 0, won = 0, seconds = 0;
  const memberWon = new Map<string, number>();
  const groupWon = new Map<MiguriGroupId, number>();
  const days = { online: new Set<string>(), real: new Set<string>() };
  for (const entry of results) {
    const counts = lotteryResultCounts(entry);
    applied += counts.applied;
    won += counts.won;
    if (counts.won > 0) {
      memberWon.set(entry.member, (memberWon.get(entry.member) ?? 0) + counts.won);
      if (entry.group) groupWon.set(entry.group, (groupWon.get(entry.group) ?? 0) + counts.won);
    }
    if (counts.won > 0 && entry.date <= today) {
      days[kindOf(entry) === 'real' ? 'real' : 'online'].add(entry.date);
      seconds += counts.won * talkSecondsPerTicket(entry);
    }
  }
  const signed = own.filter((entry) => kindOf(entry) === 'sign' && entry.date <= today && entryLotteryCounts(entry).won > 0);
  const signEvents = new Set(signed.map((entry) => `${entry.eventSlug ?? entry.eventTitle ?? ''}|${entry.date}`)).size;
  const signings = new Set(signed.map((entry) => `${entry.eventSlug ?? entry.eventTitle ?? ''}|${entry.date}|${entry.member}`)).size;
  const top = [...memberWon.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))[0];
  const topGroup = [...groupWon.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    year,
    live,
    onlineDays: days.online.size,
    realDays: days.real.size,
    signEvents,
    won,
    applied,
    rate: applied > 0 ? won / applied : null,
    minutes: Math.round(seconds / 60 + signings * SIGN_MINUTES),
    topMember: top ? { name: top[0], won: top[1] } : null,
    topGroup,
    series: wonSeries(entries, year, today),
  };
}

const hoursOf = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60}分` : `${minutes}分`);

export function miguriRecapText(card: MiguriRecapCard): string {
  return [
    `${card.year}年のミーグリふりかえり`,
    [card.live === null ? null : `ライブ ${card.live}本`, `ミーグリ ${card.onlineDays + card.realDays}日`, card.signEvents ? `サイン会 ${card.signEvents}回` : null].filter(Boolean).join(' · '),
    `当選 ${card.won}枚 · 話した時間 約${hoursOf(card.minutes)}`,
    '#ミーグリまとめ',
    'https://46log.com/miguri',
  ].join('\n');
}

export async function renderMiguriRecapImage(card: MiguriRecapCard, style: MiguriShareStyle = 'auto'): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const theme = themeOf(style, card);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.lang = 'ja';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  if ('lang' in ctx) (ctx as typeof ctx & { lang: string }).lang = 'ja';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  drawStrip(ctx, theme);
  const text = (value: string, x: number, y: number, options: TextOptions = {}) => draw(ctx, value, x, y, { color: theme.ink, family: theme.body, ...options });
  const fill = () => {
    if (theme.panel) {
      ctx.fillStyle = theme.panel;
      ctx.fill();
      return;
    }
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 9]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  text('46log MIGURI', PAD, 108, { size: 28, color: theme.brandColor, weight: 800 });
  text(String(card.year), W - PAD, 108, { size: 28, color: theme.muted, weight: 800, align: 'right', family: theme.num });
  text(`${card.year}年の`, PAD, 226, { size: 92, color: theme.titleColor, weight: 900, family: theme.title });
  text('ふりかえり', PAD, 326, { size: 92, weight: 900, family: theme.title });
  text('ミーグリ・ライブ・サイン会の記録から', PAD, 382, { size: 30, color: theme.muted, weight: 500 });

  // 話した時間
  box(ctx, PAD, 420, INNER, 180, theme.radius);
  fill();
  text('ミーグリとサイン会で話した時間（目安）', PAD + 44, 474, { size: 28, color: theme.muted });
  text(`約 ${hoursOf(card.minutes)}`, PAD + 40, 570, { size: 96, weight: 900, family: theme.num, max: INNER - 80 });

  // 数字のタイル
  const tiles: Array<{ label: string; value: string; unit?: string; right?: string; size?: number }> = [
    { label: 'ライブ', value: card.live === null ? '—' : String(card.live), unit: '本' },
    { label: 'サイン会', value: String(card.signEvents), unit: '回' },
    { label: 'ミーグリ（オンライン）', value: String(card.onlineDays), unit: '日' },
    { label: 'リアミ', value: String(card.realDays), unit: '日' },
    { label: '当選', value: String(card.won), unit: '枚', right: card.rate === null ? undefined : `当選率 ${pct(card.rate)}` },
    { label: 'いちばん当選した人', value: card.topMember?.name ?? '—', right: card.topMember ? `${card.topMember.won}枚` : undefined, size: 44 },
  ];
  const tileW = (INNER - 24) / 2, tileH = 128;
  tiles.forEach(({ label, value, unit, right, size = 60 }, index) => {
    const x = PAD + (index % 2) * (tileW + 24), y = 624 + Math.floor(index / 2) * (tileH + 14);
    box(ctx, x, y, tileW, tileH, theme.radius * 0.7);
    fill();
    text(label, x + 32, y + 40, { size: 24, color: theme.muted, weight: 700, max: tileW - 64 });
    const rightWidth = right ? 150 : 0;
    text(value, x + 32, y + 100, { size, weight: 900, family: theme.num, max: tileW - 64 - rightWidth - (unit ? 40 : 0) });
    if (unit) {
      ctx.font = `900 ${size}px ${theme.num}`;
      const width = Math.min(ctx.measureText(value).width, tileW - 64 - rightWidth - 40);
      text(unit, x + 40 + width, y + 100, { size: 28, weight: 800, color: theme.muted });
    }
    if (right) text(right, x + tileW - 32, y + 100, { size: 28, weight: 800, color: theme.muted, align: 'right', max: rightWidth });
  });

  const { bars } = card.series;
  if (bars.length > 1) {
    text(card.series.title, PAD, 1092, { size: 26, weight: 800 });
    const top = Math.max(1, ...bars.map((bar) => bar.won));
    const gap = 16, barWidth = (INNER - gap * (bars.length - 1)) / bars.length, floor = 1246, maxHeight = 100;
    const peak = bars.findIndex((bar) => bar.won === top);
    bars.forEach((bar, index) => {
      const x = PAD + index * (barWidth + gap), height = Math.max(6, (bar.won / top) * maxHeight);
      ctx.fillStyle = index === peak ? theme.hi : theme.lo;
      box(ctx, x, floor - height, barWidth, height, theme.radius / 3);
      ctx.fill();
      ctx.fillRect(x, floor - Math.min(height, 8), barWidth, Math.min(height, 8));
      if (index === peak) text(String(bar.won), x + barWidth / 2, floor - height - 10, { size: 24, weight: 800, color: theme.hi, align: 'center', family: theme.num, max: barWidth + gap });
      text(bar.label, x + barWidth / 2, floor + 30, { size: 22, weight: 700, color: theme.muted, align: 'center', max: barWidth + gap });
    });
  }

  rule(ctx, theme, 1290);
  text('46log.com/miguri', PAD, 1328, { size: 26, color: theme.brandColor, weight: 800 });
  text('話した時間は 1枚あたりの目安秒数から計算', W - PAD, 1328, { size: 22, color: theme.muted, weight: 500, align: 'right', max: 560 });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
