// 年間ふりかえり (2026-10-27): one year of 握手会 / ライブ / サイン会 as a 1080×1350 card, in the same styles as the まとめ card.
// Only what happened up to today counts, so a recap posted in December never shows a January date. Money is not on this card.
import type { MiguriGroupId } from '@/utils/auth-api';
import { isMiguriLotteryResult, lotteryResultCounts, entryLotteryCounts } from './meguri-helpers.ts';
import { box, draw, drawStrip, H, INNER, PAD, pct, rule, themeOf, W, wonSeries, yearOf, type CardEntry, type MiguriShareCard, type MiguriShareStyle, type TextOptions } from './miguri-share.ts';

/** Seconds of talk per ticket, as the person gave them: online 9s; in person Tokyo about 6s, Kyoto about 8s. Estimates, shown as 約. */
export const TALK_SECONDS = { online: 9, tokyo: 6, kyoto: 8 } as const;
/** One サイン会 sign-in takes about 2 minutes. */
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
  const signLots = signed.reduce((sum, entry) => sum + entryLotteryCounts(entry).won, 0);
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
    minutes: Math.round(seconds / 60 + signLots * SIGN_MINUTES),
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
  box(ctx, PAD, 420, INNER, 220, theme.radius);
  fill();
  text('ミーグリとサイン会で話した時間（目安）', PAD + 44, 480, { size: 28, color: theme.muted });
  text(`約 ${hoursOf(card.minutes)}`, PAD + 40, 596, { size: 112, weight: 900, family: theme.num, max: INNER - 80 });

  // 数字のタイル
  const tiles: Array<[string, string, string]> = [
    ['ライブ', card.live === null ? '—' : String(card.live), '本'],
    ['サイン会', String(card.signEvents), '回'],
    ['ミーグリ（オンライン）', String(card.onlineDays), '日'],
    ['リアミ', String(card.realDays), '日'],
    ['当選', String(card.won), '枚'],
    ['当選率', card.rate === null ? '—' : pct(card.rate).replace('%', ''), card.rate === null ? '' : '%'],
  ];
  const tileW = (INNER - 24) / 2, tileH = 120;
  tiles.forEach(([label, value, unit], index) => {
    const x = PAD + (index % 2) * (tileW + 24), y = 668 + Math.floor(index / 2) * (tileH + 16);
    box(ctx, x, y, tileW, tileH, theme.radius * 0.7);
    fill();
    text(label, x + 32, y + 40, { size: 24, color: theme.muted, weight: 700, max: tileW - 64 });
    text(value, x + 32, y + 100, { size: 64, weight: 900, family: theme.num, max: tileW - 120 });
    const width = (() => { ctx.font = `900 64px ${theme.num}`; return Math.min(ctx.measureText(value).width, tileW - 120); })();
    if (unit) text(unit, x + 40 + width, y + 100, { size: 28, weight: 800, color: theme.muted });
  });

  // 一番当選した人
  if (card.topMember) text(`いちばん当選した人：${card.topMember.name}（${card.topMember.won}枚）`, PAD, 1096, { size: 30, weight: 800, max: INNER });

  const { bars } = card.series;
  if (bars.length > 1) {
    const top = Math.max(1, ...bars.map((bar) => bar.won));
    const gap = 16, barWidth = (INNER - gap * (bars.length - 1)) / bars.length, floor = 1226, maxHeight = 90;
    const peak = bars.findIndex((bar) => bar.won === top);
    bars.forEach((bar, index) => {
      const x = PAD + index * (barWidth + gap), height = Math.max(6, (bar.won / top) * maxHeight);
      ctx.fillStyle = index === peak ? theme.hi : theme.lo;
      box(ctx, x, floor - height, barWidth, height, theme.radius / 3);
      ctx.fill();
      ctx.fillRect(x, floor - Math.min(height, 8), barWidth, Math.min(height, 8));
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
